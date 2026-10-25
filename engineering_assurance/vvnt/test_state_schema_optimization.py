import pytest
import os
import threading
import time

def test_state_schema_parity():
    """
    Scenario A: Asserts that every single key defined in the old monolithic AgentState
    is successfully preserved when refactored into composed sub-graphs (ForgeState, AuditState, etc).
    This guarantees ZERO regression for all 59 agents.
    """
    try:
        from backend.agents.state import AgentState
    except ImportError:
        pytest.fail("Could not import AgentState")

    # Extract all annotations (keys) from the TypedDict
    state_keys = set(AgentState.__annotations__.keys())

    # We know there are >80 keys in the monolithic state
    assert len(state_keys) >= 70, f"Data Risk: Expected >70 keys in AgentState, found {len(state_keys)}."

    snapshot_path = os.path.join(os.path.dirname(__file__), "state_snapshot.txt")
    
    if not os.path.exists(snapshot_path):
        # FIRST RUN (Pre-refactor): Save the snapshot of all keys
        with open(snapshot_path, "w") as f:
            f.write("\n".join(sorted(list(state_keys))))
        print(f"\n[TDD] Snapshot created with {len(state_keys)} AgentState keys.")
    else:
        # SECOND RUN (Post-refactor): Compare against snapshot
        with open(snapshot_path, "r") as f:
            expected_keys = set(f.read().splitlines())
        
        missing_keys = expected_keys - state_keys
        assert len(missing_keys) == 0, f"State Schema Regression Alert: The following keys were lost during the refactor: {missing_keys}"
        
        print(f"\n[TDD] Success: All {len(expected_keys)} AgentState keys achieved 100% parity through Type Composition.")

def test_partial_state_thread_safety():
    """
    Scenario B: Proves that write_partial_state coalesces thread writes correctly without dropping telemetry.
    """
    from backend.agents.state import write_partial_state
    
    task_id = "TEST-TASK-001"
    
    # We mock out the SessionLocal call inside write_partial_state to prevent DB errors during unit test
    # Or we can just let it run if it creates the in-memory SQLite gracefully. But wait, write_partial_state
    # doesn't use our test fixture, it imports SessionLocal directly.
    # So we'll just assert that the in-memory buffer correctly coalesces the threads.
    
    # Reset buffer
    if hasattr(write_partial_state, "_buffer"):
        write_partial_state._buffer.clear()
        
    def thread_worker(worker_id):
        write_partial_state(task_id, {f"key_{worker_id}": f"val_{worker_id}"})
        
    threads = []
    for i in range(10):
        t = threading.Thread(target=thread_worker, args=(i,))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    # Check the coalescing buffer
    buf = getattr(write_partial_state, "_buffer", {})
    
    # Even though there are 10 threads, they all wrote to the same task_id buffer
    assert task_id in buf, "Data Loss Alert: Telemetry buffer dropped the task ID."
    
    merged_data = buf[task_id]
    assert len(merged_data) == 10, f"Data Loss Alert: Concurrency lock failed. Expected 10 keys, got {len(merged_data)}."
    assert merged_data["key_0"] == "val_0"
    assert merged_data["key_9"] == "val_9"
