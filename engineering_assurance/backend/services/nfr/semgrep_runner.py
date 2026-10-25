import asyncio
import json
import logging
import os
import shutil
from typing import Dict, Any
from pathlib import Path
from backend.services.nfr.base_runner import ToolRunner

logger = logging.getLogger(__name__)

class SemgrepRunner(ToolRunner):
    """
    Executes Semgrep for static application security testing (SAST).
    """
    
    def __init__(self, mission_id: str, runtime_config: Dict[str, Any], output_dir: str):
        super().__init__(mission_id, runtime_config, timeout_seconds=180, max_retries=1)
        self.output_dir = Path(output_dir)
        
        # Default to standard mission codebase path if not explicitly provided
        provided_dir = runtime_config.get("codebase_dir")
        if provided_dir:
            self.codebase_dir = provided_dir
        else:
            workspace = Path(os.environ.get("WORKSPACE_DIR", "./workspace"))
            self.codebase_dir = str((workspace / "missions" / mission_id / "codebase").resolve())
            
        self.report_path = self.output_dir / "raw" / "semgrep.json"
        
    async def validate(self) -> Dict[str, Any]:
        """Check if semgrep is installed and codebase exists."""
        if not shutil.which("semgrep"):
            return {"tool": self.tool_name, "available": False, "reason": "semgrep executable not found"}
        
        if not self.codebase_dir or not Path(self.codebase_dir).exists():
            return {"tool": self.tool_name, "available": False, "reason": f"Codebase directory not found: {self.codebase_dir}"}
            
        return {"tool": self.tool_name, "available": True}

    async def _run_command(self) -> Any:
        """Run semgrep scan --json"""
        # Ensure output directory exists
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Force UTF-8 encoding and disable metrics/prompts to prevent hangs
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "SEMGREP_SEND_METRICS": "off"}
        
        cmd = f"semgrep scan --json --quiet --metrics=off --config p/default {self.codebase_dir}"
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await process.communicate()
        
        # Decode with errors='replace' to handle any remaining encoding issues
        stdout_str = stdout.decode("utf-8", errors="replace").strip()
        stderr_str = stderr.decode("utf-8", errors="replace").strip()
        
        if not stdout_str or not stdout_str.startswith("{"):
            raise RuntimeError(f"Semgrep failed to produce valid JSON. stderr: {stderr_str}")
            
        with open(self.report_path, "w", encoding="utf-8") as f:
            f.write(stdout_str)
            
        return str(self.report_path)

    async def parse(self) -> Dict[str, Any]:
        """Parse semgrep.json into standardized format"""
        if not self.report_path.exists():
            raise FileNotFoundError("Raw semgrep report not found")
            
        with open(self.report_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            
        findings = raw_data.get("results", [])
        
        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        
        for finding in findings:
            sev = finding.get("extra", {}).get("severity", "INFO").upper()
            if sev == "ERROR":
                counts["high"] += 1
            elif sev == "WARNING":
                counts["medium"] += 1
            elif sev == "INFO":
                counts["low"] += 1
                
        # Basic scoring algorithm (starts at 100)
        score = 100 - (counts["critical"] * 20) - (counts["high"] * 10) - (counts["medium"] * 3) - (counts["low"] * 1)
        score = max(0, score)
        
        parsed = {
            "tool": self.tool_name,
            "status": "COMPLETED",
            "score": score,
            "metrics": counts,
            "duration_ms": 0, # Could calculate this
            "artifacts": [str(self.report_path)]
        }
        
        # Save parsed output
        parsed_path = self.output_dir / "parsed" / "security.json"
        parsed_path.parent.mkdir(parents=True, exist_ok=True)
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)
            
        return parsed

    async def cleanup(self) -> None:
        pass

    async def parse_findings(self) -> list:
        """
        Return per-line, per-file findings for persistence into code_findings table.
        Additive — does not touch the aggregate parse() used by Phase 4.
        """
        if not self.report_path.exists():
            return []
        with open(self.report_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        findings = []
        sev_map = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}
        for r in raw.get("results", []):
            sev_raw = r.get("extra", {}).get("severity", "INFO").upper()
            findings.append({
                "file_path": r.get("path", ""),
                "line": r.get("start", {}).get("line", 0),
                "col": r.get("start", {}).get("col"),
                "severity": sev_map.get(sev_raw, "low"),
                "category": "security",
                "tool": "semgrep",
                "rule_id": r.get("check_id", ""),
                "message": r.get("extra", {}).get("message", ""),
                "code_snippet": r.get("extra", {}).get("lines", ""),
            })
        return findings
