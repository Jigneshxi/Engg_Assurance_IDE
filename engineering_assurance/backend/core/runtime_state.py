"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - RUNTIME STATE MANAGEMENT
================================================================================
Clears stale in-memory mission buffers and marks abandoned work as failed on
startup so a backend restart behaves like a clean slate.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from sqlalchemy.orm.attributes import flag_modified

from backend.agents.state import reset_runtime_buffers
from backend.core.database import GenerationTask, SessionLocal
from backend.core.node_cache import node_cache

logger = logging.getLogger(__name__)

_RUNTIME_SESSION_ENV = "VVNT_RUNTIME_SESSION_ID"


def bootstrap_runtime_session() -> str:
    """
    Create a fresh runtime fingerprint for the current backend process.

    The value is stored in-process and exported to the environment so the rest
    of the app can tag fresh missions and reject stale restoration paths.
    """
    runtime_id = uuid.uuid4().hex
    os.environ[_RUNTIME_SESSION_ENV] = runtime_id
    logger.info(f"[RUNTIME] Bootstrapped fresh runtime session {runtime_id[:8]}.")
    return runtime_id


def get_runtime_session_id() -> str:
    """Return the current process runtime fingerprint, if any."""
    return os.environ.get(_RUNTIME_SESSION_ENV, "")


def clear_stale_runtime_state(mark_orphans_failed: bool = True) -> dict:
    """
    Clear in-memory mission buffers, purge node cache, and optionally fail any
    tasks that were left in PENDING/PROCESSING state by a previous process.
    """
    reset_runtime_buffers()

    cache_purged = 0
    try:
        cache_purged = node_cache.clear_all()
    except Exception as exc:
        logger.warning(f"[RUNTIME] Node cache purge skipped: {exc}")

    orphaned = 0
    if mark_orphans_failed:
        try:
            with SessionLocal() as db:
                tasks = db.query(GenerationTask).filter(
                    GenerationTask.status.in_(("PENDING", "PROCESSING"))
                ).all()
                orphaned = len(tasks)
                for task in tasks:
                    task.status = "FAILED"
                    task.error = "Task orphaned during backend restart. Please start a new mission."
                    task.logs = []
                    task.partial_state = {}
                    task.result = None
                    flag_modified(task, "logs")
                    flag_modified(task, "partial_state")
                if tasks:
                    db.commit()
        except Exception as exc:
            logger.warning(f"[RUNTIME] Orphan cleanup skipped: {exc}")

    logger.info(
        "[RUNTIME] Clean startup complete: "
        f"orphaned_tasks={orphaned}, node_cache_purged={cache_purged}."
    )
    return {
        "orphaned_tasks": orphaned,
        "node_cache_purged": cache_purged,
    }


def task_runtime_session(task: Optional[GenerationTask]) -> str:
    """Return the runtime session ID tagged on a task, if present."""
    if not task:
        return ""

    partial_state = task.partial_state if isinstance(task.partial_state, dict) else {}
    result = task.result if isinstance(task.result, dict) else {}
    for payload in (partial_state, result):
        runtime_id = str(payload.get("runtime_session_id") or "").strip()
        if runtime_id:
            return runtime_id
    return ""
