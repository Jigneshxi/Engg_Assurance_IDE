import asyncio
import json
import logging
import httpx
import time
from typing import Dict, Any, List
from pathlib import Path
from backend.services.nfr.base_runner import ToolRunner

logger = logging.getLogger(__name__)

class ReliabilityRunner(ToolRunner):
    """
    Executes lightweight reliability checks (uptime, health endpoints, response times).
    Tests common health paths and any API endpoints from Phase 2.
    """
    
    def __init__(self, mission_id: str, runtime_config: Dict[str, Any], output_dir: str):
        super().__init__(mission_id, runtime_config, timeout_seconds=30, max_retries=1)
        self.output_dir = Path(output_dir)
        self.backend_url = runtime_config.get("backend_url")
        self.frontend_url = runtime_config.get("frontend_url")
        
    async def validate(self) -> Dict[str, Any]:
        """Check if any URL is provided."""
        if not self.backend_url and not self.frontend_url:
            return {"tool": self.tool_name, "available": False, "reason": "No URLs configured in mission_runtime"}
            
        return {"tool": self.tool_name, "available": True}

    async def _check_endpoint(self, label: str, url: str, method: str = "GET") -> dict:
        """Check a single endpoint and return structured result."""
        start_time = time.time()
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                if method.upper() == "GET":
                    response = await client.get(url)
                else:
                    response = await client.request(method, url)
                    
                rt_ms = int((time.time() - start_time) * 1000)
                # Any response < 500 counts as UP (including 404 — server is alive)
                is_up = response.status_code < 500
                return {
                    "label": label,
                    "url": url,
                    "status": "UP" if is_up else "DOWN",
                    "status_code": response.status_code,
                    "response_time_ms": rt_ms,
                    "passed": is_up
                }
        except Exception as e:
            return {
                "label": label,
                "url": url,
                "status": "DOWN",
                "error": str(e),
                "response_time_ms": int((time.time() - start_time) * 1000),
                "passed": False
            }

    async def _run_command(self) -> Any:
        """Run health checks against known endpoints."""
        checks = []
        
        if self.backend_url:
            base = self.backend_url.rstrip("/")
            # Test well-known health/docs paths
            health_paths = [
                ("Backend Root", f"{base}/"),
                ("Backend Health", f"{base}/health"),
                ("Backend API Health", f"{base}/api/health"),
                ("Backend Docs", f"{base}/docs"),
            ]
            for label, url in health_paths:
                result = await self._check_endpoint(label, url)
                checks.append(result)
                # If we found one that works, skip the rest — server is alive
                if result["passed"]:
                    break
            
        if self.frontend_url:
            base = self.frontend_url.rstrip("/")
            result = await self._check_endpoint("Frontend Root", f"{base}/")
            checks.append(result)
            
        raw_path = self.output_dir / "raw" / "reliability.json"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(checks, f, indent=2)
            
        return str(raw_path)

    async def parse(self) -> Dict[str, Any]:
        """Parse reliability results into standardized format"""
        if not self._raw_output or not Path(self._raw_output).exists():
            raise FileNotFoundError("Raw reliability report not found")
            
        with open(self._raw_output, "r", encoding="utf-8") as f:
            checks = json.load(f)
        
        # Calculate proportional score
        total = len(checks)
        passed = sum(1 for c in checks if c.get("passed"))
        response_times = [c.get("response_time_ms", 0) for c in checks if c.get("passed")]
        avg_rt = round(sum(response_times) / len(response_times)) if response_times else 0
        max_rt = max(response_times) if response_times else 0
        
        # Proportional uptime — not all-or-nothing
        uptime_pct = round(passed / total * 100, 1) if total else 0
        
        metrics = {
            "endpoints_checked": total,
            "endpoints_up": passed,
            "uptime_pct": uptime_pct,
            "avg_response_ms": avg_rt,
            "max_response_ms": max_rt,
        }
        
        # Score based on uptime percentage, with a response time penalty
        score = round(uptime_pct)
        if max_rt > 2000:
            score = max(0, score - 15)
        elif max_rt > 1000:
            score = max(0, score - 5)
            
        parsed = {
            "tool": self.tool_name,
            "status": "COMPLETED",
            "score": score,
            "metrics": metrics,
            "artifacts": [str(self._raw_output)]
        }
        
        parsed_path = self.output_dir / "parsed" / "reliability.json"
        parsed_path.parent.mkdir(parents=True, exist_ok=True)
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)
            
        return parsed

    async def cleanup(self) -> None:
        pass
