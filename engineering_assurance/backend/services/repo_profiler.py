"""
================================================================================
REPO PROFILER — Convention & Toolchain Detection
================================================================================
Scans a cloned repository to build a RepoProfile:
- Language(s), package manager, framework
- Lint/format config detection
- Test framework detection
- CI/CD workflow detection

The profile is stored in mission_runtime and used by:
- Code generation (Phase 3) to respect existing conventions
- Lint runner (Phase 4) to run the correct linter
- Mode detector to determine greenfield vs brownfield
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# ── File patterns for detection ─────────────────────────────────────────────

LANGUAGE_INDICATORS = {
    "python": {
        "extensions": [".py"],
        "markers": ["requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "poetry.lock"],
    },
    "javascript": {
        "extensions": [".js", ".jsx"],
        "markers": ["package.json"],
    },
    "typescript": {
        "extensions": [".ts", ".tsx"],
        "markers": ["tsconfig.json"],
    },
    "java": {
        "extensions": [".java"],
        "markers": ["pom.xml", "build.gradle", "build.gradle.kts"],
    },
    "go": {
        "extensions": [".go"],
        "markers": ["go.mod", "go.sum"],
    },
    "rust": {
        "extensions": [".rs"],
        "markers": ["Cargo.toml"],
    },
    "csharp": {
        "extensions": [".cs"],
        "markers": [".csproj", ".sln"],
    },
    "ruby": {
        "extensions": [".rb"],
        "markers": ["Gemfile", "Rakefile"],
    },
}

FRAMEWORK_INDICATORS = {
    # Python
    "fastapi": ["fastapi", "uvicorn"],
    "django": ["django"],
    "flask": ["flask"],
    # JavaScript/TypeScript
    "react": ["react", "react-dom"],
    "next.js": ["next"],
    "express": ["express"],
    "nestjs": ["@nestjs/core"],
    "vue": ["vue"],
    "angular": ["@angular/core"],
    # Java
    "spring": ["spring-boot", "spring-framework"],
}

LINT_CONFIG_FILES = {
    "eslint": [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", "eslint.config.js", "eslint.config.mjs"],
    "prettier": [".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js"],
    "ruff": ["ruff.toml", ".ruff.toml"],
    "pylint": [".pylintrc", "pylintrc"],
    "flake8": [".flake8", "setup.cfg"],
    "mypy": ["mypy.ini", ".mypy.ini"],
    "tsc": ["tsconfig.json"],
    "biome": ["biome.json"],
}

TEST_CONFIG_FILES = {
    "pytest": ["pytest.ini", "pyproject.toml", "conftest.py", "setup.cfg"],
    "jest": ["jest.config.js", "jest.config.ts", "jest.config.json"],
    "vitest": ["vitest.config.ts", "vitest.config.js"],
    "mocha": [".mocharc.yml", ".mocharc.json"],
    "junit": ["pom.xml"],  # Check for junit dependency inside
    "cypress": ["cypress.config.js", "cypress.config.ts", "cypress.json"],
    "playwright": ["playwright.config.ts", "playwright.config.js"],
}

CI_WORKFLOW_FILES = {
    "github_actions": [".github/workflows"],
    "gitlab_ci": [".gitlab-ci.yml"],
    "jenkins": ["Jenkinsfile"],
    "circleci": [".circleci/config.yml"],
    "azure_pipelines": ["azure-pipelines.yml"],
}

IGNORE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    ".next", "dist", "build", ".idea", ".vscode", "target",
    ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache",
}


def build_repo_profile(repo_path: str) -> Dict[str, Any]:
    """
    Scan a cloned repository and build a comprehensive RepoProfile.
    
    Returns:
        Dict with keys: languages, frameworks, package_managers, lint_config,
        test_config, ci_config, file_count, dependency_manifest
    """
    root = Path(repo_path)
    if not root.exists():
        raise FileNotFoundError(f"Repo path does not exist: {repo_path}")

    logger.info(f"[REPO-PROFILER] Scanning {repo_path}...")

    profile = {
        "languages": [],
        "primary_language": None,
        "frameworks": [],
        "package_managers": [],
        "lint_config": {},
        "test_config": {},
        "ci_config": {},
        "file_count": 0,
        "source_file_count": 0,
        "dependency_manifest": {},
        "conventions": {},
        "profiled_at": None,
    }

    # ── 1. Count files and detect languages ──────────────────────────────

    extension_counts: Dict[str, int] = {}
    file_count = 0
    source_file_count = 0

    for item in root.rglob("*"):
        # Skip ignored directories
        if any(part in IGNORE_DIRS for part in item.parts):
            continue
        if item.is_file():
            file_count += 1
            ext = item.suffix.lower()
            if ext:
                extension_counts[ext] = extension_counts.get(ext, 0) + 1

    profile["file_count"] = file_count

    detected_languages = []
    for lang, config in LANGUAGE_INDICATORS.items():
        # Check by file extension count
        ext_count = sum(extension_counts.get(ext, 0) for ext in config["extensions"])
        if ext_count > 0:
            detected_languages.append({"name": lang, "file_count": ext_count})
            source_file_count += ext_count

        # Check by marker files
        for marker in config["markers"]:
            marker_path = root / marker
            if marker_path.exists():
                if not any(d["name"] == lang for d in detected_languages):
                    detected_languages.append({"name": lang, "file_count": ext_count})
                break

    # Sort by file count descending
    detected_languages.sort(key=lambda x: x["file_count"], reverse=True)
    profile["languages"] = detected_languages
    profile["source_file_count"] = source_file_count
    if detected_languages:
        profile["primary_language"] = detected_languages[0]["name"]

    # ── 2. Detect package managers ───────────────────────────────────────

    pm_map = {
        "package.json": "npm/yarn",
        "package-lock.json": "npm",
        "yarn.lock": "yarn",
        "pnpm-lock.yaml": "pnpm",
        "requirements.txt": "pip",
        "pyproject.toml": "pip/poetry",
        "Pipfile": "pipenv",
        "poetry.lock": "poetry",
        "go.mod": "go modules",
        "Cargo.toml": "cargo",
        "Gemfile": "bundler",
        "pom.xml": "maven",
        "build.gradle": "gradle",
    }
    for marker, pm in pm_map.items():
        if (root / marker).exists():
            if pm not in profile["package_managers"]:
                profile["package_managers"].append(pm)

    # ── 3. Detect frameworks (from package.json / requirements.txt) ──────

    profile["frameworks"] = _detect_frameworks(root)

    # ── 4. Detect lint/format configuration ──────────────────────────────

    for linter, config_files in LINT_CONFIG_FILES.items():
        for cf in config_files:
            if (root / cf).exists():
                profile["lint_config"][linter] = {
                    "config_file": cf,
                    "exists": True,
                }
                break

    # ── 5. Detect test configuration ─────────────────────────────────────

    for framework, config_files in TEST_CONFIG_FILES.items():
        for cf in config_files:
            # Handle directory-based checks (e.g. conftest.py can be anywhere)
            if cf == "conftest.py":
                # Check root and common locations
                if (root / cf).exists() or (root / "tests" / cf).exists():
                    profile["test_config"][framework] = {"config_file": cf, "exists": True}
                    break
            elif (root / cf).exists():
                profile["test_config"][framework] = {"config_file": cf, "exists": True}
                break

    # ── 6. Detect CI/CD configuration ────────────────────────────────────

    for ci_system, paths in CI_WORKFLOW_FILES.items():
        for p in paths:
            if (root / p).exists():
                profile["ci_config"][ci_system] = {"path": p, "exists": True}
                break

    # ── 7. Extract dependency manifest ───────────────────────────────────

    profile["dependency_manifest"] = _extract_dependencies(root)

    # ── 8. Detect naming conventions ─────────────────────────────────────

    profile["conventions"] = _detect_conventions(root, profile["primary_language"])

    import datetime
    profile["profiled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    logger.info(
        f"[REPO-PROFILER] Complete: {file_count} files, "
        f"languages={[l['name'] for l in detected_languages]}, "
        f"frameworks={profile['frameworks']}"
    )

    return profile


def _detect_frameworks(root: Path) -> List[str]:
    """Detect frameworks by parsing dependency files."""
    frameworks = []

    # Check package.json
    pkg_json = root / "package.json"
    if pkg_json.exists():
        try:
            with open(pkg_json, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            for framework, indicators in FRAMEWORK_INDICATORS.items():
                if any(ind in all_deps for ind in indicators):
                    frameworks.append(framework)
        except (json.JSONDecodeError, OSError):
            pass

    # Check requirements.txt
    req_txt = root / "requirements.txt"
    if req_txt.exists():
        try:
            with open(req_txt, "r", encoding="utf-8") as f:
                reqs = f.read().lower()
            for framework, indicators in FRAMEWORK_INDICATORS.items():
                if any(ind in reqs for ind in indicators):
                    frameworks.append(framework)
        except OSError:
            pass

    # Check pyproject.toml
    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        try:
            with open(pyproject, "r", encoding="utf-8") as f:
                content = f.read().lower()
            for framework, indicators in FRAMEWORK_INDICATORS.items():
                if any(ind in content for ind in indicators):
                    if framework not in frameworks:
                        frameworks.append(framework)
        except OSError:
            pass

    return frameworks


def _extract_dependencies(root: Path) -> Dict[str, Any]:
    """Extract top-level dependencies from manifest files."""
    deps = {}

    # package.json
    pkg_json = root / "package.json"
    if pkg_json.exists():
        try:
            with open(pkg_json, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            deps["npm"] = {
                "dependencies": list(pkg.get("dependencies", {}).keys()),
                "devDependencies": list(pkg.get("devDependencies", {}).keys()),
            }
        except (json.JSONDecodeError, OSError):
            pass

    # requirements.txt
    req_txt = root / "requirements.txt"
    if req_txt.exists():
        try:
            with open(req_txt, "r", encoding="utf-8") as f:
                lines = [l.strip().split("==")[0].split(">=")[0].split("~=")[0]
                         for l in f if l.strip() and not l.startswith("#")]
            deps["pip"] = {"packages": lines}
        except OSError:
            pass

    # go.mod
    go_mod = root / "go.mod"
    if go_mod.exists():
        try:
            with open(go_mod, "r", encoding="utf-8") as f:
                content = f.read()
            # Very basic extraction
            imports = [l.strip().split()[0] for l in content.split("\n")
                       if l.strip() and not l.startswith("//") and "/" in l]
            deps["go"] = {"modules": imports[:30]}  # Cap at 30
        except OSError:
            pass

    return deps


def _detect_conventions(root: Path, primary_language: Optional[str]) -> Dict[str, Any]:
    """Detect naming and structural conventions from the codebase."""
    conventions = {
        "folder_structure": [],
        "naming_style": "unknown",
    }

    # Detect top-level folder structure
    for item in sorted(root.iterdir()):
        if item.name.startswith(".") or item.name in IGNORE_DIRS:
            continue
        if item.is_dir():
            conventions["folder_structure"].append(item.name)

    # Detect naming style from source files
    if primary_language in ("python",):
        # Check if snake_case or camelCase is dominant
        py_files = list(root.rglob("*.py"))[:20]
        snake = sum(1 for f in py_files if "_" in f.stem and f.stem[0].islower())
        camel = sum(1 for f in py_files if f.stem[0].isupper() and "_" not in f.stem)
        conventions["naming_style"] = "snake_case" if snake >= camel else "PascalCase" if camel > 0 else "snake_case"

    elif primary_language in ("javascript", "typescript"):
        js_files = list(root.rglob("*.ts")) + list(root.rglob("*.tsx")) + list(root.rglob("*.js"))
        js_files = js_files[:20]
        pascal = sum(1 for f in js_files if f.stem[0].isupper())
        camel = sum(1 for f in js_files if f.stem[0].islower() and not "_" in f.stem)
        conventions["naming_style"] = "PascalCase" if pascal >= camel else "camelCase"

    return conventions
