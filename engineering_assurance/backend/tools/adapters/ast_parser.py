import time
import ast
import re
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any, List


def _analyse_python_source(source: str) -> dict:
    """Analyse Python source code using the stdlib ast module."""
    issues: List[str] = []

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return {
            "syntax_valid": False,
            "functions": 0,
            "classes": 0,
            "duplicate_functions": 0,
            "unused_imports": 0,
            "complexity_score": "unknown",
            "issues": [f"SyntaxError at line {e.lineno}: {e.msg}"],
        }

    # Collect names
    function_names: List[str] = []
    class_names: List[str] = []
    import_names: List[str] = []
    used_names: set = set()

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            function_names.append(node.name)
        elif isinstance(node, ast.ClassDef):
            class_names.append(node.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                import_names.append(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                import_names.append(alias.asname or alias.name)
        elif isinstance(node, ast.Name):
            used_names.add(node.id)
        elif isinstance(node, ast.Attribute):
            used_names.add(node.attr)

    # Duplicate functions
    seen = set()
    duplicates = set()
    for name in function_names:
        if name in seen:
            duplicates.add(name)
        seen.add(name)

    if duplicates:
        issues.append(f"Duplicate function names: {', '.join(sorted(duplicates))}")

    # Unused imports (simple heuristic)
    unused = []
    for imp in import_names:
        base = imp.split(".")[0]
        if base not in used_names and imp not in used_names:
            unused.append(imp)

    if unused:
        issues.append(f"Potentially unused imports: {', '.join(sorted(unused))}")

    # Cyclomatic complexity estimate (count branches)
    branches = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.If, ast.For, ast.While, ast.ExceptHandler, ast.With)):
            branches += 1
        elif isinstance(node, ast.BoolOp):
            branches += len(node.values) - 1

    if branches <= 5:
        complexity = "low"
    elif branches <= 15:
        complexity = "medium"
    else:
        complexity = "high"
        issues.append(f"High cyclomatic complexity ({branches} branches)")

    return {
        "syntax_valid": True,
        "functions": len(function_names),
        "classes": len(class_names),
        "duplicate_functions": len(duplicates),
        "unused_imports": len(unused),
        "complexity_score": complexity,
        "issues": issues,
    }


@ToolRegistry.register
class AstParserAdapter(BaseToolAdapter):
    name = "ast_parser"
    category = "automation"

    @classmethod
    def get_version(cls) -> str:
        import sys
        return f"python-{sys.version_info.major}.{sys.version_info.minor}"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return True

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload

        source_code = payload.get("source_code", "")
        if not source_code:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error="Payload must contain 'source_code' (a Python source string).",
            )

        analysis = _analyse_python_source(source_code)
        duration_ms = int((time.time() - start_time) * 1000)

        return ToolExecutionResult(
            tool_name=self.name,
            success=analysis["syntax_valid"],
            duration_ms=duration_ms,
            summary=analysis,
        )
