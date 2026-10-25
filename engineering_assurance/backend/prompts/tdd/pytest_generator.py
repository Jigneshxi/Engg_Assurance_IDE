"""
TDD Pytest Contract Generator
==============================
Isolated prompt module for generating HTTP integration tests.
Keeps orchestration (phase2_graph / forges.py) separate from prompt engineering.
"""
import json
from typing import Dict, Any, List


def build_tdd_contract_prompt(task: Dict[str, Any]) -> str:
    """
    Build a strict TDD contract prompt for a single engineering task.
    Returns a prompt string that instructs the LLM to generate
    httpx-based integration tests with zero project dependencies.
    """
    task_id = task.get("task_id") or task.get("id") or "TASK-001"
    safe_id = task_id.lower().replace("-", "_")
    title = task.get("title", "")
    description = task.get("description", "")
    acceptance_criteria = task.get("acceptance_criteria", [])
    target_paths = task.get("target_paths", [])
    endpoint_hint = target_paths[0] if target_paths else "/api/endpoint"

    return f"""Generate pytest tests for this engineering task.

TASK ID: {task_id}
TITLE: {title}
DESCRIPTION: {description}
ENDPOINT HINT: {endpoint_hint}
ACCEPTANCE CRITERIA: {json.dumps(acceptance_criteria)}

YOU MUST FOLLOW THESE RULES EXACTLY:
1. Import ONLY from: httpx, os, pytest, json, time — nothing else
2. NEVER write: from packages import, from backend import, from src import, from app import
3. NEVER call undefined functions like register_user(), login_user(), create_order()
4. Use HTTP calls via httpx to test the API
5. BASE_URL comes from environment variable
6. Output the Python code ONLY — no markdown, no explanation, no code fences

OUTPUT THIS EXACT STRUCTURE — no variations:

import httpx
import os
import pytest

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")

def test_{safe_id}_success():
    response = httpx.post(f"{{BASE_URL}}/endpoint", json={{"key": "value"}}, timeout=10)
    assert response.status_code in [200, 201]

def test_{safe_id}_invalid():
    response = httpx.post(f"{{BASE_URL}}/endpoint", json={{}}, timeout=10)
    assert response.status_code in [400, 422]

Replace /endpoint with the actual REST endpoint for this task.
Replace the json bodies with realistic test data matching the acceptance criteria.
Generate 2-4 test functions covering the main success case and edge cases."""


def build_batch_enrichment_prompt(
    batch: List[Dict[str, Any]],
    batch_num: int,
    total_batches: int,
    relevant_context: Dict[str, Any]
) -> str:
    """
    Build the batch enrichment prompt used by engineering_contract_node.
    This enriches engineering tasks with acceptance criteria, TDD contracts,
    and target paths — all in one LLM call per batch.
    """
    return f"""
ROLE: Lead V&V Engineering Architect
TASK: For EACH of the provided engineering tasks, generate strict Acceptance Criteria, Test-Driven Development (TDD) contracts, and target file paths.

CONTEXT:
{json.dumps(relevant_context, default=str)[:2000]}

ENGINEERING TASKS TO ENRICH (Batch {batch_num}/{total_batches}):
{json.dumps(batch, indent=2)}

RULES:
1. Output a JSON object with the key 'tasks'.
2. 'tasks' MUST be an array of exactly {len(batch)} task objects.
3. Each task object MUST have:
   - 'task_id' (string, MUST exactly match the input task 'id' or 'task_id')
   - 'title' (string, copied from input)
   - 'description' (string, copied from input)
   - 'acceptance_criteria' (list of strings)
   - 'tdd_contract' (string: python pytest code using HTTP integration testing)
   - 'target_paths' (list of strings). You MUST use this exact mapping convention:
        Frontend changes -> "apps/frontend/src/..."
        Backend changes -> "packages/backend/api/..." or "packages/backend/core/..."
        Database changes -> "infrastructure/db/..."
   - 'capability_refs' (list of strings, mapped to capabilities in the system spec)

ABSOLUTE TDD CONTRACT RULES — FOLLOW EXACTLY:
1. NEVER import from the project codebase (no 'from packages...', no 'from backend...', no 'from app...')
2. NEVER call undefined helper functions (no register_user(), no login_user(), no create_order())
3. ALWAYS use httpx to make HTTP calls directly
4. ALWAYS use BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
5. Tests MUST run standalone with ZERO project dependencies
6. Import ONLY from: httpx, os, pytest, json, time

REQUIRED tdd_contract STRUCTURE — copy this exactly:

import httpx
import os
import pytest

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")

def test_task_id_success():
    response = httpx.post(f"{{BASE_URL}}/endpoint", json={{"key": "value"}}, timeout=10)
    assert response.status_code in [200, 201]

def test_task_id_invalid():
    response = httpx.post(f"{{BASE_URL}}/endpoint", json={{}}, timeout=10)
    assert response.status_code in [400, 422]

OUTPUT JSON FORMAT:
{{
  "tasks": [
    {{
      "task_id": "TASK-001",
      "title": "...",
      "description": "...",
      "acceptance_criteria": ["..."],
      "tdd_contract": "import httpx\\nimport os\\nimport pytest\\n\\nBASE_URL = os.environ.get('TEST_BASE_URL', 'http://localhost:8000')\\n\\ndef test_task_001_success():\\n    response = httpx.post(f'{{BASE_URL}}/endpoint', json={{}}, timeout=10)\\n    assert response.status_code in [200, 201]",
      "target_paths": ["packages/backend/api/routes.py"],
      "capability_refs": ["CAP-001"]
    }}
  ]
}}

CRITICAL: You must generate an enriched task for EVERY SINGLE TASK provided in the batch. Do not skip any.
"""


# ─── conftest.py template ────────────────────────────────────────────────────
CONFTEST_TEMPLATE = '''# conftest.py — auto-generated by AI Engineering Assurance Platform
# Provides session-scoped httpx fixtures for TDD contract tests.
import pytest
import httpx
import os

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")

@pytest.fixture(scope="session")
def api():
    """Session-scoped httpx client for API integration tests."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        yield client

@pytest.fixture(scope="session")
def auth_token(api):
    """Attempt to obtain an auth token for protected endpoint tests."""
    response = api.post("/auth/login", json={
        "email": "test@example.com",
        "password": "testpass123"
    })
    if response.status_code == 200:
        return response.json().get("token", "")
    return ""

@pytest.fixture(scope="session")
def auth_client(auth_token):
    """Authenticated httpx client with Bearer token."""
    with httpx.Client(
        base_url=BASE_URL,
        timeout=10.0,
        headers={"Authorization": f"Bearer {auth_token}"}
    ) as client:
        yield client
'''
