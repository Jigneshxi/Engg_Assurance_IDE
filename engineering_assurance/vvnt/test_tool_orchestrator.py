import pytest

def test_tool_orchestrator_exists():
    """
    Scenario 0: Prove the missing architecture.
    The ToolOrchestrator class must exist to prevent LLM tool hallucinations.
    """
    try:
        from backend.tools.ToolOrchestrator import ToolOrchestrator
    except ImportError:
        pytest.fail("Architecture Risk: ToolOrchestrator is missing. Agents are hallucinating their external interactions.")

def test_tier_a_sync_execution():
    """
    Scenario A: Asserts that Tier A tools (like eslint or openapi-validator) 
    are executed synchronously and successfully.
    """
    from backend.tools.ToolOrchestrator import ToolOrchestrator
    
    orchestrator = ToolOrchestrator()
    
    # We simulate an LLM calling a registered Tier A tool
    result = orchestrator.execute("eslint_scan", {"target_dir": "src/app"})
    
    assert result.get("status") == "success", "Tier A execution failed."
    assert "eslint" in result.get("output", "").lower(), "Expected linting output."

def test_tier_b_security_firewall():
    """
    Scenario B: Asserts that Tier B tools (like terraform or docker-compose) 
    are explicitly intercepted by the orchestrator and suspended for human review.
    """
    from backend.tools.ToolOrchestrator import ToolOrchestrator, ToolExecutionSuspended
    
    orchestrator = ToolOrchestrator()
    
    # We simulate an LLM autonomously attempting to spin up infrastructure
    with pytest.raises(ToolExecutionSuspended) as exc_info:
        orchestrator.execute("terraform_apply", {"config_path": "infra/main.tf"})
        
    assert "requires human approval" in str(exc_info.value).lower(), "Security Risk: Tier B firewall was bypassed!"
