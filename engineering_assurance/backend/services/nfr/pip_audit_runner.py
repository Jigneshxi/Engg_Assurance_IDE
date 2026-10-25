"""
================================================================================
PIP AUDIT RUNNER — Python Dependency Vulnerability Scanning
================================================================================
Runs `pip-audit --requirement requirements.txt -f json` (or pyproject.toml)
to detect known CVEs in declared Python dependencies.

Requires:
    - requirements.txt OR pyproject.toml at repo root (handled by registry
      `requires` lambda — runner never runs without a manifest)
    - pip-audit on PATH (`pip install pip-audit`)

Severity:
    pip-audit's JSON output does NOT include a severity field (confirmed upstream
    — it's a known missing feature). We assign severity based on fix availability
    as a practical proxy:
        - Has fix_versions available → "high"  (known, fixable CVE)
        - No fix_versions (no patch exists yet) → "medium" (known but unmitigated)
    This is a conservative but honest mapping — we don't pretend to know CVSS
    scores we don't have, but we still differentiate actionable from non-actionable.

Category: dependency_vulnerability
"""

import asyncio
import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import List

from backend.services.nfr.a11y_runner import ToolNotConfiguredError

logger = logging.getLogger(__name__)


class PipAuditRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    def _find_manifest(self) -> tuple[str, str]:
        """
        Return (flag, path) for the pip-audit --requirement or --project flag.
        Prefers requirements.txt; falls back to pyproject.toml.
        Returns (None, None) if neither is found.
        """
        root = Path(self.codebase_dir)
        if (root / "requirements.txt").exists():
            return "--requirement", str(root / "requirements.txt")
        if (root / "pyproject.toml").exists():
            return "--project", str(root)
        return None, None

    async def parse_findings(self) -> List[dict]:
        """
        Run pip-audit and parse vulnerability findings.

        Raises:
            FileNotFoundError      — pip-audit not on PATH
            ToolNotConfiguredError — no requirements.txt or pyproject.toml
        """
        if not shutil.which("pip-audit"):
            raise FileNotFoundError("pip-audit not found on PATH — run `pip install pip-audit`")

        flag, manifest_path = self._find_manifest()
        if not flag:
            raise ToolNotConfiguredError(
                "pip_audit",
                "No requirements.txt or pyproject.toml found — cannot audit Python dependencies.",
            )

        cmd = ["pip-audit", flag, manifest_path, "-f", "json", "--no-deps"]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            cwd=self.codebase_dir,
        )

        stdout = proc.stdout.strip()
        if not stdout:
            logger.warning(f"[PIP-AUDIT] No JSON output — stderr: {proc.stderr[:200]}")
            return []

        try:
            raw = json.loads(stdout)
        except json.JSONDecodeError as e:
            logger.error(f"[PIP-AUDIT] JSON parse failed: {e}. stdout[:300]: {stdout[:300]}")
            return []

        findings = []

        # pip-audit JSON: {"dependencies": [{"name": str, "version": str, "vulns": [...]}]}
        dependencies = raw.get("dependencies", [])
        for dep in dependencies:
            pkg_name = dep.get("name", "unknown")
            pkg_version = dep.get("version", "?")
            for vuln in dep.get("vulns", []):
                vuln_id = vuln.get("id", "")          # e.g. PYSEC-2024-1234 or CVE-2024-...
                description = vuln.get("description", f"Vulnerability in {pkg_name}")
                fix_versions = vuln.get("fix_versions", [])

                # Severity: fixable → high (take action now), unfixed → medium (track it)
                severity = "high" if fix_versions else "medium"

                message = f"{vuln_id}: {description}"
                if fix_versions:
                    message += f" — upgrade to {', '.join(fix_versions)}"
                else:
                    message += " — no fix available yet"

                # Anchor to the manifest file that declares the dependency
                manifest_rel = "requirements.txt" if "requirements" in manifest_path else "pyproject.toml"

                findings.append({
                    "file_path": manifest_rel,
                    "line": 1,
                    "col": None,
                    "severity": severity,
                    "category": "dependency_vulnerability",
                    "tool": "pip-audit",
                    "rule_id": vuln_id or "pip-advisory",
                    "message": message,
                    "code_snippet": None,
                })

        logger.info(f"[PIP-AUDIT] {len(findings)} dependency vulnerability findings")
        return findings
