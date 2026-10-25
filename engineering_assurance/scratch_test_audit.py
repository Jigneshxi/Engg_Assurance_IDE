import asyncio
import os
import uuid
import sys
from pathlib import Path

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from backend.core.database import SessionLocal, Mission, GitIntegration, ExistingCodeAudit, init_db
from backend.services.existing_code_audit import run_full_repo_audit
from backend.agents.graphs.plan_graph import _generate_plan_batch

async def test_audit_flow():
    init_db()
    mission_id = str(uuid.uuid4())
    print(f"Testing with mission_id: {mission_id}")
    
    # 1. Setup DB state
    with SessionLocal() as db:
        
        # Create git integration
        git = GitIntegration(
            mission_id=mission_id, 
            repo_url="https://github.com/test/repo", 
            platform="github",
            encrypted_token="dummy"
        )
        db.add(git)
        db.commit()
        db.refresh(git)
        
        # Create queued audit row
        audit = ExistingCodeAudit(
            mission_id=mission_id,
            git_integration_id=git.id,
            status="QUEUED"
        )
        db.add(audit)
        db.commit()
        db.refresh(audit)
        audit_id = audit.id
        git_id = git.id
        print(f"Created audit row: {audit_id} in QUEUED state")
        
    # 2. Run the audit runner directly (mimicking the background task)
    # Give it a path to a real directory with at least 1 python file so it's not totally empty
    # We'll point it at backend/services/nfr to scan the runners themselves.
    test_repo_path = str(Path(__file__).parent / "backend" / "services" / "nfr")
    print(f"Running audit against: {test_repo_path}")
    
    # Let's temporarily ensure the tools ARE NOT available by patching the PATH? 
    # The runner runs subprocess commands, so if the CLI tools aren't installed globally, 
    # it will naturally fail. Let's see what happens.
    await run_full_repo_audit(mission_id, git_id, test_repo_path, audit_id)
    
    # 3. Check the DB result
    with SessionLocal() as db:
        audit = db.query(ExistingCodeAudit).filter_by(id=audit_id).first()
        print("\n--- Audit Results ---")
        print(f"Status: {audit.status}")
        print(f"Total Files Scanned: {audit.total_files_scanned}")
        print(f"Total Findings: {audit.total_findings}")
        print(f"Tools Run: {audit.tools_run}")
        print(f"Tools Unavailable: {audit.tools_unavailable}")
        
        if audit.status != "COMPLETE_TOOLS_UNAVAILABLE":
            print("WARNING: Status is not COMPLETE_TOOLS_UNAVAILABLE! Do you have semgrep/flake8 installed?")
    
    # 4. Trigger the plan graph prompt generation to see the injected string
    print("\n--- Phase 2 Prompt Injection Check ---")
    
    # We can invoke _generate_plan_batch with dummy data just to see the prompt string
    # Actually, _generate_plan_batch expects a lot of stuff and runs CrewAI. 
    # Instead, we can just extract the logic we care about, or temporarily patch inference to just print the prompt.
    
    # The logic is right at the top of the plan_graph function, so let's just run it manually:
    existing_audit_summary = None
    try:
        from sqlalchemy import func as _func
        with SessionLocal() as _db:
            _audit = _db.query(ExistingCodeAudit).filter(ExistingCodeAudit.mission_id == str(mission_id)).first()
            if _audit and _audit.status in ("COMPLETE", "COMPLETE_TOOLS_UNAVAILABLE"):
                existing_audit_summary = {
                    "status": _audit.status,
                    "tools_run": _audit.tools_run or [],
                    "tools_unavailable": _audit.tools_unavailable or [],
                    "total_findings": _audit.total_findings,
                    "files_scanned": _audit.total_files_scanned,
                    "by_severity": {},
                }
    except Exception as e:
        print(e)
        
    if existing_audit_summary and existing_audit_summary["status"] == "COMPLETE" and not existing_audit_summary["tools_unavailable"]:
        audit_section = (
            f"## Existing Codebase Audit Results\n"
            f"A code health scan was performed: {existing_audit_summary['files_scanned']} files scanned, "
            f"{existing_audit_summary['total_findings']} findings identified (tools used: {', '.join(existing_audit_summary['tools_run'])}).\n"
        )
    elif existing_audit_summary and existing_audit_summary["tools_unavailable"]:
        audit_section = (
            f"## Existing Codebase Audit\n"
            f"A code health scan was attempted, but the following tools were unavailable in "
            f"this environment and did NOT run: {', '.join(existing_audit_summary['tools_unavailable'])}. "
            f"Findings reported ({existing_audit_summary['total_findings']}) are from {', '.join(existing_audit_summary['tools_run']) or 'no tools'} "
            f"only and are NOT fully representative of code health. Do not treat the absence of "
            f"findings from unavailable tools as a clean bill of health — apply standard "
            f"security and quality constraints as if that category was never scanned.\n\n"
        )
    else:
        audit_section = (
            "## Existing Codebase Audit\n"
            "No pre-generation code health scan was performed for this mission."
        )

    print(f"Constructed audit_section:\n{audit_section}")


if __name__ == "__main__":
    asyncio.run(test_audit_flow())
