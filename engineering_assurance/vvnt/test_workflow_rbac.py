import pytest

def test_rbac_architecture_exists():
    """
    Scenario 0: Prove the missing architecture.
    The RBAC/FGA module must exist to prevent arbitrary graph transitions.
    """
    try:
        from backend.core.rbac import OpenFGPEvaluator
    except ImportError:
        pytest.fail("Architecture Risk: backend.core.rbac is missing. The DAG has no Zero-Trust perimeter.")

def test_rbac_permit_safe_action():
    """
    Scenario A: Asserts that a safe read action from an authorized persona is permitted.
    """
    from backend.core.rbac import OpenFGPEvaluator
    
    evaluator = OpenFGPEvaluator()
    
    # qa_engineer is allowed to run api_validation_node
    is_allowed = evaluator.check_permission(
        subject="role:qa_engineer",
        action="execute",
        resource="node:api_validation_node"
    )
    
    assert is_allowed is True, "FGA Error: Authorized persona was denied a safe action."

def test_rbac_deny_dangerous_action():
    """
    Scenario B: Asserts that a critical write action from an unauthorized persona is explicitly denied.
    """
    from backend.core.rbac import OpenFGPEvaluator
    
    evaluator = OpenFGPEvaluator()
    
    # marketing_agent is NOT allowed to deploy to production
    is_allowed = evaluator.check_permission(
        subject="role:marketing_agent",
        action="execute",
        resource="node:production_deploy_node"
    )
    
    assert is_allowed is False, "Security Risk: Unauthorized persona bypassed the FGA firewall!"

def test_rbac_conditional_edge_router():
    """
    Scenario C: Proves the LangGraph conditional router correctly evaluates the RBAC state.
    """
    from backend.core.rbac import rbac_transition_guard
    
    # Mock LangGraph State
    state_permit = {
        "role": "qa_engineer",
        "next_node": "api_validation_node"
    }
    
    # The guard should return the target node if permitted
    assert rbac_transition_guard(state_permit) == "api_validation_node"
    
    state_deny = {
        "role": "marketing_agent",
        "next_node": "production_deploy_node"
    }
    
    # The guard should route to a security violation fallback if denied
    assert rbac_transition_guard(state_deny) == "security_violation_node"
