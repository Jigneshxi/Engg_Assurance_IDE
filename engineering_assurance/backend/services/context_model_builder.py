"""
================================================================================
CONTEXT MODEL BUILDER — Brownfield Codebase Intelligence
================================================================================
For brownfield repos, builds and caches a queryable index of:
- Existing type/interface & DB schema definitions
- API route definitions
- Naming conventions, error-handling patterns, auth/middleware patterns
- Test patterns (framework, structure, assertion style)
- Dependency manifest

This index is used by code generation to respect existing conventions.
Invalidated on push webhooks via RepoProfile refresh.
"""

import ast
import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

IGNORE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    ".next", "dist", "build", ".idea", ".vscode", "target",
}


def build_context_model(repo_path: str, repo_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a comprehensive context model from an existing codebase.
    
    Args:
        repo_path: Path to the cloned repository
        repo_profile: Output from build_repo_profile()
    
    Returns:
        Context model dict with extracted patterns and definitions
    """
    root = Path(repo_path)
    primary_language = repo_profile.get("primary_language", "unknown")

    logger.info(f"[CONTEXT-MODEL] Building context model for {repo_path} (lang={primary_language})")

    model = {
        "type_definitions": [],
        "api_routes": [],
        "db_schemas": [],
        "error_patterns": [],
        "auth_patterns": [],
        "test_patterns": {},
        "import_patterns": [],
        "middleware": [],
        "built_at": None,
    }

    if primary_language == "python":
        model["type_definitions"] = _extract_python_types(root)
        model["api_routes"] = _extract_python_routes(root)
        model["db_schemas"] = _extract_python_db_models(root)
        model["error_patterns"] = _extract_python_error_patterns(root)
        model["auth_patterns"] = _extract_python_auth_patterns(root)
        model["test_patterns"] = _extract_python_test_patterns(root)
    elif primary_language in ("javascript", "typescript"):
        model["type_definitions"] = _extract_ts_types(root)
        model["api_routes"] = _extract_ts_routes(root)
        model["test_patterns"] = _extract_ts_test_patterns(root)

    import datetime
    model["built_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    total_items = sum(len(v) if isinstance(v, list) else (1 if v else 0) for v in model.values())
    logger.info(f"[CONTEXT-MODEL] Complete: {total_items} items extracted")

    return model


# ── Python Extractors ────────────────────────────────────────────────────────

def _extract_python_types(root: Path) -> List[Dict[str, Any]]:
    """Extract class definitions, dataclasses, Pydantic models, TypedDicts."""
    types = []
    for py_file in _iter_source_files(root, ".py"):
        try:
            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                source = f.read()
            tree = ast.parse(source)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    bases = [_ast_name(b) for b in node.bases]
                    fields = []
                    for item in node.body:
                        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                            fields.append(item.target.id)
                        elif isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name):
                                    fields.append(target.id)

                    type_kind = "class"
                    if "BaseModel" in bases:
                        type_kind = "pydantic_model"
                    elif "TypedDict" in bases:
                        type_kind = "typed_dict"
                    elif any("Base" in b for b in bases):
                        type_kind = "orm_model"

                    types.append({
                        "name": node.name,
                        "kind": type_kind,
                        "bases": bases,
                        "fields": fields[:20],  # Cap
                        "file": str(py_file.relative_to(root)),
                        "line": node.lineno,
                    })
        except (SyntaxError, UnicodeDecodeError):
            continue
    
    return types[:100]  # Cap total


def _extract_python_routes(root: Path) -> List[Dict[str, Any]]:
    """Extract FastAPI/Flask/Django route definitions."""
    routes = []
    route_pattern = re.compile(
        r'@(?:app|router|bp|blueprint)\.'
        r'(get|post|put|delete|patch|head|options)\s*\(\s*["\']([^"\']+)["\']',
        re.IGNORECASE
    )

    for py_file in _iter_source_files(root, ".py"):
        try:
            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            
            for match in route_pattern.finditer(content):
                method = match.group(1).upper()
                path = match.group(2)
                routes.append({
                    "method": method,
                    "path": path,
                    "file": str(py_file.relative_to(root)),
                })
        except (OSError, UnicodeDecodeError):
            continue

    return routes[:100]


def _extract_python_db_models(root: Path) -> List[Dict[str, Any]]:
    """Extract SQLAlchemy/Django model definitions."""
    models = []
    column_pattern = re.compile(r'(\w+)\s*=\s*(?:Column|db\.Column)\s*\(([^)]*)\)')

    for py_file in _iter_source_files(root, ".py"):
        try:
            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                source = f.read()
            tree = ast.parse(source)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    bases = [_ast_name(b) for b in node.bases]
                    # Check if it's an ORM model
                    if any("Base" in b or "Model" in b for b in bases):
                        # Extract __tablename__
                        tablename = None
                        for item in node.body:
                            if isinstance(item, ast.Assign):
                                for target in item.targets:
                                    if isinstance(target, ast.Name) and target.id == "__tablename__":
                                        if isinstance(item.value, ast.Constant):
                                            tablename = item.value.value

                        # Extract columns from source text
                        columns = []
                        class_source = ast.get_source_segment(source, node) or ""
                        for col_match in column_pattern.finditer(class_source):
                            columns.append({
                                "name": col_match.group(1),
                                "definition": col_match.group(2)[:80],
                            })

                        if tablename or columns:
                            models.append({
                                "class_name": node.name,
                                "table_name": tablename,
                                "columns": columns[:20],
                                "file": str(py_file.relative_to(root)),
                            })
        except (SyntaxError, UnicodeDecodeError):
            continue

    return models[:50]


def _extract_python_error_patterns(root: Path) -> List[Dict[str, Any]]:
    """Detect error handling patterns (HTTPException, custom exceptions)."""
    patterns = []
    error_pattern = re.compile(r'raise\s+(\w+(?:Error|Exception|HTTPException))\s*\(([^)]*)\)')

    for py_file in _iter_source_files(root, ".py"):
        try:
            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            for match in error_pattern.finditer(content):
                exc_type = match.group(1)
                if exc_type not in [p.get("exception_type") for p in patterns]:
                    patterns.append({
                        "exception_type": exc_type,
                        "sample_args": match.group(2)[:80],
                        "file": str(py_file.relative_to(root)),
                    })
        except (OSError, UnicodeDecodeError):
            continue

    return patterns[:30]


def _extract_python_auth_patterns(root: Path) -> List[Dict[str, Any]]:
    """Detect auth/middleware patterns."""
    patterns = []
    auth_keywords = ["Depends", "get_current_user", "jwt", "OAuth", "authenticate",
                     "authorize", "permission", "login_required", "token"]

    for py_file in _iter_source_files(root, ".py"):
        try:
            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            for kw in auth_keywords:
                if kw.lower() in content.lower():
                    patterns.append({
                        "keyword": kw,
                        "file": str(py_file.relative_to(root)),
                    })
                    break  # One match per file is enough
        except (OSError, UnicodeDecodeError):
            continue

    return patterns[:20]


def _extract_python_test_patterns(root: Path) -> Dict[str, Any]:
    """Detect test framework, structure, and assertion style."""
    test_info = {
        "framework": "unknown",
        "test_directory": None,
        "assertion_style": "unknown",
        "fixture_usage": False,
        "sample_test_files": [],
    }

    # Check for test directories
    for d in ["tests", "test", "spec", "specs"]:
        if (root / d).exists():
            test_info["test_directory"] = d
            break

    # Check for pytest markers
    conftest = root / "conftest.py"
    if not conftest.exists() and test_info["test_directory"]:
        conftest = root / test_info["test_directory"] / "conftest.py"

    if conftest.exists():
        test_info["framework"] = "pytest"
        try:
            with open(conftest, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            test_info["fixture_usage"] = "@pytest.fixture" in content
        except OSError:
            pass

    # Scan first few test files for assertion patterns
    test_files = list(root.rglob("test_*.py"))[:5]
    for tf in test_files:
        try:
            with open(tf, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            if "assert " in content:
                test_info["assertion_style"] = "assert"
            elif "self.assert" in content:
                test_info["assertion_style"] = "unittest"
            test_info["sample_test_files"].append(str(tf.relative_to(root)))
        except (OSError, UnicodeDecodeError):
            continue

    return test_info


# ── TypeScript/JavaScript Extractors ─────────────────────────────────────────

def _extract_ts_types(root: Path) -> List[Dict[str, Any]]:
    """Extract TypeScript interfaces and type definitions."""
    types = []
    type_pattern = re.compile(
        r'(?:export\s+)?(?:interface|type)\s+(\w+)\s*(?:<[^>]*>)?\s*[={]',
        re.MULTILINE
    )

    for ts_file in _iter_source_files(root, ".ts", ".tsx"):
        try:
            with open(ts_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            for match in type_pattern.finditer(content):
                types.append({
                    "name": match.group(1),
                    "kind": "interface" if "interface" in content[max(0, match.start()-15):match.start()] else "type",
                    "file": str(ts_file.relative_to(root)),
                })
        except (OSError, UnicodeDecodeError):
            continue

    return types[:100]


def _extract_ts_routes(root: Path) -> List[Dict[str, Any]]:
    """Extract Express/NestJS route definitions."""
    routes = []
    # Express patterns
    express_pattern = re.compile(
        r'(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
        re.IGNORECASE
    )

    for ts_file in _iter_source_files(root, ".ts", ".tsx", ".js", ".jsx"):
        try:
            with open(ts_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            for match in express_pattern.finditer(content):
                routes.append({
                    "method": match.group(1).upper(),
                    "path": match.group(2),
                    "file": str(ts_file.relative_to(root)),
                })
        except (OSError, UnicodeDecodeError):
            continue

    return routes[:100]


def _extract_ts_test_patterns(root: Path) -> Dict[str, Any]:
    """Detect JS/TS test framework and patterns."""
    test_info = {
        "framework": "unknown",
        "test_directory": None,
        "assertion_style": "unknown",
        "sample_test_files": [],
    }

    # Check for test directories
    for d in ["__tests__", "tests", "test", "spec", "specs", "e2e"]:
        if (root / d).exists():
            test_info["test_directory"] = d
            break

    # Detect framework from config
    if (root / "jest.config.js").exists() or (root / "jest.config.ts").exists():
        test_info["framework"] = "jest"
    elif (root / "vitest.config.ts").exists():
        test_info["framework"] = "vitest"
    elif (root / "cypress.config.js").exists() or (root / "cypress.config.ts").exists():
        test_info["framework"] = "cypress"
    elif (root / "playwright.config.ts").exists():
        test_info["framework"] = "playwright"

    # Scan test files
    test_patterns = list(root.rglob("*.test.ts")) + list(root.rglob("*.spec.ts"))
    test_patterns += list(root.rglob("*.test.js")) + list(root.rglob("*.spec.js"))
    for tf in test_patterns[:5]:
        try:
            with open(tf, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            if "expect(" in content:
                test_info["assertion_style"] = "expect"
            elif "assert." in content:
                test_info["assertion_style"] = "assert"
            test_info["sample_test_files"].append(str(tf.relative_to(root)))
        except (OSError, UnicodeDecodeError):
            continue

    return test_info


# ── Helpers ──────────────────────────────────────────────────────────────────

def _iter_source_files(root: Path, *extensions: str):
    """Yield source files matching given extensions, skipping ignored dirs."""
    for item in root.rglob("*"):
        if any(part in IGNORE_DIRS for part in item.parts):
            continue
        if item.is_file() and item.suffix.lower() in extensions:
            yield item


def _ast_name(node) -> str:
    """Get the name string from an AST node (handles Name, Attribute, Subscript)."""
    if isinstance(node, ast.Name):
        return node.id
    elif isinstance(node, ast.Attribute):
        return f"{_ast_name(node.value)}.{node.attr}"
    elif isinstance(node, ast.Subscript):
        return _ast_name(node.value)
    return str(node)
