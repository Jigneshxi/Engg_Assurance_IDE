"""
================================================================================
JSCPD RUNNER — Cross-Language Duplicate Code Detection
================================================================================
Runs `npx jscpd <repo_path> --reporters json --output <output_dir>` to detect
copy-paste code duplication across the entire repository (Python, JS, TS, etc.).

Finding shape:
    One finding per clone *target* (the duplicate side), message referencing the
    original location. A developer reviewing the file tree sees "this file has
    duplicate code" at the actionable location to refactor/remove/extract.

Requires:
    - npx on PATH (raises FileNotFoundError if absent)
    - jscpd is fetched via npx on first run (no global install required)

Category: duplication
Severity: medium (all duplicates — consistent, developer decides impact)
"""

import asyncio
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# Directories jscpd should ignore
JSCPD_IGNORE = "**/.git/**,**/node_modules/**,**/__pycache__/**,**/.venv/**,**/dist/**,**/build/**"


class JscpdRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run jscpd and parse duplicate code findings.

        Raises:
            FileNotFoundError — npx not on PATH
        """
        npx = shutil.which("npx.cmd") or shutil.which("npx")
        if not npx:
            raise FileNotFoundError("npx not found on PATH — Node.js is required for jscpd")

        # Write output to a temp subdirectory so we can locate the report reliably
        jscpd_out = self.output_dir / "jscpd"
        jscpd_out.mkdir(parents=True, exist_ok=True)

        cmd = [
            npx, "--yes", "jscpd",
            self.codebase_dir,
            "--reporters", "json",
            "--output", str(jscpd_out),
            "--ignore", JSCPD_IGNORE,
            "--min-lines", "5",      # ignore tiny incidental matches
            "--min-tokens", "50",    # ~3 lines of real code
            "--silent",
        ]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            cwd=self.codebase_dir,
        )

        # jscpd writes jscpd-report.json to the output dir
        report_path = jscpd_out / "jscpd-report.json"
        if not report_path.exists():
            logger.warning(f"[JSCPD] Report not generated — stderr: {proc.stderr[:300]}")
            return []

        try:
            raw = json.loads(report_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"[JSCPD] Failed to read report: {e}")
            return []

        root = str(Path(self.codebase_dir).resolve())
        findings = []

        # jscpd report structure: {"duplicates": [{...}]}
        for clone in raw.get("duplicates", []):
            first = clone.get("firstFile", {})
            second = clone.get("secondFile", {})

            first_path = first.get("name", "")
            second_path = second.get("name", "")
            first_start = first.get("start", 1)
            first_end = first.get("end", first_start)
            second_start = second.get("start", 1)
            second_end = second.get("end", second_start)

            # Normalise to repo-relative paths
            def rel(p):
                abs_p = str(Path(p).resolve())
                return abs_p[len(root):].lstrip("/\\") if abs_p.startswith(root) else p

            rel_first = rel(first_path)
            rel_second = rel(second_path)

            line_count = second_end - second_start + 1

            # One finding on the duplicate (second) side, referencing the original (first)
            findings.append({
                "file_path": rel_second,
                "line": second_start,
                "col": None,
                "severity": "medium",
                "category": "duplication",
                "tool": "jscpd",
                "rule_id": "DUPLICATE-BLOCK",
                "message": (
                    f"Duplicate block ({line_count} lines, lines {second_start}-{second_end}) "
                    f"— copy of lines {first_start}-{first_end} in {rel_first}"
                ),
                "code_snippet": None,
            })

        logger.info(f"[JSCPD] {len(findings)} duplicate code findings")
        return findings
