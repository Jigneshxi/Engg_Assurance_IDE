import asyncio
import json
import logging
import os
import shutil
import httpx
from typing import Dict, Any
from pathlib import Path
from backend.services.nfr.base_runner import ToolRunner

logger = logging.getLogger(__name__)

class LighthouseRunner(ToolRunner):
    """
    Executes Lighthouse for accessibility and SEO audits.
    Falls back to HTTP-based accessibility checks when Lighthouse/Chrome is unavailable.
    """
    
    def __init__(self, mission_id: str, runtime_config: Dict[str, Any], output_dir: str):
        super().__init__(mission_id, runtime_config, timeout_seconds=180, max_retries=1)
        self.output_dir = Path(output_dir)
        self.frontend_url = runtime_config.get("frontend_url")
        self.report_path = self.output_dir / "raw" / "lighthouse.json"
        self._use_fallback = False
        
    async def validate(self) -> Dict[str, Any]:
        """Check if frontend_url is provided. Lighthouse/npx is optional — we have a fallback."""
        if not self.frontend_url:
            return {"tool": self.tool_name, "available": False, "reason": "frontend_url not configured in mission_runtime"}
        
        # Check if npx is available; if not, we'll use the HTTP fallback
        if not shutil.which("npx"):
            logger.info("[Lighthouse] npx not found — will use HTTP accessibility fallback")
            self._use_fallback = True
            
        return {"tool": self.tool_name, "available": True}

    async def _run_command(self) -> Any:
        """Run Lighthouse or HTTP fallback"""
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        
        if self._use_fallback:
            return await self._http_fallback()
        
        # Try Lighthouse first
        try:
            return await self._run_lighthouse()
        except Exception as e:
            logger.warning(f"[Lighthouse] CLI failed ({e}), falling back to HTTP checks")
            return await self._http_fallback()

    async def _run_lighthouse(self) -> Any:
        """Run npx lighthouse with deterministic output path"""
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
        
        cmd = (
            f"npx -y lighthouse {self.frontend_url} "
            f"--output=json "
            f"--output-path={str(self.report_path)} "
            f"--chrome-flags=\"--headless --no-sandbox --disable-dev-shm-usage\" "
            f"--quiet"
        )
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, stderr = await process.communicate()
        
        if not self.report_path.exists():
            raise RuntimeError(f"Lighthouse failed. stderr: {stderr.decode('utf-8', errors='replace')}")
            
        # Verify the report is valid and not a runtime error
        with open(self.report_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "runtimeError" in data:
                raise RuntimeError(f"Lighthouse runtime error: {data['runtimeError'].get('message')}")
            if "categories" not in data or not data["categories"]:
                raise RuntimeError("Lighthouse returned empty categories")
                
        return str(self.report_path)

    async def _http_fallback(self) -> Any:
        """Simple HTTP-based accessibility checks when Lighthouse is unavailable."""
        checks = []
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.frontend_url)
                html = response.text
                
                checks = [
                    {"id": "ACC-001", "description": "Page reachable", 
                     "passed": response.status_code == 200},
                    {"id": "ACC-002", "description": "HTML lang attribute present",
                     "passed": 'lang=' in html},
                    {"id": "ACC-003", "description": "ARIA labels present",
                     "passed": 'aria-label' in html or 'aria-labelledby' in html or 'role=' in html},
                    {"id": "ACC-004", "description": "Meta viewport present",
                     "passed": 'viewport' in html},
                    {"id": "ACC-005", "description": "Title tag present",
                     "passed": '<title>' in html.lower() and '</title>' in html.lower()},
                    {"id": "ACC-006", "description": "Images have alt text",
                     "passed": '<img' not in html or 'alt=' in html},
                    {"id": "ACC-007", "description": "No empty links",
                     "passed": '<a></a>' not in html and '<a href="#"></a>' not in html},
                ]
        except Exception as e:
            checks = [{"id": "ACC-ERROR", "description": f"Could not reach {self.frontend_url}: {e}", "passed": False}]
        
        # Build fallback report
        report = {
            "mode": "http_fallback",
            "url": self.frontend_url,
            "checks": checks
        }
        
        with open(self.report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
            
        self._use_fallback = True
        return str(self.report_path)

    async def parse(self) -> Dict[str, Any]:
        """Parse lighthouse or fallback output into standardized format"""
        if not self.report_path.exists():
            raise FileNotFoundError("Accessibility report not found")
            
        with open(self.report_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Detect if this is a fallback report or a real Lighthouse report
        if data.get("mode") == "http_fallback":
            return self._parse_fallback(data)
        else:
            return self._parse_lighthouse(data)

    def _parse_lighthouse(self, data: dict) -> Dict[str, Any]:
        """Parse real Lighthouse JSON report"""
        categories = data.get("categories", {})
        
        metrics = {
            "accessibility": int((categories.get("accessibility", {}).get("score") or 0) * 100),
            "performance": int((categories.get("performance", {}).get("score") or 0) * 100),
            "seo": int((categories.get("seo", {}).get("score") or 0) * 100),
            "best_practices": int((categories.get("best-practices", {}).get("score") or 0) * 100),
        }
        
        score = metrics["accessibility"]
        
        parsed = {
            "tool": self.tool_name,
            "status": "COMPLETED",
            "score": score,
            "metrics": metrics,
            "artifacts": [str(self.report_path)]
        }
        
        self._save_parsed(parsed)
        return parsed
    
    def _parse_fallback(self, data: dict) -> Dict[str, Any]:
        """Parse HTTP fallback checks"""
        checks = data.get("checks", [])
        passed = sum(1 for c in checks if c.get("passed"))
        total = len(checks)
        score = round(passed / total * 100) if total else 0
        
        metrics = {
            "checks_passed": passed,
            "checks_total": total,
            "mode": "http_fallback",
            "accessibility": score,
            "performance": 0,
            "seo": 0,
            "best_practices": 0,
            "best-practices": 0
        }
        
        parsed = {
            "tool": self.tool_name,
            "status": "COMPLETED",
            "score": score,
            "metrics": metrics,
            "artifacts": [str(self.report_path)]
        }
        
        self._save_parsed(parsed)
        return parsed

    def _save_parsed(self, parsed: dict):
        parsed_path = self.output_dir / "parsed" / "accessibility.json"
        parsed_path.parent.mkdir(parents=True, exist_ok=True)
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)

    async def cleanup(self) -> None:
        pass
