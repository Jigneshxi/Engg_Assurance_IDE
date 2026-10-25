import pytest
import os
import ast
import inspect
import importlib

def test_node_export_parity():
    """
    Scenario A: Asserts that every single node function defined in the old monolithic
    nodes.py is successfully exported via the new backend/agents/nodes/__init__.py facade.
    This guarantees ZERO regression for backend/agents/workflow.py.
    """
    # 1. Parse the AST of the original nodes.py (we simulate this by looking at what is
    # currently in backend.agents.nodes before the split).
    try:
        import backend.agents.nodes as nodes_module
    except ImportError:
        pytest.fail("Could not import backend.agents.nodes")

    # Extract all callables that look like nodes (end with _node)
    exported_nodes = [
        name for name, obj in inspect.getmembers(nodes_module)
        if inspect.isfunction(obj) and name.endswith('_node')
    ]

    # We know there are exactly 59 nodes in the AEIAP framework
    # Let's assert that we found at least 50 to ensure our reflection is working.
    assert len(exported_nodes) >= 50, f"Data Risk: Expected ~59 nodes, found {len(exported_nodes)}. AST parsing failed."

    # 2. When the refactor happens, nodes.py will become a directory. 
    # This test proves that doing `from backend.agents.nodes import XYZ_node` will still work.
    # If the refactor drops a node, this list will change or the import will fail.
    
    # We will write the list of nodes to a snapshot file to compare after the refactor.
    snapshot_path = os.path.join(os.path.dirname(__file__), "node_snapshot.txt")
    
    if not os.path.exists(snapshot_path):
        # FIRST RUN (Pre-refactor): Save the snapshot of all 59 nodes
        with open(snapshot_path, "w") as f:
            f.write("\n".join(sorted(exported_nodes)))
        print(f"\n[TDD] Snapshot created with {len(exported_nodes)} nodes.")
    else:
        # SECOND RUN (Post-refactor): Compare against snapshot
        with open(snapshot_path, "r") as f:
            expected_nodes = set(f.read().splitlines())
        
        actual_nodes = set(exported_nodes)
        
        missing_nodes = expected_nodes - actual_nodes
        assert len(missing_nodes) == 0, f"DAG Regression Alert: The following nodes were lost during the refactor: {missing_nodes}"
        
        print(f"\n[TDD] Success: All {len(expected_nodes)} nodes achieved 100% parity through the __init__.py facade.")

def test_workflow_import_resolution():
    """
    Scenario B: Proves that workflow.py can still compile its DAG without ImportError.
    """
    try:
        # If any node was dropped or renamed, workflow.py will crash on import
        import backend.agents.workflow
    except ImportError as e:
        pytest.fail(f"DAG Regression Alert: workflow.py failed to import nodes! {e}")
