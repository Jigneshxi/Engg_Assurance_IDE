"""
================================================================================
NPM AUDIT RUNNER — JavaScript Dependency Vulnerability Scanning
================================================================================
Runs `npm audit --json` against the repo's package-lock.json to detect known
CVEs in declared npm dependencies.

Requires:
    - package.json at repo root (tool is not_applicable if absent — handled
      by the registry's `requires` lambda, so this runner never runs without it)
    - package-lock.json at repo root (raises ToolNotConfiguredError if absent;
      npm audit requires the lockfile to resolve the dependency tree)
    - npm on PATH (raises FileNotFoundError if absent)

Severity normalization:
    npm uses its own scale: info / low / moderate / high / critical
    We normalize to our four-bucket scale: low / medium / high / critical

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

# npm severity → our severity
NPM_SEVERITY_MAP = {
    "info":     "low",
    "low":      "low",
    "moderate": "medium",
    "high":     "high",
    "critical": "critical",
}


class NpmAuditRunner:
    def __init__(self, mission_id: str, runtime_config: dict, output_dir: str):
        self.mission_id = mission_id
        self.codebase_dir = runtime_config.get("codebase_dir", ".")
        self.output_dir = Path(output_dir)

    async def parse_findings(self) -> List[dict]:
        """
        Run npm audit --json and parse vulnerability findings.

        Raises:
            FileNotFoundError      — npm not on PATH
            ToolNotConfiguredError — package-lock.json absent (audit requires lockfile)
        """
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            raise FileNotFoundError("npm not found on PATH — Node.js is required for npm audit")

        lockfile = Path(self.codebase_dir) / "package-lock.json"
        if not lockfile.exists():
            raise ToolNotConfiguredError(
                "npm_audit",
                "package-lock.json not found — run `npm install` to generate a lockfile before auditing.",
            )

        cmd = [npm, "audit", "--json"]

        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            cwd=self.codebase_dir,
        )

        # npm audit exits 1 when vulnerabilities found — expected, not a crash
        stdout = proc.stdout.strip()
        if not stdout:
            logger.warning(f"[NPM-AUDIT] No JSON output — stderr: {proc.stderr[:200]}")
            return []

        try:
            raw = json.loads(stdout)
        except json.JSONDecodeError as e:
            logger.error(f"[NPM-AUDIT] JSON parse failed: {e}. stdout[:300]: {stdout[:300]}")
            return []

        findings = []

        # npm audit JSON v2 format: raw["vulnerabilities"] is a dict keyed by package name
        vulnerabilities = raw.get("vulnerabilities", {})
        for pkg_name, vuln_data in vulnerabilities.items():
            npm_severity = vuln_data.get("severity", "low")
            severity = NPM_SEVERITY_MAP.get(npm_severity, "medium")

            # Collect CVE/advisory IDs from the via chain
            via = vuln_data.get("via", [])
            advisory_ids = []
            advisory_url = ""
            advisory_title = ""
            for entry in via:
                if isinstance(entry, dict):
                    advisory_ids.append(str(entry.get("source", "")))
                    if not advisory_url:
                        advisory_url = entry.get("url", "")
                    if not advisory_title:
                        advisory_title = entry.get("title", "")
                elif isinstance(entry, str):
                    # transitive dependency — skip, already covered by its own entry
                    pass

            if not advisory_ids:
                # Purely transitive with no direct advisory — skip to avoid noise
                continue

            rule_id = ", ".join(filter(None, advisory_ids)) or "npm-advisory"
            message = advisory_title or f"Vulnerable dependency: {pkg_name}"
            if advisory_url:
                message += f" ({advisory_url})"

            fix_available = vuln_data.get("fixAvailable")
            if fix_available and isinstance(fix_available, dict):
                fix_version = fix_available.get("version", "")
                if fix_version:
                    message += f" — fix available in v{fix_version}"

            findings.append({
                "file_path": "package.json",  # dependency findings anchor to the manifest
                "line": 1,
                "col": None,
                "severity": severity,
                "category": "dependency_vulnerability",
                "tool": "npm-audit",
                "rule_id": rule_id,
                "message": message,
                "code_snippet": None,
            })

        logger.info(f"[NPM-AUDIT] {len(findings)} dependency vulnerability findings")
        return findings
