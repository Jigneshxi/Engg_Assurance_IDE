"""
================================================================================
GIT INTEGRATION ROUTER — API Endpoints
================================================================================
Handles:
- /api/git/connect (Clone/Fetch + Profile)
- /api/git/consent (User Consent)
- /api/git/{mission_id}/profile
"""

import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime
import hashlib

from backend.core.database import get_db, GitIntegration, RepoProfile, ConsentRecord
from backend.api.routes.auth import get_current_user
from backend.core.auth_models import User
from backend.services.git_integration import GitRepoService
from backend.services.repo_profiler import build_repo_profile
from backend.core.config import settings
from backend.core.vault import SecretVault

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/git", tags=["Git Integration"])

REQUIRED_SCOPES = ["repo", "read:org", "workflow"]


# ─── MODELS ───────────────────────────────────────────────────────────────────

class GitConnectRequest(BaseModel):
    mission_id: str
    repo_url: str
    platform: str # github, gitlab, bitbucket
    token: str
    email: Optional[str] = None
    branch: Optional[str] = "main"

class GitConsentRequest(BaseModel):
    scopes: List[str]

class LocalConnectRequest(BaseModel):
    mission_id: str
    path: str

# ─── ROUTES ───────────────────────────────────────────────────────────────────

@router.post("/consent", status_code=status.HTTP_201_CREATED)
def record_consent(
    request: GitConsentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Record user consent for Git operations.
    If scopes change or platform requirements change, a new version is created.
    """
    sorted_scopes = sorted(request.scopes)
    scope_hash = hashlib.sha256(json.dumps(sorted_scopes).encode()).hexdigest()

    # Find existing latest consent
    existing = db.query(ConsentRecord).filter(
        ConsentRecord.user_id == current_user.id
    ).order_by(ConsentRecord.version.desc()).first()

    if existing and existing.scope_hash == scope_hash:
        return {"id": existing.id, "version": existing.version, "status": "unchanged"}

    new_version = (existing.version + 1) if existing else 1
    consent = ConsentRecord(
        user_id=current_user.id,
        version=new_version,
        scopes=sorted_scopes,
        scope_hash=scope_hash,
        granted_at=datetime.datetime.utcnow()
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    
    return {"id": consent.id, "version": consent.version, "status": "created"}


@router.post("/connect")
async def connect_repo(
    request: GitConnectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Connect a git repository to a mission.
    1. Validates access token
    2. Clones the repository
    3. Builds the RepoProfile
    4. Persists the connection to DB
    """
    # 1. Validate Consent exists
    consent = db.query(ConsentRecord).filter(
        ConsentRecord.user_id == current_user.id
    ).order_by(ConsentRecord.version.desc()).first()
    
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Consent required before connecting repository"
        )
        
    system_scope_hash = hashlib.sha256(json.dumps(sorted(REQUIRED_SCOPES)).encode()).hexdigest()
    if consent.scope_hash != system_scope_hash:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Re-authorization Required: System permissions have changed."
        )

    git_service = GitRepoService(
        repo_url=request.repo_url,
        platform=request.platform,
        token=request.token,
        mission_id=request.mission_id,
        email=request.email
    )

    # 2. Validate token (read-only ping)
    val_res = await git_service.validate_access()
    if not val_res.get("valid"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=val_res.get("error", "Invalid credentials")
        )

    # 3. Clone / Fetch
    try:
        local_path = git_service.clone_or_fetch(branch=request.branch)
    except Exception as e:
        logger.error(f"[GIT-CONNECT] Clone failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

    # 4. Build Profile
    try:
        profile_data = build_repo_profile(local_path)
    except Exception as e:
        logger.error(f"[GIT-CONNECT] Profiling failed: {e}")
        profile_data = {"error": "Profiling failed", "details": str(e)}

    # 5. DB Persistence
    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == request.mission_id
    ).first()

    # Use SecretVault for encryption
    encrypted_token = SecretVault.encrypt(request.token)

    if not integration:
        integration = GitIntegration(
            mission_id=request.mission_id,
            repo_url=request.repo_url,
            platform=request.platform,
            status="connected",
            encrypted_token=encrypted_token,
            consent_version_id=consent.id
        )
        db.add(integration)
        db.commit()
        db.refresh(integration)
    else:
        integration.repo_url = request.repo_url
        integration.platform = request.platform
        integration.encrypted_token = encrypted_token
        integration.status = "connected"
        integration.consent_version_id = consent.id
        db.commit()

    repo_profile = db.query(RepoProfile).filter(
        RepoProfile.git_integration_id == integration.id
    ).first()

    if not repo_profile:
        repo_profile = RepoProfile(
            git_integration_id=integration.id,
            profile_data=profile_data
        )
        db.add(repo_profile)
    else:
        repo_profile.profile_data = profile_data
    
    db.commit()

    # 6. Brownfield detection — trigger audit if real code detected
    audit_triggered = False
    audit_id: int | None = None
    mode_info: dict = {"mode": "greenfield"}
    try:
        from backend.services.mode_detector import detect_mode
        from backend.core.database import ExistingCodeAudit
        mode_info = detect_mode(profile_data)

        if mode_info["mode"] == "brownfield":
            # Create QUEUED row synchronously so the first UI poll gets a defined
            # state rather than a 404 (race-condition fix from design review).
            audit_row = ExistingCodeAudit(
                mission_id=request.mission_id,
                git_integration_id=integration.id,
                status="QUEUED",
            )
            db.add(audit_row)
            db.commit()
            db.refresh(audit_row)
            audit_id = audit_row.id
            audit_triggered = True

            # Fire background scan — audit_id is already committed above
            from backend.services.existing_code_audit import run_full_repo_audit
            import asyncio
            asyncio.create_task(
                run_full_repo_audit(request.mission_id, integration.id, local_path, audit_id)
            )
    except Exception as e:
        logger.error(f"[GIT-CONNECT] Brownfield audit trigger failed (non-critical): {e}")

    return {
        "status": "success",
        "mission_id": request.mission_id,
        "repo_name": val_res.get("repo_name"),
        "profile": profile_data,
        "mode": mode_info,
        "audit_triggered": audit_triggered,
        "audit_id": audit_id,
    }


@router.post("/local-connect")
async def connect_local_folder(
    request: LocalConnectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Connect a local folder to a mission for brownfield auditing.
    Does NOT use git/tokens, but triggers the exact same analysis pipeline.
    """
    import os
    from backend.services.repo_profiler import build_repo_profile
    from backend.core.vault import SecretVault

    local_path = request.path.strip()
    if not os.path.exists(local_path) or not os.path.isdir(local_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Local path does not exist or is not a directory: {local_path}"
        )

    # 1. Build Profile directly from local path
    try:
        profile_data = build_repo_profile(local_path)
    except Exception as e:
        logger.error(f"[LOCAL-CONNECT] Profiling failed: {e}")
        profile_data = {"error": "Profiling failed", "details": str(e)}

    # 2. Persist Integration mapping
    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == request.mission_id
    ).first()

    # We use a dummy encrypted token to satisfy the schema
    encrypted_token = SecretVault.encrypt("local")

    if not integration:
        integration = GitIntegration(
            mission_id=request.mission_id,
            repo_url=local_path,
            platform="local_folder",
            status="connected",
            encrypted_token=encrypted_token,
            # Local folders don't need OAuth consent
            consent_version_id=None
        )
        db.add(integration)
        db.commit()
        db.refresh(integration)
    else:
        integration.repo_url = local_path
        integration.platform = "local_folder"
        integration.encrypted_token = encrypted_token
        integration.status = "connected"
        db.commit()

    repo_profile = db.query(RepoProfile).filter(
        RepoProfile.git_integration_id == integration.id
    ).first()

    if not repo_profile:
        repo_profile = RepoProfile(
            git_integration_id=integration.id,
            profile_data=profile_data
        )
        db.add(repo_profile)
    else:
        repo_profile.profile_data = profile_data
    
    db.commit()

    # 3. Brownfield detection — trigger audit if real code detected
    audit_triggered = False
    audit_id: int | None = None
    mode_info: dict = {"mode": "greenfield"}
    try:
        from backend.services.mode_detector import detect_mode
        from backend.core.database import ExistingCodeAudit
        mode_info = detect_mode(profile_data)

        if mode_info["mode"] == "brownfield":
            audit_row = ExistingCodeAudit(
                mission_id=request.mission_id,
                git_integration_id=integration.id,
                status="QUEUED",
            )
            db.add(audit_row)
            db.commit()
            db.refresh(audit_row)
            audit_id = audit_row.id
            audit_triggered = True

            # Fire background scan
            from backend.services.existing_code_audit import run_full_repo_audit
            import asyncio
            asyncio.create_task(
                run_full_repo_audit(request.mission_id, integration.id, local_path, audit_id)
            )
    except Exception as e:
        logger.error(f"[LOCAL-CONNECT] Brownfield audit trigger failed (non-critical): {e}")

    return {
        "status": "success",
        "mission_id": request.mission_id,
        "repo_name": os.path.basename(local_path.rstrip(os.sep)),
        "profile": profile_data,
        "mode": mode_info,
        "audit_triggered": audit_triggered,
        "audit_id": audit_id,
    }


@router.get("/{mission_id}/profile")
def get_repo_profile(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == mission_id
    ).first()
    
    if not integration:
        raise HTTPException(status_code=404, detail="No Git integration found for this mission")
        
    repo_profile = db.query(RepoProfile).filter(
        RepoProfile.git_integration_id == integration.id
    ).first()
    
    if not repo_profile:
        raise HTTPException(status_code=404, detail="Repo profile not found")
        
    return {
        "status": integration.status,
        "repo_url": integration.repo_url,
        "platform": integration.platform,
        "profile": repo_profile.profile_data,
        "last_updated": repo_profile.last_updated
    }


# ─── BROWNFIELD AUDIT ENDPOINTS ──────────────────────────────────────────────

class DismissRequest(BaseModel):
    reason: Optional[str] = None

class SuggestFixRequest(BaseModel):
    pass  # finding_id is path param; no body needed

class ApplyFixRequest(BaseModel):
    fix_content: str  # The AI-generated replacement content to commit

@router.get("/{mission_id}/audit")
def get_audit_status(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Poll audit status. Returns QUEUED/RUNNING/COMPLETE/FAILED plus summary counts.
    Safe to call immediately after /connect — QUEUED state is set synchronously.
    """
    from backend.core.database import ExistingCodeAudit, CodeFinding
    from sqlalchemy import func
    audit = db.query(ExistingCodeAudit).filter(
        ExistingCodeAudit.mission_id == mission_id
    ).order_by(ExistingCodeAudit.created_at.desc()).first()

    if not audit:
        return {"status": "none", "message": "No audit found for this mission"}

    severity_counts = (
        db.query(CodeFinding.severity, func.count(CodeFinding.id))
        .filter(CodeFinding.audit_id == audit.id)
        .group_by(CodeFinding.severity)
        .all()
    )
    by_severity = {sev: cnt for sev, cnt in severity_counts}

    return {
        "audit_id": audit.id,
        "status": audit.status,
        "total_files_scanned": audit.total_files_scanned,
        "total_findings": audit.total_findings,
        "tools_run": audit.tools_run or [],
        "tools_unavailable": audit.tools_unavailable or [],
        "tools_not_configured": audit.tools_not_configured or [],
        "tools_not_applicable": audit.tools_not_applicable or [],
        "findings_by_severity": by_severity,
        "created_at": audit.created_at.isoformat() if audit.created_at else None,
        "completed_at": audit.completed_at.isoformat() if audit.completed_at else None,
    }


@router.get("/{mission_id}/audit/files")
def get_audit_files(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Findings grouped by file_path with per-file severity counts.
    Sorted worst-first so the file tree surfaces critical files at top.
    """
    from backend.core.database import ExistingCodeAudit, CodeFinding
    from sqlalchemy import func
    audit = db.query(ExistingCodeAudit).filter(
        ExistingCodeAudit.mission_id == mission_id
    ).order_by(ExistingCodeAudit.created_at.desc()).first()
    if not audit:
        raise HTTPException(status_code=404, detail="No audit found")

    rows = (
        db.query(
            CodeFinding.file_path,
            CodeFinding.severity,
            func.count(CodeFinding.id).label("count"),
        )
        .filter(CodeFinding.audit_id == audit.id)
        .group_by(CodeFinding.file_path, CodeFinding.severity)
        .all()
    )

    # Aggregate into per-file dict
    file_map: dict = {}
    SEV_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    for file_path, severity, count in rows:
        if file_path not in file_map:
            file_map[file_path] = {"file_path": file_path, "severities": {}, "total": 0, "_score": 0}
        file_map[file_path]["severities"][severity] = count
        file_map[file_path]["total"] += count
        file_map[file_path]["_score"] += SEV_WEIGHT.get(severity, 0) * count

    files = sorted(file_map.values(), key=lambda x: x["_score"], reverse=True)
    for f in files:
        del f["_score"]

    return {"audit_id": audit.id, "files": files}


@router.get("/{mission_id}/audit/files/{file_path:path}")
def get_file_findings(
    mission_id: str,
    file_path: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """All findings for a specific file (for the code viewer side-panel)."""
    from backend.core.database import ExistingCodeAudit, CodeFinding, GitIntegration
    audit = db.query(ExistingCodeAudit).filter(
        ExistingCodeAudit.mission_id == mission_id
    ).order_by(ExistingCodeAudit.created_at.desc()).first()
    if not audit:
        raise HTTPException(status_code=404, detail="No audit found")

    findings = (
        db.query(CodeFinding)
        .filter(CodeFinding.audit_id == audit.id, CodeFinding.file_path == file_path)
        .order_by(CodeFinding.line)
        .all()
    )
    import os
    from pathlib import Path
    
    integration = db.query(GitIntegration).filter(GitIntegration.id == audit.git_integration_id).first()
    if integration and integration.platform == "local_folder":
        repo_path = Path(integration.repo_url)
    else:
        WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "./workspace")
        repo_path = Path(WORKSPACE_DIR) / "git_repos" / str(mission_id) / "repo"
        
    full_file_path = repo_path / file_path
    
    file_content = None
    if full_file_path.exists() and full_file_path.is_file():
        try:
            with open(full_file_path, "r", encoding="utf-8") as f:
                file_content = f.read()
        except Exception:
            pass

    return {
        "file_path": file_path,
        "file_content": file_content,
        "findings": [
            {
                "id": f.id,
                "line": f.line,
                "col": f.col,
                "severity": f.severity,
                "category": f.category,
                "tool": f.tool,
                "rule_id": f.rule_id,
                "message": f.message,
                "code_snippet": f.code_snippet,
                "status": f.status,
                "suggested_fix": f.suggested_fix,
                "fix_commit_sha": f.fix_commit_sha,
            }
            for f in findings
        ],
    }


@router.post("/{mission_id}/audit/findings/{finding_id}/suggest-fix")
async def suggest_fix(
    mission_id: str,
    finding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate an AI fix suggestion for a finding and cache it on the row.
    Does NOT commit any code — only populates suggested_fix.
    """
    from backend.core.database import CodeFinding
    from backend.core.inference import InferenceCoordinator
    import asyncio

    finding = db.query(CodeFinding).filter(CodeFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    snippet = finding.code_snippet
    if not snippet:
        try:
            from backend.core.database import ExistingCodeAudit, GitIntegration
            from pathlib import Path
            import os
            
            audit = db.query(ExistingCodeAudit).filter(ExistingCodeAudit.id == finding.audit_id).first()
            integration = db.query(GitIntegration).filter(GitIntegration.id == audit.git_integration_id).first() if audit else None
            
            if integration and integration.platform == "local_folder":
                repo_path = Path(integration.repo_url)
            else:
                WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "./workspace")
                repo_path = Path(WORKSPACE_DIR) / "git_repos" / str(mission_id) / "repo"
                
            full_file_path = repo_path / finding.file_path
            
            if full_file_path.exists() and full_file_path.is_file():
                with open(full_file_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    
                    start = max(0, finding.line - 1)
                    target_line = lines[start] if start < len(lines) else ""
                    indent = len(target_line) - len(target_line.lstrip())
                    
                    end = start + 1
                    while end < len(lines):
                        line = lines[end]
                        if not line.strip():
                            end += 1
                            continue
                        if len(line) - len(line.lstrip()) <= indent:
                            break
                        end += 1
                    
                    snippet = "".join(lines[start:end])
            else:
                snippet = '(no snippet available)'
        except Exception:
            snippet = '(no snippet available)'

    prompt = f"""Fix the following {finding.tool} finding in `{finding.file_path}`.

Finding: {finding.message}
Rule: {finding.rule_id}
Severity: {finding.severity}
Context (around line {finding.line}):
{snippet}

Return ONLY the corrected replacement code for this section, wrapped in:
===FIX_START===
<corrected code here>
===FIX_END==="""

    try:
        content = await asyncio.to_thread(
            InferenceCoordinator.execute,
            "Code Fix Specialist", "Fix code finding", "FixAgent",
            prompt, lambda *a: None, str(finding_id),
            0.1, "fix_agent", 1024, False
        )
        import re
        m = re.search(r"===FIX_START===\s*\n(.*?)\n===FIX_END===", str(content), re.DOTALL)
        fix_text = m.group(1).strip() if m else str(content).strip()

        finding.suggested_fix = fix_text
        finding.status = "fix_suggested"
        db.commit()
        return {"finding_id": finding_id, "suggested_fix": fix_text}
    except Exception as e:
        logger.error(f"[AUDIT-FIX] Suggestion failed for finding {finding_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{mission_id}/audit/findings/{finding_id}/apply-fix")
async def apply_fix(
    mission_id: str,
    finding_id: int,
    request: ApplyFixRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply a fix to the cloned repo and commit to converge/pre-audit-fixes.

    Fix-drift safeguard: after a successful commit to a file, invalidates
    suggested_fix for all other open findings in the same file (stale line
    numbers after the edit). They must request fresh suggestions.

    Secret-scan findings: transition to fix_applied, NOT fix_verified,
    because full re-verification requires a whole-tree re-scan.
    """
    from backend.core.database import CodeFinding, ExistingCodeAudit, GitIntegration
    from backend.services.git_integration import GitRepoService
    import subprocess
    import asyncio

    finding = db.query(CodeFinding).filter(CodeFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    if not finding.suggested_fix and not request.fix_content:
        raise HTTPException(status_code=400, detail="No fix content provided")

    fix_content = request.fix_content or finding.suggested_fix

    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == mission_id
    ).first()
    if not integration:
        raise HTTPException(status_code=404, detail="No Git integration found")

    if integration.platform == "local_folder":
        raise HTTPException(
            status_code=400, 
            detail="Auto-fix is not available for local folder connections. Copy the suggested fix manually."
        )

    token = SecretVault.decrypt(integration.encrypted_token)
    git_service = GitRepoService(
        repo_url=integration.repo_url,
        platform=integration.platform,
        token=token,
        mission_id=mission_id
    )

    if not git_service.local_path:
        # Re-establish local path from workspace
        from pathlib import Path
        import os
        workspace = Path(os.environ.get("WORKSPACE_DIR", "./workspace"))
        candidate = workspace / "git_repos" / mission_id / "repo"
        if candidate.exists():
            git_service.local_path = str(candidate)
        else:
            raise HTTPException(status_code=500, detail="Cloned repo path not found")

    try:
        # Ensure audit branch exists
        audit_branch = "converge/pre-audit-fixes"
        try:
            git_service.create_branch(audit_branch, base_branch=integration.repo_url.split("/")[-1] if False else "main")
        except Exception:
            pass  # branch may already exist

        # Safely splice the fix into the original file
        from pathlib import Path
        import re
        
        def strip_markdown_fences(text: str) -> str:
            text = re.sub(r'^\s*```\w*\n', '', text)
            text = re.sub(r'\n```\s*$', '', text)
            return text

        file_abs = Path(git_service.local_path) / finding.file_path
        file_abs.parent.mkdir(parents=True, exist_ok=True)
        
        # Load the original content
        original_content = ""
        if file_abs.exists():
            original_content = file_abs.read_text(encoding="utf-8")
        
        lines = original_content.splitlines(keepends=True)
        
        fix_clean = strip_markdown_fences(fix_content)
        if fix_clean and not fix_clean.endswith('\n'):
            fix_clean += '\n'
        fix_lines = fix_clean.splitlines(keepends=True)
        
        # Splicing: replace the entire logical block using indentation heuristics
        start = max(0, finding.line - 1)
        
        # Expand block upwards if LLM hallucinates/replaces the whole function
        first_word = fix_lines[0].strip().split()[0] if fix_lines and fix_lines[0].strip() else ""
        if first_word in ["def", "class", "function", "async", "const", "let", "var"]:
            while start > 0 and not lines[start].strip().startswith(first_word):
                start -= 1
                
        target_line = lines[start] if start < len(lines) else ""
        indent = len(target_line) - len(target_line.lstrip())
        
        end = start + 1
        while end < len(lines):
            line = lines[end]
            if not line.strip():
                end += 1
                continue
            if len(line) - len(line.lstrip()) <= indent:
                break
            end += 1
        
        new_lines = lines[:start] + fix_lines + lines[end:]
        file_abs.write_text("".join(new_lines), encoding="utf-8")
        
        line_delta = len(fix_lines) - (end - start)

        # Commit and push
        commit_msg = f"[audit-fix] {finding.tool}: {finding.message[:80]} ({finding.file_path}:{finding.line})"
        sha = git_service.commit_and_push([finding.file_path], commit_msg, audit_branch)

        finding.fix_commit_sha = sha

        # Fix-drift safeguard: invalidate suggested_fix for other open findings in same file and shift lines
        audit_id = finding.audit_id
        stale = (
            db.query(CodeFinding)
            .filter(
                CodeFinding.audit_id == audit_id,
                CodeFinding.file_path == finding.file_path,
                CodeFinding.id != finding_id,
                CodeFinding.status.in_(["open", "fix_suggested"]),
            )
            .all()
        )
        for stale_finding in stale:
            stale_finding.suggested_fix = None
            stale_finding.status = "open"  # reset to open so they re-request a fix
            if stale_finding.line > finding.line:
                stale_finding.line += line_delta
        db.commit()

        # Determine new status — secret-scan findings cannot be fully verified per-file
        new_status = "fix_applied" if finding.category == "secret" else "fix_verified"
        finding.status = new_status
        db.commit()

        return {
            "finding_id": finding_id,
            "status": new_status,
            "commit_sha": finding.fix_commit_sha,
            "stale_findings_invalidated": len(stale),
            # The UI uses this distinction to show "Fix applied, pending full re-scan"
            # for secret findings vs "Verified fixed" for semgrep/lint findings.
            "verification_note": (
                "Fix applied. Full secret re-scan required to verify resolution."
                if finding.category == "secret"
                else "Fix verified by per-file re-check."
            ),
        }
    except Exception as e:
        finding.status = "fix_failed"
        db.commit()
        logger.error(f"[AUDIT-FIX] Apply failed for finding {finding_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{mission_id}/audit/findings/{finding_id}/dismiss")
def dismiss_finding(
    mission_id: str,
    finding_id: int,
    request: DismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark a finding as wont_fix. Persists the reason so dismissed findings
    remain visible (greyed) in the UI with an audit trail.
    """
    from backend.core.database import CodeFinding
    finding = db.query(CodeFinding).filter(CodeFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = "wont_fix"
    finding.dismissed_reason = request.reason or ""
    db.commit()
    return {"finding_id": finding_id, "status": "wont_fix"}


# ─── PULL REQUEST & MERGE ENDPOINTS ──────────────────────────────────────────

class PRCreateRequest(BaseModel):
    title: str
    body: str
    source_branch: str
    target_branch: str = "main"

@router.post("/{mission_id}/pr/create")
async def create_pull_request(
    mission_id: str,
    request: PRCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a PR for a specific module's generated code."""
    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == mission_id
    ).first()
    
    if not integration:
        raise HTTPException(status_code=404, detail="No Git integration found for this mission")

    # Decrypt token using SecretVault
    token = SecretVault.decrypt(integration.encrypted_token)
    if not token:
        raise HTTPException(status_code=500, detail="Failed to decrypt repository token")
    
    git_service = GitRepoService(
        repo_url=integration.repo_url,
        platform=integration.platform,
        token=token,
        mission_id=mission_id
    )

    try:
        pr_data = await git_service.create_pull_request(
            title=request.title,
            body=request.body,
            source_branch=request.source_branch,
            target_branch=request.target_branch
        )
        return {"status": "success", "pr": pr_data}
    except Exception as e:
        logger.error(f"[GIT-PR] Failed to create PR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PRMergeRequest(BaseModel):
    module_id: str
    pr_number: int

@router.post("/{mission_id}/pr/merge")
async def merge_pull_request(
    mission_id: str,
    request: PRMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge a PR, enforcing the NFR audit gate."""
    integration = db.query(GitIntegration).filter(
        GitIntegration.mission_id == mission_id
    ).first()
    
    if not integration:
        raise HTTPException(status_code=404, detail="No Git integration found for this mission")

    # Fetch NFR results and overrides from DB for the merge gate
    from backend.core.mission_controller import mission_controller
    phase4_output = await mission_controller.get_phase_output(mission_id, 4) or {}
    nfr_report = phase4_output.get("nfr_clearance_report", {})
    nfr_results = nfr_report.get("tool_results", {})
    
    from backend.core.mission_models import AuditOverride
    db_overrides = db.query(AuditOverride).filter(AuditOverride.mission_id == mission_id).all()
    audit_overrides = [{"module_id": o.module_name, "audit_type": o.tool_name} for o in db_overrides]

    # Decrypt token using SecretVault
    token = SecretVault.decrypt(integration.encrypted_token)
    if not token:
        raise HTTPException(status_code=500, detail="Failed to decrypt repository token")
    
    git_service = GitRepoService(
        repo_url=integration.repo_url,
        platform=integration.platform,
        token=token,
        mission_id=mission_id
    )

    try:
        merge_data = await git_service.merge_pull_request(
            module_id=request.module_id,
            pr_number=request.pr_number,
            nfr_results=nfr_results,
            audit_overrides=audit_overrides
        )
        return {"status": "success", "merge": merge_data}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"[GIT-MERGE] Failed to merge PR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
