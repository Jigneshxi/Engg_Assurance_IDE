import os

def fix_nodes():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Fix prompt_dict to use actual module ID instead of 'TC-[module_id]-001'
    # Finding the exact process_batch signature and prompt_dict inside it
    old_prompt_dict_start = """    def process_batch(batch_idx, batch_modules):
        module_name = batch_modules[0].get('name', 'Unknown') if batch_modules else 'Unknown'
        log_step(task_id, f"Creator: Generating Batch {batch_idx + 1}/{len(batches)} (Modules: {', '.join((m.get('name', 'Unknown') for m in batch_modules))})...", 'Creator')
        
        prompt_dict = {
            'ROLE': 'Senior Test Architect', 
            'TASK': 'Generate detailed, atomic, execution-ready test scenarios strictly for the following modules.', 
            'MODULES_CONTEXT': [{'module_id': m.get('module_id'), 'name': m.get('name'), 'entities': m.get('entities', []), 'workflows': m.get('workflows', []), 'acceptance_criteria': m.get('acceptance_criteria', []), 'risks': m.get('risks', []), 'dependencies': m.get('dependencies', [])} for m in batch_modules], 
            'CRITICAL_EXECUTION_DIRECTIVES': ['NO GENERIC FALLBACKS. Do not generate generic login/auth cases unless explicitly in the workflows.', 'STRICT TRACEABILITY. Every test case MUST trace to an acceptance criteria listed above.', 'DOMAIN ACCURACY. Use exact business entities mentioned above.', 'OUTPUT STRICTLY JSON. DO NOT INCLUDE REASONING, CHAIN OF THOUGHT, OR <think> TAGS.', 'RETURN ONLY A JSON ARRAY OF TEST CASES.'], 
            'OUTPUT_FORMAT': [{'case_id': 'TC-[module_id]-001', 'title': '[Specific business-driven title]', 'ac_reference': ['[AC explicitly copied from context]'], 'module': '[Name of the module]', 'workflow': '[Workflow from context]', 'preconditions': [], 'steps': [], 'expected_result': '', 'severity': 'High', 'test_type': 'Functional'}]
        }"""
        
    new_prompt_dict_start = """    def process_batch(batch_idx, batch_modules):
        module_name = batch_modules[0].get('name', 'Unknown') if batch_modules else 'Unknown'
        log_step(task_id, f"Creator: Generating Batch {batch_idx + 1}/{len(batches)} (Modules: {', '.join((m.get('name', 'Unknown') for m in batch_modules))})...", 'Creator')
        
        actual_module_id = batch_modules[0].get('module_id') if batch_modules else None
        if not actual_module_id:
            actual_module_id = module_name.split(':')[0].strip() if module_name else 'UNKNOWN'
            
        prompt_dict = {
            'ROLE': 'Senior Test Architect', 
            'TASK': 'Generate detailed, atomic, execution-ready test scenarios strictly for the following modules.', 
            'MODULES_CONTEXT': [{'module_id': actual_module_id, 'name': m.get('name'), 'entities': m.get('entities', []), 'workflows': m.get('workflows', []), 'acceptance_criteria': m.get('acceptance_criteria', []), 'risks': m.get('risks', []), 'dependencies': m.get('dependencies', [])} for m in batch_modules], 
            'CRITICAL_EXECUTION_DIRECTIVES': ['NO GENERIC FALLBACKS. Do not generate generic login/auth cases unless explicitly in the workflows.', 'STRICT TRACEABILITY. Every test case MUST trace to an acceptance criteria listed above.', 'DOMAIN ACCURACY. Use exact business entities mentioned above.', 'OUTPUT STRICTLY JSON. DO NOT INCLUDE REASONING, CHAIN OF THOUGHT, OR <think> TAGS.', 'RETURN ONLY A JSON ARRAY OF TEST CASES.'], 
            'OUTPUT_FORMAT': [{'case_id': f'TC-{actual_module_id}-001', 'title': '[Specific business-driven title]', 'ac_reference': ['[AC explicitly copied from context]'], 'module': f'{actual_module_id}', 'workflow': '[Workflow from context]', 'preconditions': [], 'steps': [], 'expected_result': '', 'severity': 'High', 'test_type': 'Functional'}]
        }"""

    text = text.replace(old_prompt_dict_start, new_prompt_dict_start)


    # 2. Add Auto-Recovery loop before the Strict Coverage Gate
    old_coverage_gate = """    # Strict Module Coverage Gate
    import os
    def module_id(name):
        if not name: return "Unknown"
        return name.split(":")[0].strip()
        
    expected_modules = {module_id(m.get("name")) for m in valid_modules if m.get("name")}
    generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module")}
    missing = expected_modules - generated_modules"""

    new_coverage_gate = """    # Strict Module Coverage Gate
    import os
    def module_id(name):
        if not name: return "Unknown"
        return name.split(":")[0].strip()
        
    expected_modules = {module_id(m.get("name")) for m in valid_modules if m.get("name")}
    generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module")}
    missing = expected_modules - generated_modules
    
    # Auto-Recovery Loop for Missing Modules
    if missing:
        logger.warning(f"Missing modules detected: {missing}. Initiating auto-recovery...")
        log_step(task_id, f"Auto-recovering {len(missing)} missing modules...", "Creator")
        missing_list = [m for m in sorted_modules if module_id(m.get("name")) in missing]
        
        for idx, missing_mod in enumerate(missing_list):
            res = process_batch(100 + idx, [missing_mod])
            if res:
                all_test_cases.extend(res)
                
        # Re-evaluate missing after recovery
        generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module")}
        missing = expected_modules - generated_modules"""
        
    text = text.replace(old_coverage_gate, new_coverage_gate)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_nodes()
    print("Fixed prompt format and added auto recovery")
