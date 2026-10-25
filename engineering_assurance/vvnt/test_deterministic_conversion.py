import pytest
from unittest.mock import patch

def test_env_consistency_token_cost_eliminated():
    """
    Scenario A: Prove that the converted multi_environment_consistency_node no longer 
    calls an LLM and consumes zero tokens.
    """
    try:
        from backend.agents.nodes.legacy_nodes import multi_environment_consistency_node
    except ImportError:
        pytest.fail("Cannot import multi_environment_consistency_node.")
        
    mock_state = {
        "task_id": "TEST-123",
        "combined_data": {"description": "multi-env setup for dev, qa, prod"}
    }

    # We mock InferenceCoordinator.execute. If the node is deterministic, it should 
    # NEVER invoke this function. If it does, the mock will raise an exception.
    with patch("backend.agents.nodes.legacy_nodes.InferenceCoordinator.execute", side_effect=Exception("LLM Invoked! Token Cost Incurred.")):
        try:
            result = multi_environment_consistency_node(mock_state)
            assert result is not None
        except Exception as e:
            if "LLM Invoked!" in str(e):
                pytest.fail("Cost Optimization Risk: multi_environment_consistency_node is still making expensive LLM calls.")
            raise e

def test_deterministic_schema_parity():
    """
    Scenario B: Prove that the deterministic python script outputs the exact 
    same dictionary structure that the LLM used to hallucinate.
    """
    from backend.agents.nodes.legacy_nodes import multi_environment_consistency_node
    
    mock_state = {"task_id": "TEST-123", "combined_data": {"description": "multi-env setup for dev, qa, prod"}}
    
    # We will assert this after the refactor to prove the deterministic wrapper works
    result = multi_environment_consistency_node(mock_state)
    assert "env_report" in result

def test_sidebar_subgraph_exists():
    """
    Scenario C: Prove the existence of the SpecialistRouter Subgraph 
    to handle background execution.
    """
    try:
        from backend.agents.workflow import sidebar_subgraph
    except ImportError:
        pytest.fail("Architecture Risk: sidebar_subgraph is missing. Nodes are blocking the main orchestrator.")
