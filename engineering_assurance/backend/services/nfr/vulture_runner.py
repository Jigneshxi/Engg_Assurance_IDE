"""
================================================================================
VULTURE RUNNER — Python Dead Code Detection
================================================================================
Runs `vulture <codebase_dir> --min-confidence 80` to find unused Python
functions, classes, variables, and imports.

Why 80% not 60%:
    At 60%, vulture produces a large volume of low-confidence guesses —
    particularly for Flask/FastAPI route handlers, event callbacks, and
    test fixtures — that are actually live code. 80% confidence cuts the
    noise significantly while still catching genuinely dead exports and
    stale utility functions that LLM-generated codebases tend to accumulate.

Severity mapping:
    confidence 80-89% → low  (possible dead code, worth reviewing)
    confidence 90%+   → medium (high confidence dead code, likely safe to remove)
    Note: vulture does not emit "high" or "critical" — dead code is never blocking.

Category: dead_code
"""

import asyncio
import logging
import re
import subprocess
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# vulture output: path/to/file.py:42: unused function 'foo' (90% confidence)
_VULTURE_PATTERN = re.compile(
    r"^(.+?):(\d+):\s+unused\s+(.+?)\s+'(.+?)'\s+\((\d+)%\s+confidence\)$"
)

MIN_CONFIDENCE = 80


class VultureRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run vulture and parse dead code findings.

        Raises:
            FileNotFoundError — vulture not on PATH
        """
        cmd = [
            "vulture",
            self.codebase_dir,
            f"--min-confidence", str(MIN_CONFIDENCE),
        ]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
        )

        # vulture exits 1 when dead code is found — expected, not a crash
        lines = proc.stdout.strip().splitlines()

        root = str(Path(self.codebase_dir).resolve())
        findings = []

        for raw in lines:
            m = _VULTURE_PATTERN.match(raw.strip())
            if not m:
                continue

            file_path, lineno, kind, name, confidence_str = m.groups()
            confidence = int(confidence_str)

            # Double-check confidence threshold (vulture may still emit lower ones
            # if the --min-confidence flag isn't honoured perfectly in all versions)
            if confidence < MIN_CONFIDENCE:
                continue

            severity = "medium" if confidence >= 90 else "low"

            abs_fp = str(Path(file_path).resolve())
            rel_fp = abs_fp[len(root):].lstrip("/\\") if abs_fp.startswith(root) else file_path

            findings.append({
                "file_path": rel_fp,
                "line": int(lineno),
                "col": None,
                "severity": severity,
                "category": "dead_code",
                "tool": "vulture",
                "rule_id": f"unused-{kind.replace(' ', '-')}",
                "message": f"Unused {kind} '{name}' ({confidence}% confidence)",
                "code_snippet": None,
            })

        logger.info(f"[VULTURE] {len(findings)} dead code findings (≥{MIN_CONFIDENCE}% confidence)")
        return findings
