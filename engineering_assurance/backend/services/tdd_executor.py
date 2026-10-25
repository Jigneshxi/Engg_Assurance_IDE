"""
TDD Contract Executor
=====================
Runs all TDD contracts from the handoff-bundle/tests/ directory as a single
pytest invocation. Streams output via SSE broadcaster. Supports configurable
TEST_BASE_URL via server_config stored in partial_state, and runs pytest from
the tests directory so conftest.py is auto-discovered.
"""
import os
import asyncio
import logging
import json
import glob
import subprocess
from typing import List, Dict, Optional
from backend.services.test_broadcaster import broadcaster
from backend.core.database import SessionLocal, GenerationTask

logger = logging.getLogger(__name__)


def _get_server_config(mission_id: str) -> Optional[str]:
    """Read the developer's configured test_base_url from the task's partial_state."""
    try:
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(
                GenerationTask.task_id == mission_id
            ).first()
            if not task:
                task = db.query(GenerationTask).filter(
                    GenerationTask.mission_id == mission_id,
                    GenerationTask.status == "PROCESSING"
                ).order_by(GenerationTask.created_at.desc()).first()
            if task and task.partial_state:
                server_config = task.partial_state.get("server_config", {})
                return server_config.get("test_base_url")
    except Exception as e:
        logger.warning(f"[TDD-EXECUTOR] Failed to read server_config: {e}")
    return None


async def _health_check(base_url: str) -> bool:
    """Pre-flight health check — verify the target server is reachable."""
    import httpx
    for path in ["/health", "/api/health", "/docs", "/"]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{base_url}{path}")
                if resp.status_code < 500:
                    return True
        except Exception:
            continue
    return False


async def run_tdd_for_changed_files(mission_id: str, changed_files: List[str]):
    """
    Called by codebase_watcher when files change.
    Runs ALL TDD contracts from the handoff-bundle/tests/ directory as a
    single pytest invocation.
    """
    logger.info(f"[TDD-EXECUTOR] Triggered for mission {mission_id}, {len(changed_files)} files changed")

    # Filter: Don't re-trigger if the only changed files are test files themselves
    non_test_files = [f for f in changed_files if not os.path.basename(f).startswith("test_") and not os.path.basename(f).startswith("_test_")]
    if not non_test_files:
        logger.info(f"[TDD-EXECUTOR] Only test files changed. Skipping to prevent infinite loop.")
        return

    workspace_dir = os.environ.get("WORKSPACE_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
    handoff_dir = os.path.join(workspace_dir, "workspace", "missions", mission_id, "handoff-bundle")
    tests_dir = os.path.join(handoff_dir, "tests")

    if not os.path.isdir(tests_dir):
        logger.warning(f"[TDD-EXECUTOR] No tests directory at {tests_dir}")
        await broadcaster.broadcast(mission_id, "[TDD] No test contracts found in handoff bundle.")
        return

    # Discover all test files
    test_files = sorted(glob.glob(os.path.join(tests_dir, "test_*.py")))
    if not test_files:
        logger.warning(f"[TDD-EXECUTOR] No test_*.py files in {tests_dir}")
        await broadcaster.broadcast(mission_id, "[TDD] No test contract files found.")
        return

    await broadcaster.broadcast(mission_id, f"[TDD] Found {len(test_files)} test contracts. Starting execution...")

    # Resolve the target server URL
    configured_url = _get_server_config(mission_id)
    test_base_url = configured_url or "http://localhost:8000"
    await broadcaster.broadcast(mission_id, f"[TDD] Target server: {test_base_url}")

    # Pre-flight health check
    server_reachable = await _health_check(test_base_url)
    if not server_reachable:
        await broadcaster.broadcast(mission_id, f"[TDD] ⚠ Server at {test_base_url} is not reachable — tests will report connection errors")
    else:
        await broadcaster.broadcast(mission_id, f"[TDD] ✓ Server health check passed")

    # Run ALL test files in a single pytest invocation (discovers conftest.py automatically)
    results = await _run_test_suite(mission_id, tests_dir, test_base_url, workspace_dir)

    # Summary
    green_count = sum(1 for v in results.values() if v == "GREEN")
    total = len(results)
    all_green = total > 0 and green_count == total

    summary_msg = f"[TDD] Execution complete: {green_count}/{total} contracts {'🟢 ALL GREEN' if all_green else '🔴 HAS FAILURES'}"
    await broadcaster.broadcast(mission_id, summary_msg)
    logger.info(f"[TDD-EXECUTOR] {summary_msg}")

    # Persist tdd_execution_report to partial_state
    _persist_tdd_report(mission_id, results, all_green)


async def _run_test_suite(mission_id: str, tests_dir: str, test_base_url: str, workspace_dir: str) -> Dict[str, str]:
    """Run the entire tests/ directory as a single pytest invocation and parse per-file results."""

    cmd = ["python", "-m", "pytest", tests_dir, "-v", "--tb=short", "--no-header"]

    safe_env = os.environ.copy()
    safe_env["PYTHONPATH"] = workspace_dir
    safe_env["TEST_BASE_URL"] = test_base_url

    results: Dict[str, str] = {}

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=tests_dir,  # Run from tests dir so conftest.py is auto-discovered
            env=safe_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break

            decoded = line.decode("utf-8", errors="replace").rstrip()
            if not decoded:
                continue

            # Parse per-test results: "test_TASK_001.py::test_task_001_success PASSED"
            if "PASSED" in decoded:
                await broadcaster.broadcast(mission_id, f"[TDD] ✓ {decoded}")
                task_id = _extract_task_id_from_line(decoded)
                if task_id:
                    results[task_id] = "GREEN"
            elif "FAILED" in decoded or "ERROR" in decoded:
                await broadcaster.broadcast(mission_id, f"[TDD] ✗ {decoded}")
                task_id = _extract_task_id_from_line(decoded)
                if task_id and results.get(task_id) != "RED":
                    results[task_id] = "RED"
            elif decoded.startswith("E ") or "Error" in decoded:
                await broadcaster.broadcast(mission_id, f"[TDD] ✗ {decoded}")
            else:
                await broadcaster.broadcast(mission_id, f"[TDD]   {decoded}")

        await process.wait()
        exit_code = process.returncode
        await broadcaster.broadcast(mission_id, f"[TDD] pytest exit code: {exit_code}")

        # For any test files that didn't appear in output, mark as RED
        for test_file in glob.glob(os.path.join(tests_dir, "test_*.py")):
            basename = os.path.basename(test_file)
            task_id = basename.replace("test_", "").replace(".py", "")
            if task_id not in results:
                results[task_id] = "RED"

        return results

    except Exception as e:
        logger.error(f"[TDD-EXECUTOR] Suite execution failed: {e}")
        await broadcaster.broadcast(mission_id, f"[TDD] ❌ EXECUTION ERROR — {e}")
        # Mark all discovered test files as RED
        for test_file in glob.glob(os.path.join(tests_dir, "test_*.py")):
            basename = os.path.basename(test_file)
            task_id = basename.replace("test_", "").replace(".py", "")
            results[task_id] = "RED"
        return results


def _extract_task_id_from_line(line: str) -> Optional[str]:
    """Extract task_id from pytest output like 'test_TASK-001.py::test_task_001_success PASSED'."""
    import re
    # Match test_XXXXX.py at the start of the line
    match = re.search(r'test_([A-Za-z0-9_-]+)\.py', line)
    if match:
        return match.group(1)
    return None


def _persist_tdd_report(mission_id: str, results: Dict[str, str], all_green: bool):
    """Write tdd_execution_report to the task's partial_state for frontend consumption."""
    try:
        with SessionLocal() as db:
            from sqlalchemy.orm.attributes import flag_modified

            # Find the active task for this mission
            task = db.query(GenerationTask).filter(
                GenerationTask.task_id == mission_id
            ).first()

            if not task:
                # Fallback: find by mission_id field
                task = db.query(GenerationTask).filter(
                    GenerationTask.mission_id == mission_id,
                    GenerationTask.status == "PROCESSING"
                ).order_by(GenerationTask.created_at.desc()).first()

            if task:
                partial = dict(task.partial_state or {})
                partial["tdd_execution_report"] = results
                partial["all_tests_green"] = all_green
                task.partial_state = partial
                flag_modified(task, "partial_state")
                db.commit()
                logger.info(f"[TDD-EXECUTOR] Persisted tdd_execution_report for {mission_id}: {len(results)} results, all_green={all_green}")
            else:
                logger.warning(f"[TDD-EXECUTOR] No task found for mission {mission_id} to persist TDD report")
    except Exception as e:
        logger.error(f"[TDD-EXECUTOR] Failed to persist TDD report: {e}")
