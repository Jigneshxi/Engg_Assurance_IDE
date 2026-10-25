import time
import subprocess
import os
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult, ToolArtifact
import tempfile
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

@ToolRegistry.register
class ESLintAdapter(BaseToolAdapter):
    name = "eslint"
    category = "automation"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        # Requires a repository url or code to have been checked out
        return bool(context.repository_url)

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload
        
        # Security Guard: Only run in safe directories
        target_dir = payload.get("target_dir", "")
        # Get absolute paths for comparison
        safe_prefixes = [
            "/tmp", 
            "C:\\temp", 
            os.path.abspath(os.path.join(os.getcwd(), "mission_workspaces"))
        ]
        
        abs_target_dir = os.path.abspath(target_dir) if target_dir else ""
        
        is_safe = any(abs_target_dir.startswith(prefix) for prefix in safe_prefixes)
        if not is_safe or not target_dir:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error=f"Security Guard: ESLint can only run in safe sandbox directories, not '{target_dir}'."
            )
            
        try:
            # We assume eslint is installed in the target directory or globally
            cmd = ["npx", "eslint", ".", "--format", "json"]
            process = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, timeout=30)
            
            # ESLint returns 0 for no errors, 1 for errors
            success = process.returncode == 0
            
            tmp_path = os.path.join(tempfile.gettempdir(), f"eslint_{int(time.time())}.json")
            with open(tmp_path, "w") as f:
                f.write(process.stdout)

            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=success,
                duration_ms=duration_ms,
                summary={
                    "status": "Linting Passed" if success else "Linting Failed",
                    "return_code": process.returncode
                },
                artifacts=[ToolArtifact(
                    artifact_type="lint_report",
                    artifact_name="eslint_report.json",
                    path=tmp_path,
                    size=os.path.getsize(tmp_path)
                )]
            )
        except subprocess.TimeoutExpired:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error="ESLint execution timed out after 30 seconds."
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error=str(e)
            )
