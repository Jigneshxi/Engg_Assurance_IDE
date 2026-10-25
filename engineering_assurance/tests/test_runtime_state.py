from pathlib import Path
import sys
import uuid
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_reset_runtime_buffers_clears_buffered_task_state():
    state_module = sys.modules.get("backend.agents.state")
    if state_module is not None and not hasattr(state_module, "reset_runtime_buffers"):
        sys.modules.pop("backend.agents.state", None)

    from backend.agents.state import log_step, reset_runtime_buffers, write_partial_state

    task_id = f"task-{uuid.uuid4().hex[:8]}"

    write_partial_state._buffer = {task_id: {"combined_data": {"summary": "stale"}}}
    write_partial_state._last_flush = {task_id: 123.0}
    write_partial_state._lock = threading.Lock()
    log_step._log_buffer = {task_id: [{"message": "stale"}]}
    log_step._log_last_flush = {task_id: 123.0}
    log_step._log_min_level = {task_id: 3}
    log_step._lock = threading.Lock()

    reset_runtime_buffers(task_id)

    assert task_id not in write_partial_state._buffer
    assert task_id not in write_partial_state._last_flush
    assert task_id not in log_step._log_buffer
    assert task_id not in log_step._log_last_flush
    assert task_id not in log_step._log_min_level


def test_node_cache_clear_all_removes_cached_entries():
    from backend.core.node_cache import node_cache

    cache_key = f"runtime-cache-{uuid.uuid4().hex}"
    input_hash = uuid.uuid4().hex
    payload = {"status": "stale"}

    node_cache.set(cache_key, input_hash, payload)
    cached = node_cache.get(cache_key, input_hash, use_cache=True)
    assert cached == payload

    purged = node_cache.clear_all()
    assert purged >= 1
    assert node_cache.get(cache_key, input_hash, use_cache=True) is None
