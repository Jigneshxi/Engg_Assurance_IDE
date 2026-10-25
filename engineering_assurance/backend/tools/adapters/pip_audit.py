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
class PipAuditAdapter(BaseToolAdapter):
    name = "pip_audit"
    category = "security"

    @property
    def execution_mode(self):
        from backend.api.models import AdapterExecutionMode
        return AdapterExecutionMode.TOOL_AUGMENTED

    @classmethod
    def get_version(cls) -> str:
        try:
            res = subprocess.run(["pip-audit", "--version"], capture_output=True, text=True, timeout=5)
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
                error=f"Security Guard: pip-audit can only run in safe sandbox directories, not '{target_dir}'."
            )
            
        try:
            cmd = ["pip-audit", "-f", "json"]
            process = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, timeout=30)
            
            # pip-audit returns 0 if no vulns, 1 if vulns exist
            success = process.returncode in (0, 1)
            
            output_json = []
            try:
                output_json = json.loads(process.stdout)
            except json.JSONDecodeError:
                pass
                
            critical = 0
            high = 0
            medium = 0
            low = 0
            
            if isinstance(output_json, list):
                for pkg in output_json:
                    for vuln in pkg.get("vulns", []):
                        # Some OSV records might not have strict severities, or might map them as dicts.
                        sev_data = vuln.get("severity")
                        sev_text = ""
                        if isinstance(sev_data, str):
                            sev_text = sev_data.lower()
                        elif isinstance(sev_data, list) and len(sev_data) > 0 and isinstance(sev_data[0], dict):
                            sev_text = str(sev_data[0].get("score", "")).lower()
                            
                        if "critical" in sev_text or "cr" in sev_text: critical += 1
                        elif "high" in sev_text or "hi" in sev_text: high += 1
                        elif "medium" in sev_text or "md" in sev_text: medium += 1
                        elif "low" in sev_text or "lo" in sev_text: low += 1
                        else:
                            medium += 1 # Default if unknown

            vuln_result = VulnerabilityResult(
                critical=critical,
                high=high,
                medium=medium,
                low=low,
                findings=[]
            )
            
            tmp_path = os.path.join(tempfile.gettempdir(), f"pip_audit_{int(time.time())}.json")
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
                    artifact_name="pip_audit.json",
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
                error="pip-audit execution timed out after 30 seconds."
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                error=str(e)
            )
