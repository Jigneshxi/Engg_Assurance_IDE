import time
import subprocess
import os
import re
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any, List

# Directories whose changes represent elevated risk
_HIGH_RISK_PREFIXES = (
    "auth", "authentication", "authorization",
    "payment", "billing", "checkout",
    "security", "crypto", "encryption",
    "database", "db", "migration", "migrations",
    "config", "infrastructure", "deploy",
    "core", "kernel", "middleware",
)


@ToolRegistry.register
class GitDiffAdapter(BaseToolAdapter):
    name = "git_diff"
    category = "regression"

    @property
    def execution_mode(self):
        from backend.api.models import AdapterExecutionMode
        return AdapterExecutionMode.TOOL_AUGMENTED

    @classmethod
    def get_version(cls) -> str:
        try:
            res = subprocess.run(["git", "--version"], capture_output=True, text=True, timeout=5)
            return res.stdout.strip().replace("git version ", "") if res.returncode == 0 else "unknown"
        except Exception:
            return "unknown"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return bool(context.repository_url)

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload

        target_dir = payload.get("target_dir", "")
        base_ref = payload.get("base_ref", "main")
        target_ref = payload.get("target_ref", "HEAD")

        safe_prefixes = [
            "/tmp",
            "C:\\temp",
            os.path.abspath(os.path.join(os.getcwd(), "mission_workspaces")),
        ]
        abs_target_dir = os.path.abspath(target_dir) if target_dir else ""
        is_safe = any(abs_target_dir.startswith(prefix) for prefix in safe_prefixes)
        if not is_safe or not target_dir:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error=f"Security Guard: git diff can only run in safe sandbox directories, not '{target_dir}'.",
            )

        try:
            diff_range = f"{base_ref}...{target_ref}"

            # Get stat summary
            stat_cmd = ["git", "diff", "--stat", diff_range]
            stat_proc = subprocess.run(stat_cmd, cwd=target_dir, capture_output=True, text=True, timeout=15)

            # Get changed file names
            names_cmd = ["git", "diff", "--name-only", diff_range]
            names_proc = subprocess.run(names_cmd, cwd=target_dir, capture_output=True, text=True, timeout=15)

            changed_files = [f.strip() for f in names_proc.stdout.splitlines() if f.strip()]

            # Parse insertions / deletions from stat summary
            insertions = 0
            deletions = 0
            stat_lines = stat_proc.stdout.splitlines()
            if stat_lines:
                last_line = stat_lines[-1]
                ins_match = re.search(r"(\d+)\s+insertion", last_line)
                del_match = re.search(r"(\d+)\s+deletion", last_line)
                if ins_match:
                    insertions = int(ins_match.group(1))
                if del_match:
                    deletions = int(del_match.group(1))

            # Classify file types
            file_types: Dict[str, int] = {}
            for f in changed_files:
                ext = os.path.splitext(f)[1] or "(no extension)"
                file_types[ext] = file_types.get(ext, 0) + 1

            # Detect high-risk modules
            high_risk: List[str] = []
            for f in changed_files:
                parts = f.replace("\\", "/").split("/")
                for part in parts:
                    if part.lower() in _HIGH_RISK_PREFIXES and part not in high_risk:
                        high_risk.append(part)

            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=True,
                duration_ms=duration_ms,
                summary={
                    "files_changed": len(changed_files),
                    "insertions": insertions,
                    "deletions": deletions,
                    "high_risk_modules": high_risk,
                    "file_types": file_types,
                    "base_ref": base_ref,
                    "target_ref": target_ref,
                },
            )
        except subprocess.TimeoutExpired:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error="git diff execution timed out after 15 seconds.",
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name, success=False, duration_ms=duration_ms, error=str(e)
            )
