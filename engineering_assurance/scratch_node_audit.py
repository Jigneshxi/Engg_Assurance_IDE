import os

def add_audits():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. API Validation Audit
    old_api_val = "def api_validation_dependency_node(state: AgentState):"
    new_api_val = """def api_validation_dependency_node(state: AgentState):
    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_validation_dependency_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    if old_api_val in text:
        text = text.replace(old_api_val, new_api_val, 1)

    # 2. API Mock Audit
    old_api_mock = "def api_mock_agent_node(state: AgentState):"
    new_api_mock = """def api_mock_agent_node(state: AgentState):
    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_mock_agent_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    if old_api_mock in text:
        text = text.replace(old_api_mock, new_api_mock, 1)

    # 3. Automation Forge Audit
    old_forge = "def automation_forge_node(state: AgentState):"
    new_forge = """def automation_forge_node(state: AgentState):
    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=automation_forge_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    if old_forge in text:
        text = text.replace(old_forge, new_forge, 1)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    add_audits()
    print("Node input audits added.")
