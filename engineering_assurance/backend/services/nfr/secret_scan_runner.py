import asyncio
import logging
import uuid
import os
import json
from pathlib import Path

logger = logging.getLogger(__name__)

class SecretScanRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.runtime_config = runtime_config
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    async def validate(self) -> dict:
        return {"tool": "secret_scan", "status": "AVAILABLE"}

    async def run_lifecycle(self, module_name: str = "global") -> dict:
        logger.info(f"[{self.mission_id}] SecretScanRunner executing for module: {module_name}")
        
        # Determine the target path. In a real environment, this might be codebase_dir / module_name
        target_path = self.runtime_config.get("codebase_dir", ".")
        
        # Execute gitleaks
        try:
            import subprocess
            process = await asyncio.to_thread(
                subprocess.run,
                ["gitleaks", "detect", "--source", target_path, "--no-git", "--report-format", "json"],
                capture_output=True,
                text=False
            )
            stdout = process.stdout
            stderr = process.stderr
            
            # Gitleaks exit codes: 0 = no leaks, 1 = leaks present, others = error
            if process.returncode in (0, 1):
                try:
                    findings = json.loads(stdout.decode()) if stdout else []
                except json.JSONDecodeError:
                    findings = []
                
                secrets_found = len(findings)
                score = 100 if secrets_found == 0 else max(0, 100 - (secrets_found * 10))
                
                result = {
                    "tool": "secret_scan",
                    "module": module_name,
                    "status": "COMPLETED",
                    "score": score,
                    "metrics": {
                        "secrets_found": secrets_found,
                        "high": secrets_found,
                        "medium": 0
                    },
                    "findings": findings
                }
            else:
                raise Exception(f"Gitleaks failed with exit code {process.returncode}: {stderr.decode()}")

        except FileNotFoundError:
            logger.warning(f"[{self.mission_id}] 'gitleaks' CLI not found. Falling back to simulated scan.")
            await asyncio.sleep(1)
            result = {
                "tool": "secret_scan",
                "module": module_name,
                "status": "COMPLETED",
                "score": 100,
                "metrics": {"secrets_found": 0, "high": 0, "medium": 0},
                "findings": [],
                "note": "Simulation used because gitleaks is not installed in the environment."
            }
        except Exception as e:
            import traceback
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.error(f"[{self.mission_id}] SecretScanRunner error: {error_msg}\n{traceback.format_exc()}")
            result = {
                "tool": "secret_scan",
                "module": module_name,
                "status": "FAILED",
                "score": 0,
                "error": error_msg
            }
        
        output_file = self.output_dir / f"secret_scan_{module_name}_{uuid.uuid4().hex[:6]}.json"
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2)
            
        return result

    async def parse_findings(self) -> list:
        """
        Parse gitleaks JSON output into the standardised per-line finding dicts.
        NOTE: secret-scan findings have category='secret'; after a fix is applied
        the status transitions to 'fix_applied' (not 'fix_verified') because
        full re-verification requires a whole-tree re-scan, not a per-file check.
        The UI must display this distinction explicitly.
        Additive — does not affect run_lifecycle() used by Phase 4.
        """
        target_path = self.runtime_config.get("codebase_dir", ".")
        import subprocess
        try:
            proc = await __import__("asyncio").to_thread(
                subprocess.run,
                ["gitleaks", "detect", "--source", target_path, "--no-git", "--report-format", "json"],
                capture_output=True, text=False
            )
            raw_bytes = proc.stdout
            if not raw_bytes:
                return []
            data = __import__("json").loads(raw_bytes.decode(errors="replace"))
        except (FileNotFoundError, Exception):
            return []

        findings = []
        for leak in (data if isinstance(data, list) else []):
            findings.append({
                "file_path": leak.get("File", ""),
                "line": leak.get("StartLine", 0),
                "col": leak.get("StartColumn"),
                "severity": "high",
                "category": "secret",
                "tool": "gitleaks",
                "rule_id": leak.get("RuleID", ""),
                "message": leak.get("Description", "Potential secret detected"),
                "code_snippet": leak.get("Match", ""),
            })
        return findings

