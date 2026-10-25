"""
================================================================================
EXISTING CODE AUDIT SERVICE — Brownfield Repo Health Scan
================================================================================
Orchestrates full-repo NFR scans and persists per-line findings into code_findings.

Runner error buckets:
  tools_run            — completed successfully, produced trustworthy findings
  tools_unavailable    — binary not on PATH (FileNotFoundError) or scan crashed
  tools_not_configured — binary works, but project not set up for this tool
                         (e.g., eslint present but jsx-a11y absent, or tsc present
                         but no tsconfig.json, or npm audit with no lockfile)
  tools_not_applicable — tool doesn't apply to this repo's stack at all
                         (e.g., tsc on a pure-Python repo, mypy on a pure-JS repo)
                         NOT attempted — reported as neutral N/A, not an error.

The ExistingCodeAudit row is created with status=QUEUED *before* this service
is called (in the /api/git/connect route), so the first UI poll never sees a
404 race window.
"""

import asyncio
import datetime
import logging
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class ToolUnavailableError(Exception):
    """Raised when a scanning tool's binary/executable is not present on PATH."""
    def __init__(self, tool_name: str, detail: str = ""):
        self.tool_name = tool_name
        super().__init__(f"{tool_name} unavailable: {detail}")


# ---------------------------------------------------------------------------
# Tool Registry
# ---------------------------------------------------------------------------
# Each entry:
#   name     — key written to tools_run / tools_unavailable / etc.
#   runner   — class to instantiate (lazy import keeps startup fast)
#   requires — lambda(stack: dict) -> bool; if False → tools_not_applicable
# ---------------------------------------------------------------------------
def _build_registry():
    from backend.services.nfr.semgrep_runner import SemgrepRunner
    from backend.services.nfr.lint_runner import LintRunner
    from backend.services.nfr.secret_scan_runner import SecretScanRunner
    from backend.services.nfr.radon_runner import RadonRunner
    from backend.services.nfr.mypy_runner import MypyRunner
    from backend.services.nfr.a11y_runner import A11yRunner
    from backend.services.nfr.tsc_runner import TscRunner
    from backend.services.nfr.npm_audit_runner import NpmAuditRunner
    from backend.services.nfr.pip_audit_runner import PipAuditRunner
    from backend.services.nfr.jscpd_runner import JscpdRunner
    from backend.services.nfr.vulture_runner import VultureRunner

    return [
        # Language-agnostic — always attempt
        {"name": "semgrep",       "runner": SemgrepRunner,    "requires": lambda s: True},
        {"name": "secret_scan",   "runner": SecretScanRunner, "requires": lambda s: True},
        {"name": "jscpd",         "runner": JscpdRunner,      "requires": lambda s: True},

        # Python-only tools
        {"name": "lint",          "runner": LintRunner,       "requires": lambda s: s["has_python"]},
        {"name": "radon",         "runner": RadonRunner,      "requires": lambda s: s["has_python"]},
        {"name": "mypy",          "runner": MypyRunner,       "requires": lambda s: s["has_python"]},
        {"name": "vulture",       "runner": VultureRunner,    "requires": lambda s: s["has_python"]},
        {"name": "pip_audit",     "runner": PipAuditRunner,   "requires": lambda s: s["has_pip_manifest"]},

        # JS/TS-only tools
        {"name": "accessibility", "runner": A11yRunner,       "requires": lambda s: s["has_javascript"] or s["has_typescript"]},
        {"name": "tsc",           "runner": TscRunner,        "requires": lambda s: s["has_typescript"]},
        {"name": "npm_audit",     "runner": NpmAuditRunner,   "requires": lambda s: s["has_npm_manifest"]},
    ]


async def run_full_repo_audit(
    mission_id: str,
    git_integration_id: int,
    repo_path: str,
    audit_id: int,
) -> None:
    """
    Background task: scan the full repo with all applicable NFR tools,
    normalise findings, and persist into code_findings.

    Args:
        mission_id: For logging / DB lookup.
        git_integration_id: FK for ExistingCodeAudit.
        repo_path: Absolute path to the cloned repo on disk.
        audit_id: PK of the already-created ExistingCodeAudit row (status=QUEUED).
    """
    from backend.core.database import SessionLocal, ExistingCodeAudit, CodeFinding
    from backend.services.nfr.a11y_runner import ToolNotConfiguredError
    from backend.services.nfr.stack_detector import detect_stack

    logger.info(f"[AUDIT] Starting full-repo scan for mission {mission_id}, audit_id={audit_id}")

    # --- Stack detection pre-pass ---
    stack = detect_stack(repo_path)
    logger.info(f"[AUDIT] Detected stack: {stack}")

    # --- Count scanned source files ---
    source_exts = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".cs", ".rb"}
    ignore_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build"}
    scanned_count = sum(
        1 for p in Path(repo_path).rglob("*")
        if p.is_file()
        and p.suffix.lower() in source_exts
        and not any(part in ignore_dirs for part in p.parts)
    )

    # --- Transition to RUNNING ---
    with SessionLocal() as db:
        audit = db.query(ExistingCodeAudit).filter(ExistingCodeAudit.id == audit_id).first()
        if not audit:
            logger.error(f"[AUDIT] Audit row {audit_id} not found — aborting")
            return
        audit.status = "RUNNING"
        db.commit()

    # --- Shared temp dir for runner output artifacts ---
    output_dir = tempfile.mkdtemp(prefix=f"audit_{mission_id}_")
    runtime_config = {"codebase_dir": repo_path}

    # --- Build registry and partition into applicable / not-applicable ---
    registry = _build_registry()
    applicable = [entry for entry in registry if entry["requires"](stack)]
    not_applicable = [entry["name"] for entry in registry if not entry["requires"](stack)]

    if not_applicable:
        logger.info(f"[AUDIT] Tools not applicable to this stack (skipped): {not_applicable}")

    all_findings = []
    tools_run = []
    tools_unavailable = []
    tools_not_configured = []

    for entry in applicable:
        tool_name = entry["name"]
        runner = entry["runner"](mission_id, runtime_config, output_dir)
        try:
            findings = await runner.parse_findings()

            # Normalise file_path to be relative to repo root
            root = str(Path(repo_path).resolve())
            for f in findings:
                fp = str(Path(f["file_path"]).resolve()) if f.get("file_path") else ""
                if fp.startswith(root):
                    f["file_path"] = fp[len(root):].lstrip("/\\")

            all_findings.extend(findings)
            tools_run.append(tool_name)
            logger.info(f"[AUDIT] {tool_name}: {len(findings)} findings")

        except ToolNotConfiguredError as e:
            tools_not_configured.append(tool_name)
            logger.info(f"[AUDIT] {tool_name} not configured in this project: {e}")

        except FileNotFoundError as e:
            tools_unavailable.append(tool_name)
            logger.error(f"[AUDIT] {tool_name} binary not found — scan NOT performed: {e}")

        except Exception as e:
            tools_unavailable.append(tool_name)
            logger.error(f"[AUDIT] {tool_name} scan failed unexpectedly: {e}", exc_info=True)

    # --- Persist findings and update audit header ---
    try:
        with SessionLocal() as db:
            for f in all_findings:
                db.add(CodeFinding(
                    audit_id=audit_id,
                    file_path=f.get("file_path", ""),
                    line=f.get("line", 0),
                    col=f.get("col"),
                    severity=f.get("severity", "low"),
                    category=f.get("category", "lint"),
                    tool=f.get("tool", "unknown"),
                    rule_id=f.get("rule_id", ""),
                    message=f.get("message", ""),
                    code_snippet=f.get("code_snippet"),
                    status="open",
                ))

            audit_row = db.query(ExistingCodeAudit).filter(ExistingCodeAudit.id == audit_id).first()
            audit_row.total_files_scanned = scanned_count
            audit_row.total_findings = len(all_findings)
            audit_row.tools_run = tools_run
            audit_row.tools_unavailable = tools_unavailable
            audit_row.tools_not_configured = tools_not_configured
            audit_row.tools_not_applicable = not_applicable
            audit_row.status = "COMPLETE_TOOLS_UNAVAILABLE" if not tools_run else "COMPLETE"
            audit_row.completed_at = datetime.datetime.utcnow()
            db.commit()

        logger.info(
            f"[AUDIT] Completed mission={mission_id}: "
            f"{len(all_findings)} findings across {scanned_count} files | "
            f"run={tools_run} unavailable={tools_unavailable} "
            f"not_configured={tools_not_configured} not_applicable={not_applicable}"
        )

    except Exception as e:
        logger.error(f"[AUDIT] Full-repo audit FAILED for mission {mission_id}: {e}", exc_info=True)
        with SessionLocal() as db:
            audit_row = db.query(ExistingCodeAudit).filter(ExistingCodeAudit.id == audit_id).first()
            if audit_row:
                audit_row.status = "FAILED"
                db.commit()
