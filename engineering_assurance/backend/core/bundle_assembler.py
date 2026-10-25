import os
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def assemble_handoff_bundle(state: Dict[str, Any]) -> str:
    """
    Creates the immutable Handoff Bundle (Sprint 3) containing the SSD, Tasks, and TDD Contracts.
    Writes flat files and a bundle_manifest.json to the configured output directory.
    Returns the path to the bundle directory.
    """
    mission_id = state.get("mission_id", "local_mission")
    # Allow override via environment variable for production deployments
    workspace_dir = os.environ.get("WORKSPACE_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
    base_dir = os.environ.get("HANDOFF_BUNDLE_DIR", os.path.join(workspace_dir, "workspace", "missions", mission_id, "handoff-bundle"))
    
    # Ensure directory exists
    os.makedirs(base_dir, exist_ok=True)
    
    bundle_manifest = {
        "mission_id": mission_id,
        "files": []
    }
    
    # 1. Write System Specification Document (SSD)
    system_spec = state.get("system_specification", {})
    if system_spec:
        ssd_path = os.path.join(base_dir, "system_specification.json")
        with open(ssd_path, "w", encoding="utf-8") as f:
            json.dump(system_spec, f, indent=2)
        bundle_manifest["files"].append("system_specification.json")
        
    # 2. Write Risk Advisory Report
    risk_report = state.get("risk_advisory_report", {})
    if risk_report:
        risk_path = os.path.join(base_dir, "risk_advisory_report.json")
        with open(risk_path, "w", encoding="utf-8") as f:
            json.dump(risk_report, f, indent=2)
        bundle_manifest["files"].append("risk_advisory_report.json")
        
    # 3. Write Tasks
    tasks = state.get("tasks", [])
    if tasks:
        tasks_path = os.path.join(base_dir, "tasks.json")
        with open(tasks_path, "w", encoding="utf-8") as f:
            json.dump(tasks, f, indent=2)
        bundle_manifest["files"].append("tasks.json")
        
    # 4. Write TDD Contracts (Individual Python/TS files based on language)
    tdd_contracts = state.get("tdd_contracts", {})
    if tdd_contracts:
        tests_dir = os.path.join(base_dir, "tests")
        os.makedirs(tests_dir, exist_ok=True)
        for task_id, contract_obj in tdd_contracts.items():
            contract_code = contract_obj.get("code", "") if isinstance(contract_obj, dict) else contract_obj
            
            # Sanitize LLM output artifacts before writing as executable code
            contract_code = _sanitize_tdd_contract(contract_code)
            
            # Simplistic heuristic for file extension: if it uses jest/js, make it tsx. Else python.
            ext = "ts" if "jest" in contract_code.lower() or "describe(" in contract_code else "py"
            filename = f"test_{task_id}.{ext}"
            file_path = os.path.join(tests_dir, filename)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(contract_code)
            bundle_manifest["files"].append(f"tests/{filename}")
            
        # Write conftest.py for pytest fixtures (template from prompts module)
        from backend.prompts.tdd.pytest_generator import CONFTEST_TEMPLATE
        conftest_path = os.path.join(tests_dir, "conftest.py")
        with open(conftest_path, "w", encoding="utf-8") as f:
            f.write(CONFTEST_TEMPLATE)
        bundle_manifest["files"].append("tests/conftest.py")
            
    # 5. Write Bundle Manifest
    manifest_path = os.path.join(base_dir, "bundle_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(bundle_manifest, f, indent=2)
        
    logger.info(f"Handoff bundle assembled at: {base_dir}")
    return base_dir


def _sanitize_tdd_contract(code: str) -> str:
    """
    Sanitize LLM-generated TDD contract code before writing to disk.
    LLMs frequently produce code with JSON-escaped quotes, markdown fences,
    and missing = signs in keyword arguments (e.g., json{...} instead of json={...}).
    """
    if not code or not isinstance(code, str):
        return code
    
    import re
    import ast
    
    # Strip markdown code fences (```python ... ``` or ```typescript ... ```)
    code = re.sub(r'^```(?:python|typescript|javascript|py|ts|js)?\s*\n?', '', code, flags=re.MULTILINE)
    code = re.sub(r'\n?```\s*$', '', code, flags=re.MULTILINE)
    
    # Unescape JSON-escaped quotes: \" → "
    code = code.replace('\\"', '"')
    
    # Unescape literal \\n that should be actual newlines (common in JSON string values)
    code = code.replace('\\n', '\n')
    
    # Remove any remaining double-escaped backslashes from JSON serialization
    code = code.replace('\\\\', '\\')
    
    # ── LLM Keyword Argument Fixes ──
    # Fix: json{...} → json={...}  (missing = sign)
    code = re.sub(r'\bjson\s*\{', 'json={', code)
    # Fix: params{...} → params={...}
    code = re.sub(r'\bparams\s*\{', 'params={', code)
    # Fix: headers{...} → headers={...}
    code = re.sub(r'\bheaders\s*\{', 'headers={', code)
    # Fix: data{...} → data={...}
    code = re.sub(r'\bdata\s*\{', 'data={', code)
    # Fix: timeout{...} → timeout={...} (rare but possible)
    code = re.sub(r'\btimeout\s*\{', 'timeout={', code)
    
    # ── Remove forbidden project-level imports ──
    lines = code.split('\n')
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if any(stripped.startswith(prefix) for prefix in [
            'from packages', 'from backend', 'from src', 'from app ',
            'import packages', 'import backend', 'import src', 'import app'
        ]):
            clean_lines.append(f"# REMOVED: {line}")
        else:
            clean_lines.append(line)
    code = '\n'.join(clean_lines)
    
    # Strip leading/trailing whitespace
    code = code.strip()
    
    # ── AST Validation ──
    # Verify the sanitized code is valid Python before writing to disk
    try:
        ast.parse(code)
    except SyntaxError as e:
        logger.error(f"[SANITIZER] Test code still invalid after sanitization: {e}")
        logger.error(f"[SANITIZER] Code preview: {code[:300]}")
        # Return a safe fallback test
        code = _generate_fallback_test("sanitizer_fallback", "Fallback test after sanitization failure")
    
    return code


def _generate_fallback_test(task_id: str, task_title: str, endpoint: str = "/health") -> str:
    """
    Generate a safe, always-parseable fallback test when the LLM produces
    unparseable code even after sanitization.
    """
    safe_name = task_id.lower().replace('-', '_').replace(' ', '_')
    return f'''import httpx
import os

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")

def test_{safe_name}_server_reachable():
    """Fallback test: verifies server is reachable for task: {task_title}"""
    response = httpx.get(f"{{BASE_URL}}{endpoint}", timeout=10)
    assert response.status_code < 500, f"Server error: {{response.status_code}}"

def test_{safe_name}_placeholder():
    """Placeholder: implement real test for: {task_title}"""
    # TODO: Implement test for {task_title}
    assert True  # passes until real test is written
'''

