"""
================================================================================
TSC RUNNER — TypeScript Type Checking (Reliability)
================================================================================
Runs `npx tsc --noEmit --pretty false` in the repo root. This is the JS/TS
equivalent of mypy: it catches real type errors in TypeScript code, not just
style issues.

Requires:
    - tsconfig.json at the repo root (raises ToolNotConfiguredError if absent)
    - Node.js / npx on PATH (raises FileNotFoundError if absent)

Category: reliability
Severity mapping:
    error   → high
    warning → medium  (tsc rarely emits warnings, but map for completeness)
"""

import asyncio
import logging
import re
import shutil
import subprocess
from pathlib import Path
from typing import List

from backend.services.nfr.a11y_runner import ToolNotConfiguredError

logger = logging.getLogger(__name__)

# tsc output: src/file.ts(10,5): error TS2304: Cannot find name 'foo'.
# OR (with --pretty false):  src/file.ts:10:5 - error TS2304: message
_TSC_PATTERN = re.compile(
    r"^(.+?)[\(:](\d+)[\),:](\d+)\)?:?\s+-?\s*(error|warning)\s+(TS\d+):\s+(.+)$"
)

_SEV_MAP = {"error": "high", "warning": "medium"}


class TscRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run tsc --noEmit and parse findings.

        Raises:
            FileNotFoundError      — npx not on PATH
            ToolNotConfiguredError — no tsconfig.json at repo root
        """
        npx = shutil.which("npx.cmd") or shutil.which("npx")
        if not npx:
            raise FileNotFoundError("npx not found on PATH — Node.js is required for TypeScript checking")

        tsconfig = Path(self.codebase_dir) / "tsconfig.json"
        if not tsconfig.exists():
            raise ToolNotConfiguredError(
                "tsc",
                "No tsconfig.json found at repo root — add one to enable TypeScript type checking.",
            )

        cmd = [npx, "tsc", "--noEmit", "--pretty", "false"]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            cwd=self.codebase_dir,
        )

        # tsc exits 1 when there are errors — that's expected, not a crash
        lines = proc.stdout.strip().splitlines() + proc.stderr.strip().splitlines()

        root = str(Path(self.codebase_dir).resolve())
        findings = []

        for raw in lines:
            m = _TSC_PATTERN.match(raw.strip())
            if not m:
                continue

            file_path, lineno, col, level, ts_code, message = m.groups()
            severity = _SEV_MAP.get(level, "medium")

            abs_fp = str(Path(file_path).resolve())
            rel_fp = abs_fp[len(root):].lstrip("/\\") if abs_fp.startswith(root) else file_path

            findings.append({
                "file_path": rel_fp,
                "line": int(lineno),
                "col": int(col),
                "severity": severity,
                "category": "reliability",
                "tool": "tsc",
                "rule_id": ts_code,
                "message": message.strip(),
                "code_snippet": None,
            })

        logger.info(f"[TSC] {len(findings)} type-check findings")
        return findings
