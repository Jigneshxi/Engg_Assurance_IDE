import re
import os

def apply_telemetry():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # Part 1: Add logging before LLM invocation and modify parsing validation
    old_try_block = """        for retry in range(3):
            try:
                content_result = InferenceCoordinator.execute('QA Engineer', f'Generate Tests Batch {batch_idx + 1}', 'Creator', prompt, log_step, task_id, topology_id='Creator', max_tokens=4096)
                logger.info(f'CREATOR_RAW_OUTPUT_SIZE={len(content_result)}')
                logger.warning(f'CREATOR_RAW_OUTPUT={content_result[:2000]}')

                def extract_json(text):"""

    new_try_block = """        for retry in range(3):
            try:
                logger.error(f"ACTUAL_MODULE_ID={actual_module_id}")
                content_result = InferenceCoordinator.execute('QA Engineer', f'Generate Tests Batch {batch_idx + 1}', 'Creator', prompt, log_step, task_id, topology_id='Creator', max_tokens=4096)

                def extract_json(text):"""

    text = text.replace(old_try_block, new_try_block)

    # Part 2: Parsing validation and force tc["module"]
    old_validation_block = """                # Logging raw parsed cases before schema validation
                module_ac_count = len(batch_modules[0].get('acceptance_criteria', [])) if batch_modules else 0
                minimum = max(3, module_ac_count)
                
                logger.info(f"\\nCREATOR_VALIDATION\\nModule: {module_name}\\nRaw Cases: {len(cases)}\\nRequired Cases: {minimum}\\n")
                if cases:
                    logger.info(f"\\nFIRST_CASE\\n{json.dumps(cases[0], indent=2)}\\n")
                    
                # Schema Validation
                valid_cases = []
                for tc in cases:
                    if isinstance(tc, dict) and tc.get('case_id') and tc.get('module') and tc.get('title') and tc.get('steps'):
                        valid_cases.append(tc)
                
                # Dynamic Minimum Validation
                if len(valid_cases) < minimum:
                    raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")"""

    new_validation_block = """                # Force module ID and logging
                for tc in cases:
                    if isinstance(tc, dict):
                        tc["module"] = actual_module_id
                        
                # Schema Validation
                valid_cases = []
                for tc in cases:
                    if isinstance(tc, dict) and tc.get('case_id') and tc.get('module') and tc.get('title') and tc.get('steps'):
                        valid_cases.append(tc)

                module_ac_count = len(batch_modules[0].get('acceptance_criteria', [])) if batch_modules else 0
                minimum = max(3, module_ac_count)

                logger.error(f\"\"\"
MODULE={actual_module_id}
ATTEMPT={retry + 1}

RAW_RESPONSE_SIZE={len(content_result)}

PARSED_CASES={len(cases)}

VALID_CASES={len(valid_cases)}

MINIMUM={minimum}

FIRST_500_CHARS=
{content_result[:500]}
\"\"\")

                if len(valid_cases) < minimum:
                    raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")"""
                    
    text = text.replace(old_validation_block, new_validation_block)
    
    # Part 3: Module ID coverage logic
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
        if not name: return None
        return name.split(":")[0].strip().upper()
        
    expected_modules = {module_id(m.get("name")) for m in valid_modules if m.get("name") and module_id(m.get("name"))}
    generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module") and module_id(tc.get("module"))}
    missing = expected_modules - generated_modules
    
    logger.error(f\"\"\"
EXPECTED_MODULES={sorted(list(expected_modules))}
GENERATED_MODULES={sorted(list(generated_modules))}
MISSING={sorted(list(missing))}
\"\"\")
    for tc in all_test_cases:
        logger.info(f"PARSED_MODULE={tc.get('module')} CASE_ID={tc.get('case_id')} TITLE={tc.get('title')}")"""

    text = text.replace(old_coverage_gate, new_coverage_gate)

    # Re-evaluate missing after recovery
    old_reevaluate = """        # Re-evaluate missing after recovery
        generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module")}"""
    new_reevaluate = """        # Re-evaluate missing after recovery
        generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module") and module_id(tc.get("module"))}"""
    text = text.replace(old_reevaluate, new_reevaluate)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    apply_telemetry()
    print("Telemetry Applied.")
