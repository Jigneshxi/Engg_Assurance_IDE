import time
import subprocess
import os
import json
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult, ToolArtifact, VulnerabilityResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any
import tempfile

@ToolRegistry.register
class NpmAuditAdapter(BaseToolAdapter):
    name = "npm_audit"
    category = "security"

    @property
    def execution_mode(self):
        from backend.api.models import AdapterExecutionMode
        return AdapterExecutionMode.TOOL_AUGMENTED

    @classmethod
    def get_version(cls) -> str:
        try:
            res = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=5)
            return res.stdout.strip() if res.returncode == 0 else "unknown"
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
            os.path.abspath(os.path.join(os.getcwd(), "mission_workspaces"))
        ]
        
        abs_target_dir = os.path.abspath(target_dir) if target_dir else ""
        
        is_safe = any(abs_target_dir.startswith(prefix) for prefix in safe_prefixes)
        if not is_safe or not target_dir:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error=f"Security Guard: npm audit can only run in safe sandbox directories, not '{target_dir}'."
            )
            
        try:
            cmd = ["npm", "audit", "--json"]
            process = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, timeout=30)
            
            # npm audit returns 0 if no vulns, non-zero if vulns exist
            success = process.returncode == 0 or process.returncode > 0
            
            output_json = {}
            try:
                output_json = json.loads(process.stdout)
            except json.JSONDecodeError:
                pass
                
            metadata = output_json.get("metadata", {}).get("vulnerabilities", {})
            vuln_result = VulnerabilityResult(
                critical=metadata.get("critical", 0),
                high=metadata.get("high", 0),
                medium=metadata.get("medium", 0),
                low=metadata.get("low", 0),
                findings=[]
            )
            
            tmp_path = os.path.join(tempfile.gettempdir(), f"npm_audit_{int(time.time())}.json")
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(process.stdout)

            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=success,
                duration_ms=duration_ms,
                summary=vuln_result.model_dump(),
                artifacts=[ToolArtifact(
                    artifact_type="audit_report",
                    artifact_name="npm_audit.json",
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
                error="npm audit execution timed out after 30 seconds."
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error=str(e)
            )
