"""
================================================================================
STACK DETECTOR — Repository Language & Manifest Detection
================================================================================
Pre-scans the repository to determine which languages and tooling manifests
are present. The result drives the tool registry in existing_code_audit.py:
only runners whose `requires` lambda returns True for the detected stack
are attempted.

This makes the audit genuinely dynamic — a pure-Python repo will not attempt
tsc or npm audit; a pure-JS repo will not attempt mypy or pip-audit.
The skipped runners are reported as `tools_not_applicable` (a neutral status,
meaningfully distinct from `tools_unavailable` or `tools_not_configured`).
"""

import pathlib
import logging

logger = logging.getLogger(__name__)

IGNORE_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv", ".next", "dist", "build"}


def _has_ext(root: pathlib.Path, ext: str) -> bool:
    """Return True if any file with the given extension exists under root (ignoring IGNORE_DIRS)."""
    for p in root.rglob(f"*{ext}"):
        if not any(part in IGNORE_DIRS for part in p.parts):
            return True
    return False


def detect_stack(repo_path: str) -> dict:
    """
    Walk the repo once and return a stack-detection dict.

    Keys:
        has_python          — .py files exist
        has_javascript      — .js / .jsx files exist
        has_typescript      — tsconfig.json OR .ts / .tsx files exist
        has_npm_manifest    — package.json exists at repo root
        has_npm_lockfile    — package-lock.json exists at repo root (required for npm audit)
        has_pip_manifest    — requirements.txt OR pyproject.toml exists
        has_java            — .java files exist
        has_go              — .go files exist
        has_ruby            — .rb files exist
    """
    root = pathlib.Path(repo_path)

    has_typescript = (root / "tsconfig.json").exists() or _has_ext(root, ".ts") or _has_ext(root, ".tsx")

    stack = {
        "has_python":       _has_ext(root, ".py"),
        "has_javascript":   _has_ext(root, ".js") or _has_ext(root, ".jsx"),
        "has_typescript":   has_typescript,
        "has_npm_manifest": (root / "package.json").exists(),
        "has_npm_lockfile": (root / "package-lock.json").exists(),
        "has_pip_manifest": (root / "requirements.txt").exists() or (root / "pyproject.toml").exists(),
        "has_java":         _has_ext(root, ".java"),
        "has_go":           _has_ext(root, ".go"),
        "has_ruby":         _has_ext(root, ".rb"),
    }

    logger.info(f"[STACK-DETECT] {repo_path} → {stack}")
    return stack
