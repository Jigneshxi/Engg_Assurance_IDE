"""
================================================================================
MYPY RUNNER — Static Type Checking for Python (Reliability)
================================================================================
Runs `mypy --no-error-summary --show-column-numbers --no-color-output` on the
cloned repo and parses output into standardised per-line findings.

Category: reliability
Severity mapping:
    error   → high
    warning → medium
    note    → low (skipped by default)
"""

import asyncio
import logging
import re
import subprocess
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# mypy output format: file.py:10: error: message  [error-code]
_MYPY_PATTERN = re.compile(
    r"^(.+?):(\d+):(\d+)?:?\s+(error|warning|note):\s+(.+?)(?:\s+\[(.+?)\])?$"
)

_SEV_MAP = {
    "error": "high",
    "warning": "medium",
    "note": None,  # skip notes by default — too noisy
}


class MypyRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run mypy and parse findings. FileNotFoundError propagates intentionally
        so the orchestrator marks mypy as tools_unavailable.
        """
        cmd = [
            "mypy",
            self.codebase_dir,
            "--no-error-summary",
            "--show-column-numbers",
            "--no-color-output",
            "--ignore-missing-imports",   # don't fail on missing stubs for 3rd-party libs
            "--explicit-package-bases",   # fixes double-module-name collision in monorepos
        ]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
        )

        lines = proc.stdout.strip().splitlines() + proc.stderr.strip().splitlines()

        root = str(Path(self.codebase_dir).resolve())
        findings = []

        for raw in lines:
            m = _MYPY_PATTERN.match(raw.strip())
            if not m:
                continue

            file_path, lineno, col, level, message, error_code = m.groups()
            severity = _SEV_MAP.get(level)
            if severity is None:
                continue  # skip notes

            # Normalise path
            abs_fp = str(Path(file_path).resolve())
            rel_fp = abs_fp[len(root):].lstrip("/\\") if abs_fp.startswith(root) else file_path

            findings.append({
                "file_path": rel_fp,
                "line": int(lineno),
                "col": int(col) if col else None,
                "severity": severity,
                "category": "reliability",
                "tool": "mypy",
                "rule_id": error_code or "mypy",
                "message": message.strip(),
                "code_snippet": None,  # mypy doesn't include snippets; UI pulls from file content
            })

        logger.info(f"[MYPY] {len(findings)} type-check findings")
        return findings
