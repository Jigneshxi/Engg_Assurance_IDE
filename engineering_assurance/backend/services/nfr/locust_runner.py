import asyncio
import json
import logging
import os
import shutil
from typing import Dict, Any
from pathlib import Path
from backend.services.nfr.base_runner import ToolRunner

logger = logging.getLogger(__name__)

class LocustRunner(ToolRunner):
    """
    Executes Locust for performance/load testing.
    """
    
    def __init__(self, mission_id: str, runtime_config: Dict[str, Any], output_dir: str):
        super().__init__(mission_id, runtime_config, timeout_seconds=120, max_retries=1)
        self.output_dir = Path(output_dir)
        self.backend_url = runtime_config.get("backend_url")
        self.report_prefix = self.output_dir / "raw" / "locust"
        self.locustfile_path = self.output_dir / "raw" / "locustfile.py"
        
    async def validate(self) -> Dict[str, Any]:
        """Check if locust is installed and backend_url is provided."""
        if not shutil.which("locust"):
            return {"tool": self.tool_name, "available": False, "reason": "locust executable not found"}
        
        if not self.backend_url:
            return {"tool": self.tool_name, "available": False, "reason": "backend_url not configured in mission_runtime"}
            
        return {"tool": self.tool_name, "available": True}

    def _generate_locustfile(self):
        """Generates a minimal locustfile.py targeting the root endpoint."""
        content = f"""
from locust import HttpUser, task, between

class QuickstartUser(HttpUser):
    wait_time = between(1, 2)

    @task
    def health_check(self):
        self.client.get("/health", catch_response=True)
"""
        self.locustfile_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.locustfile_path, "w") as f:
            f.write(content)

    async def _run_command(self) -> Any:
        """Run locust headless"""
        self._generate_locustfile()
        
        report_file = Path(f"{self.report_prefix}_stats.json")
        report_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Force UTF-8 encoding for Windows compatibility
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
        
        cmd = (
            f"locust -f {self.locustfile_path} "
            f"--headless -u 10 -r 2 -t 10s "
            f"--json --host {self.backend_url}"
        )
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await process.communicate()
        
        stdout_str = stdout.decode("utf-8", errors="replace").strip()
        
        # Write stdout to file manually instead of shell redirect
        if stdout_str:
            with open(report_file, "w", encoding="utf-8") as f:
                f.write(stdout_str)
        
        if not report_file.exists():
            raise RuntimeError(f"Locust failed to produce report. stderr: {stderr.decode('utf-8', errors='replace')}")
            
        return str(report_file)

    async def parse(self) -> Dict[str, Any]:
        """Parse locust stats into standardized format"""
        report_file = Path(f"{self.report_prefix}_stats.json")
        if not report_file.exists():
            raise FileNotFoundError("Raw locust report not found")
            
        # Try to parse the json output from locust. It outputs a list of stats.
        with open(report_file, "r", encoding="utf-8") as f:
            # Locust --json outputs a list of dicts over time. We take the last one.
            try:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    latest_stats = data[-1]
                elif isinstance(data, dict):
                    latest_stats = data
                else:
                    latest_stats = {}
            except json.JSONDecodeError:
                latest_stats = {}

        metrics = {
            "p95": 0,
            "rps": 0,
            "errors": 0
        }
        
        # If locust outputs aggregate stats, extract them
        if "stats" in latest_stats and len(latest_stats["stats"]) > 0:
            agg = next((s for s in latest_stats["stats"] if s.get("name") == "Aggregated"), None)
            if not agg:
                agg = latest_stats["stats"][0]
            
            metrics["p95"] = agg.get("95%", 0)
            metrics["rps"] = agg.get("current_rps", 0)
            metrics["errors"] = agg.get("num_failures", 0)

        # Basic scoring algorithm
        score = 100
        if metrics["p95"] > 500: score -= 20
        if metrics["p95"] > 1000: score -= 30
        if metrics["errors"] > 0: score -= 50
        score = max(0, score)
        
        parsed = {
            "tool": self.tool_name,
            "status": "COMPLETED",
            "score": score,
            "metrics": metrics,
            "artifacts": [str(report_file)]
        }
        
        parsed_path = self.output_dir / "parsed" / "performance.json"
        parsed_path.parent.mkdir(parents=True, exist_ok=True)
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)
            
        return parsed

    async def cleanup(self) -> None:
        if self.locustfile_path.exists():
            self.locustfile_path.unlink()
