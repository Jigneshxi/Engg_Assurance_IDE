import time
import subprocess
import os
import json
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult, ToolArtifact
from backend.tools.registry import ToolRegistry
from typing import Dict, Any
import tempfile


@ToolRegistry.register
class PytestAdapter(BaseToolAdapter):
    name = "pytest"
    category = "automation"

    @classmethod
    def get_version(cls) -> str:
        try:
            res = subprocess.run(["pytest", "--version"], capture_output=True, text=True, timeout=5)
            # pytest --version outputs "pytest X.Y.Z" on first line
            for line in res.stdout.splitlines():
                if "pytest" in line.lower():
                    parts = line.strip().split()
                    return parts[-1] if parts else "unknown"
            return "unknown"
        except Exception:
            return "unknown"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return bool(context.repository_url)

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload

        target_dir = payload.get("target_dir", "")
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
                error=f"Security Guard: pytest can only run in safe sandbox directories, not '{target_dir}'.",
            )

        # Try JSON report first, fall back to raw stdout
        json_report_path = os.path.join(tempfile.gettempdir(), f"pytest_{int(time.time())}.json")
        try:
            cmd = ["pytest", "--tb=short", "-q", "--json-report", f"--json-report-file={json_report_path}"]
            process = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, timeout=60)
            used_json_report = True
        except (subprocess.TimeoutExpired,):
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error="pytest execution timed out after 60 seconds.",
            )
        except Exception:
            # json-report plugin missing — fall back
            try:
                cmd = ["pytest", "--tb=short", "-q"]
                process = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, timeout=60)
                used_json_report = False
            except subprocess.TimeoutExpired:
                duration_ms = int((time.time() - start_time) * 1000)
                return ToolExecutionResult(
                    tool_name=self.name,
                    success=False,
                    duration_ms=duration_ms,
                    error="pytest execution timed out after 60 seconds.",
                )
            except Exception as e:
                duration_ms = int((time.time() - start_time) * 1000)
                return ToolExecutionResult(
                    tool_name=self.name, success=False, duration_ms=duration_ms, error=str(e)
                )

        success = process.returncode == 0
        passed = 0
        failed = 0
        errors = 0
        skipped = 0
        failures = []

        if used_json_report and os.path.exists(json_report_path):
            try:
                with open(json_report_path, "r", encoding="utf-8") as f:
                    report = json.load(f)
                summary = report.get("summary", {})
                passed = summary.get("passed", 0)
                failed = summary.get("failed", 0)
                errors = summary.get("error", 0)
                skipped = summary.get("skipped", 0)

                for test in report.get("tests", []):
                    if test.get("outcome") == "failed":
                        call_info = test.get("call", {})
                        failures.append({
                            "test": test.get("nodeid", "unknown"),
                            "message": call_info.get("crash", {}).get("message", call_info.get("longrepr", ""))[:200],
                        })
            except Exception:
                used_json_report = False

        if not used_json_report:
            # Parse raw stdout: last line is typically "X passed, Y failed, Z error"
            for line in process.stdout.splitlines():
                lower = line.lower()
                if "passed" in lower or "failed" in lower or "error" in lower:
                    import re
                    m_passed = re.search(r"(\d+)\s+passed", lower)
                    m_failed = re.search(r"(\d+)\s+failed", lower)
                    m_errors = re.search(r"(\d+)\s+error", lower)
                    m_skipped = re.search(r"(\d+)\s+skipped", lower)
                    if m_passed: passed = int(m_passed.group(1))
                    if m_failed: failed = int(m_failed.group(1))
                    if m_errors: errors = int(m_errors.group(1))
                    if m_skipped: skipped = int(m_skipped.group(1))
            # Write raw stdout as artifact
            json_report_path = os.path.join(tempfile.gettempdir(), f"pytest_{int(time.time())}.txt")
            with open(json_report_path, "w", encoding="utf-8") as f:
                f.write(process.stdout)

        total = passed + failed + errors + skipped
        duration_ms = int((time.time() - start_time) * 1000)

        return ToolExecutionResult(
            tool_name=self.name,
            success=success,
            duration_ms=duration_ms,
            summary={
                "passed": passed,
                "failed": failed,
                "errors": errors,
                "skipped": skipped,
                "total": total,
                "failures": failures,
            },
            artifacts=[
                ToolArtifact(
                    artifact_type="test_report",
                    artifact_name="pytest_report.json" if used_json_report else "pytest_output.txt",
                    path=json_report_path,
                    size=os.path.getsize(json_report_path) if os.path.exists(json_report_path) else 0,
                )
            ],
        )
