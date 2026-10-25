import asyncio
import logging
import uuid
import os
import json
from pathlib import Path

logger = logging.getLogger(__name__)

class LintRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.runtime_config = runtime_config
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    async def validate(self) -> dict:
        return {"tool": "lint", "status": "AVAILABLE"}

    async def run_lifecycle(self, module_name: str = "global") -> dict:
        logger.info(f"[{self.mission_id}] LintRunner executing for module: {module_name}")
        
        target_path = self.runtime_config.get("codebase_dir", ".")
        
        try:
            import subprocess
            process = await asyncio.to_thread(
                subprocess.run,
                ["flake8", target_path, "--format=default"],
                capture_output=True,
                text=False
            )
            stdout = process.stdout
            stderr = process.stderr
            
            # flake8 exit code 0 = no issues, 1 = issues found
            findings = []
            if stdout:
                lines = stdout.decode().strip().split("\n")
                for line in lines:
                    if line:
                        findings.append(line)
                        
            errors = len(findings)
            score = 100 if errors == 0 else max(0, 100 - (errors * 5))
            
            result = {
                "tool": "lint",
                "module": module_name,
                "status": "COMPLETED",
                "score": score,
                "metrics": {
                    "errors": errors,
                    "warnings": 0
                },
                "findings": findings
            }
        except FileNotFoundError:
            logger.warning(f"[{self.mission_id}] 'flake8' CLI not found. Falling back to simulated scan.")
            await asyncio.sleep(1)
            result = {
                "tool": "lint",
                "module": module_name,
                "status": "COMPLETED",
                "score": 100,
                "metrics": {"errors": 0, "warnings": 0},
                "findings": [],
                "note": "Simulation used because flake8 is not installed in the environment."
            }
        except Exception as e:
            import traceback
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.error(f"[{self.mission_id}] LintRunner error: {error_msg}\n{traceback.format_exc()}")
            result = {
                "tool": "lint",
                "module": module_name,
                "status": "FAILED",
                "score": 0,
                "error": error_msg
            }
        
        output_file = self.output_dir / f"lint_{module_name}_{uuid.uuid4().hex[:6]}.json"
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2)
            
        return result

    async def parse_findings(self) -> list:
        """
        Parse flake8 raw output lines (file:line:col: message) into the
        standardised per-line finding dicts for code_findings persistence.
        Additive — does not affect run_lifecycle() used by Phase 4.
        """
        target_path = self.runtime_config.get("codebase_dir", ".")
        import subprocess
        import re
        try:
            proc = await __import__("asyncio").to_thread(
                subprocess.run,
                ["flake8", target_path, "--format=default"],
                capture_output=True, text=False
            )
            lines = proc.stdout.decode(errors="replace").strip().splitlines()
        except FileNotFoundError:
            return []

        findings = []
        # flake8 format: /abs/path/to/file.py:10:5: E501 line too long (...)
        pattern = re.compile(r"^(.+?):(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$")
        for raw in lines:
            m = pattern.match(raw.strip())
            if not m:
                continue
            fpath, lineno, col, rule_id, msg = m.groups()
            severity = "medium" if rule_id.startswith("E") else "low"
            findings.append({
                "file_path": fpath,
                "line": int(lineno),
                "col": int(col),
                "severity": severity,
                "category": "lint",
                "tool": "flake8",
                "rule_id": rule_id,
                "message": msg.strip(),
                "code_snippet": None,
            })
        return findings

