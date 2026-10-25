import os

def patch_nodes():
    file_path = 'backend/agents/nodes.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Update API Validation Node
    old_api_val_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_validation_dependency_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    new_api_val_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_validation_dependency_node\\n"
        f"OPENAPI={state.get('execution_context', {}).get('openapi_url') or state.get('openapi_spec_url')}\\nBASE_URL={state.get('execution_context', {}).get('api_base_url') or state.get('base_url')}\\n"
        f"MODULES={len(state.get('combined_data', {}).get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    
    old_api_val_vars = """    openapi_url = state.get('openapi_spec_url') or state.get('api_spec', {}).get('openapi_url')
    base_url = state.get('api_base_url') or state.get('application_url')"""
    new_api_val_vars = """    ctx = state.get('execution_context', {})
    openapi_url = ctx.get('openapi_url') or state.get('openapi_spec_url')
    base_url = ctx.get('api_base_url') or state.get('base_url') or state.get('application_url')"""

    text = text.replace(old_api_val_audit, new_api_val_audit)
    text = text.replace(old_api_val_vars, new_api_val_vars)

    # 2. Update API Mock Node
    old_mock_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_mock_agent_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    new_mock_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=api_mock_agent_node\\n"
        f"OPENAPI={state.get('execution_context', {}).get('openapi_url') or state.get('openapi_spec_url')}\\nBASE_URL={state.get('execution_context', {}).get('api_base_url') or state.get('base_url')}\\n"
        f"MODULES={len(state.get('combined_data', {}).get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""

    old_mock_vars = """    openapi_url = state.get('openapi_spec_url')
    base_url = state.get('base_url')"""
    new_mock_vars = """    ctx = state.get('execution_context', {})
    openapi_url = ctx.get('openapi_url') or state.get('openapi_spec_url')
    base_url = ctx.get('api_base_url') or state.get('base_url')"""
    
    text = text.replace(old_mock_audit, new_mock_audit)
    if old_mock_vars in text:
        text = text.replace(old_mock_vars, new_mock_vars)

    # 3. Update Automation Forge Node
    old_forge_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=automation_forge_node\\n"
        f"OPENAPI={state.get('openapi_spec_url')}\\nBASE_URL={state.get('base_url')}\\n"
        f"MODULES={len(state.get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    new_forge_audit = """    logger.error(
        f"\\nNODE_INPUT_AUDIT\\nNODE=automation_forge_node\\n"
        f"OPENAPI={state.get('execution_context', {}).get('openapi_url') or state.get('openapi_spec_url')}\\nBASE_URL={state.get('execution_context', {}).get('api_base_url') or state.get('base_url')}\\n"
        f"MODULES={len(state.get('combined_data', {}).get('modules', []))}\\nTEST_CASES={len(state.get('test_cases', []))}\\nAPI_CONTRACTS={len(state.get('api_contracts', []))}\\n"
    )"""
    
    old_forge_prompt = "    RECOMMENDED FRAMEWORK (from strategy analysis): {framework_hint}"
    new_forge_prompt = """    EXACT SYSTEM MODULES TO MAP: {json.dumps([m.get('name') for m in state.get('combined_data', {}).get('modules', []) if m.get('name')])}
    
    RECOMMENDED FRAMEWORK (from strategy analysis): {framework_hint}"""
    
    text = text.replace(old_forge_audit, new_forge_audit)
    if old_forge_prompt in text:
        text = text.replace(old_forge_prompt, new_forge_prompt)
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    patch_nodes()
    print("Schema drift fixes applied.")
