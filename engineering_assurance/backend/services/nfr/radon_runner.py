"""
================================================================================
RADON RUNNER — Cyclomatic Complexity & Maintainability Scanner
================================================================================
Runs `radon cc` (cyclomatic complexity) and `radon mi` (maintainability index)
on Python files in the repo. Flags overly complex functions as
'performance_complexity' findings.

Category: performance_complexity
Severity mapping:
    rank A (1-5)   → skip (healthy)
    rank B (6-10)  → low
    rank C (11-15) → medium
    rank D (16-20) → high
    rank E/F (>20) → high
"""

import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

_RANK_TO_SEVERITY = {
    "A": None,      # healthy — skip
    "B": "low",
    "C": "medium",
    "D": "high",
    "E": "high",
    "F": "high",
}


class RadonRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run `radon cc --json -s <path>` and return per-function findings.
        FileNotFoundError is intentionally propagated so the orchestrator
        correctly marks radon as tools_unavailable.
        """
        cmd = ["radon", "cc", "--json", "-s", self.codebase_dir]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
        )

        if not proc.stdout.strip():
            logger.warning(f"[RADON] No output produced — stdout empty, stderr: {proc.stderr[:200]}")
            return []

        try:
            raw: dict = json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            logger.error(f"[RADON] JSON parse failed: {e}. stdout: {proc.stdout[:300]}")
            return []

        root = str(Path(self.codebase_dir).resolve())
        findings = []

        for file_path, blocks in raw.items():
            # Normalise to relative path
            abs_fp = str(Path(file_path).resolve())
            rel_fp = abs_fp[len(root):].lstrip("/\\") if abs_fp.startswith(root) else file_path

            for block in (blocks if isinstance(blocks, list) else []):
                rank = block.get("rank", "A")
                severity = _RANK_TO_SEVERITY.get(rank)
                if severity is None:
                    continue  # rank A — healthy, no finding

                complexity = block.get("complexity", 0)
                name = block.get("name", "unknown")
                lineno = block.get("lineno", 0)
                block_type = block.get("type", "function")

                findings.append({
                    "file_path": rel_fp,
                    "line": lineno,
                    "col": None,
                    "severity": severity,
                    "category": "performance_complexity",
                    "tool": "radon",
                    "rule_id": f"CC-{rank}",
                    "message": (
                        f"{block_type.capitalize()} '{name}' has cyclomatic complexity "
                        f"{complexity} (rank {rank}) — consider refactoring to reduce branching."
                    ),
                    "code_snippet": None,  # Radon gives line number only; UI fetches from file content
                })

        logger.info(f"[RADON] {len(findings)} complexity findings from {len(raw)} files")
        return findings
