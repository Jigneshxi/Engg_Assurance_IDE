"""
================================================================================
A11Y RUNNER — Accessibility Linting via eslint-plugin-jsx-a11y
================================================================================
Runs `npx eslint` with the jsx-a11y plugin on frontend JS/JSX/TS/TSX files.

IMPORTANT DISTINCTION: This runner raises a special `ToolNotConfiguredError`
(not `FileNotFoundError`) when ESLint is available but jsx-a11y is not present
in the project's config. The orchestrator catches this separately and records
the runner in `tools_not_configured` rather than `tools_unavailable`, giving
the user a clear actionable message instead of implying an environment error.

Category: accessibility
Severity mapping:
    error   → high
    warning → medium
"""

import asyncio
import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

FRONTEND_EXTENSIONS = {".jsx", ".tsx", ".js", ".ts"}
IGNORE_DIRS = {"node_modules", ".next", "dist", "build", ".venv"}


class ToolNotConfiguredError(Exception):
    """
    Raised when the tool binary is available but the project is not configured
    to use it (e.g., eslint present but jsx-a11y not in .eslintrc).
    Distinct from FileNotFoundError (binary not on PATH at all).
    """
    def __init__(self, tool_name: str, guidance: str = ""):
        self.tool_name = tool_name
        self.guidance = guidance
        super().__init__(f"{tool_name} not configured: {guidance}")


class A11yRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    def _has_a11y_config(self) -> bool:
        """
        Heuristic: check whether jsx-a11y appears in any ESLint config file
        (legacy .eslintrc* OR flat eslint.config.*) or package.json under the
        codebase root. Covers both ESLint v8 (legacy) and v9 (flat) config formats.
        Returns False only when it can confirm jsx-a11y is genuinely absent.
        """
        root = Path(self.codebase_dir)
        # Flat config (ESLint v9) + legacy .eslintrc* + package.json
        candidates = (
            list(root.glob("eslint.config.*"))           # flat: eslint.config.js / .ts / .mjs
            + list(root.rglob(".eslintrc*"))              # legacy
            + list(root.glob("package.json"))             # plugin listed in deps
        )
        for cfg_file in candidates[:15]:  # cap to avoid huge repos
            try:
                text = cfg_file.read_text(encoding="utf-8", errors="replace")
                if "jsx-a11y" in text:
                    return True
            except Exception:
                pass
        return False

    async def parse_findings(self) -> List[dict]:
        """
        Run eslint --format json on all frontend source files.
        Raises:
            FileNotFoundError  — npx/eslint binary not available
            ToolNotConfiguredError — eslint works but jsx-a11y not configured
        """
        # Verify npx is available (raises FileNotFoundError if not)
        if not shutil.which("npx") and not shutil.which("npx.cmd"):
            raise FileNotFoundError("npx not found on PATH — Node.js is required for A11y scanning")

        # Check for jsx-a11y config before running
        if not self._has_a11y_config():
            raise ToolNotConfiguredError(
                "accessibility",
                "Add eslint-plugin-jsx-a11y to your project's .eslintrc to enable accessibility linting.",
            )

        # Collect frontend files (skip ignored dirs)
        root = Path(self.codebase_dir)
        frontend_files = [
            str(p) for p in root.rglob("*")
            if p.is_file()
            and p.suffix.lower() in FRONTEND_EXTENSIONS
            and not any(part in IGNORE_DIRS for part in p.parts)
        ]

        if not frontend_files:
            logger.info("[A11Y] No frontend files found to lint")
            return []

        # Use npx to run eslint — handles both Windows (npx.cmd) and Unix (npx)
        npx = "npx.cmd" if shutil.which("npx.cmd") else "npx"
        cmd = [
            npx, "eslint",
            "--format", "json",
            "--rule", '{"jsx-a11y/alt-text": "error", "jsx-a11y/aria-props": "error", "jsx-a11y/aria-role": "error", "jsx-a11y/no-noninteractive-element-interactions": "warn"}',
        ] + frontend_files[:100]  # cap at 100 files per run to avoid timeout

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            cwd=self.codebase_dir,
            shell=False,
        )

        if not proc.stdout.strip():
            # eslint returns exit 0 with no output if no matching files
            return []

        try:
            raw_results = json.loads(proc.stdout)
        except json.JSONDecodeError:
            logger.error(f"[A11Y] JSON parse failed. stdout: {proc.stdout[:300]}")
            return []

        root_str = str(root.resolve())
        findings = []

        for file_result in raw_results:
            file_path = file_result.get("filePath", "")
            abs_fp = str(Path(file_path).resolve())
            rel_fp = abs_fp[len(root_str):].lstrip("/\\") if abs_fp.startswith(root_str) else file_path

            for msg in file_result.get("messages", []):
                severity_int = msg.get("severity", 1)
                severity = "high" if severity_int == 2 else "medium"
                rule_id = msg.get("ruleId") or "jsx-a11y"
                if "jsx-a11y" not in rule_id:
                    continue  # only include a11y rules, not other eslint errors

                findings.append({
                    "file_path": rel_fp,
                    "line": msg.get("line", 0),
                    "col": msg.get("column"),
                    "severity": severity,
                    "category": "accessibility",
                    "tool": "eslint-jsx-a11y",
                    "rule_id": rule_id,
                    "message": msg.get("message", ""),
                    "code_snippet": None,
                })

        logger.info(f"[A11Y] {len(findings)} accessibility findings")
        return findings
