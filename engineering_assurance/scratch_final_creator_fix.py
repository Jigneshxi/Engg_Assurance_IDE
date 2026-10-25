import os

def refactor():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Update process_batch with retry loop and json_repair
    old_process_batch_start = """    def process_batch(batch_idx, batch_modules):
        log_step(task_id, f"Creator: Generating Batch {batch_idx + 1}/{len(batches)} (Modules: {', '.join((m.get('name', 'Unknown') for m in batch_modules))})...", 'Creator')
        prompt_dict = {'ROLE': 'Senior Test Architect', 'TASK': 'Generate detailed, atomic, execution-ready test scenarios strictly for the following modules.', 'MODULES_CONTEXT': [{'module_id': m.get('module_id'), 'name': m.get('name'), 'entities': m.get('entities', []), 'workflows': m.get('workflows', []), 'acceptance_criteria': m.get('acceptance_criteria', []), 'risks': m.get('risks', []), 'dependencies': m.get('dependencies', [])} for m in batch_modules], 'CRITICAL_EXECUTION_DIRECTIVES': ['NO GENERIC FALLBACKS. Do not generate generic login/auth cases unless explicitly in the workflows.', 'STRICT TRACEABILITY. Every test case MUST trace to an acceptance criteria listed above.', 'DOMAIN ACCURACY. Use exact business entities mentioned above.', 'OUTPUT STRICTLY JSON. DO NOT INCLUDE REASONING, CHAIN OF THOUGHT, OR <think> TAGS.', 'RETURN ONLY A JSON ARRAY OF TEST CASES.'], 'OUTPUT_FORMAT': [{'case_id': 'TC-[module_id]-001', 'title': '[Specific business-driven title]', 'ac_reference': ['[AC explicitly copied from context]'], 'module': '[Name of the module]', 'workflow': '[Workflow from context]', 'preconditions': [], 'steps': [], 'expected_result': '', 'severity': 'High', 'test_type': 'Functional'}]}
        prompt = json.dumps(prompt_dict, ensure_ascii=False)
        try:"""
        
    new_process_batch_start = """    def process_batch(batch_idx, batch_modules):
        module_name = batch_modules[0].get('name', 'Unknown') if batch_modules else 'Unknown'
        log_step(task_id, f"Creator: Generating Batch {batch_idx + 1}/{len(batches)} (Modules: {', '.join((m.get('name', 'Unknown') for m in batch_modules))})...", 'Creator')
        prompt_dict = {'ROLE': 'Senior Test Architect', 'TASK': 'Generate detailed, atomic, execution-ready test scenarios strictly for the following modules.', 'MODULES_CONTEXT': [{'module_id': m.get('module_id'), 'name': m.get('name'), 'entities': m.get('entities', []), 'workflows': m.get('workflows', []), 'acceptance_criteria': m.get('acceptance_criteria', []), 'risks': m.get('risks', []), 'dependencies': m.get('dependencies', [])} for m in batch_modules], 'CRITICAL_EXECUTION_DIRECTIVES': ['NO GENERIC FALLBACKS. Do not generate generic login/auth cases unless explicitly in the workflows.', 'STRICT TRACEABILITY. Every test case MUST trace to an acceptance criteria listed above.', 'DOMAIN ACCURACY. Use exact business entities mentioned above.', 'OUTPUT STRICTLY JSON. DO NOT INCLUDE REASONING, CHAIN OF THOUGHT, OR <think> TAGS.', 'RETURN ONLY A JSON ARRAY OF TEST CASES.'], 'OUTPUT_FORMAT': [{'case_id': 'TC-[module_id]-001', 'title': '[Specific business-driven title]', 'ac_reference': ['[AC explicitly copied from context]'], 'module': '[Name of the module]', 'workflow': '[Workflow from context]', 'preconditions': [], 'steps': [], 'expected_result': '', 'severity': 'High', 'test_type': 'Functional'}]}
        prompt = json.dumps(prompt_dict, ensure_ascii=False)
        
        last_exception = None
        last_raw_response = "NO_RESPONSE"
        
        for retry in range(3):
            try:"""

    text = text.replace(old_process_batch_start, new_process_batch_start)

    old_parsing = """            def extract_json(text):
                import re, json
                match = re.search('(\\{.*\\}|\\[.*\\])', text, re.S)
                if match:
                    return json.loads(match.group())
                raise ValueError('No JSON found')
            try:
                data = extract_json(content_result)
            except Exception as e:
                logger.error('Invalid JSON')
                data = {'test_cases': []}
            if isinstance(data, list):
                cases = data
            elif isinstance(data, dict):
                if 'test_cases' in data and isinstance(data['test_cases'], list):
                    cases = data['test_cases']
                elif 'case_id' in data or 'title' in data:
                    cases = [data]
                else:
                    cases = []
                    for k, v in data.items():
                        if isinstance(v, list):
                            cases = v
                            break
            else:
                cases = []"""

    new_parsing = """            def extract_json(text):
                import re, json
                try:
                    from json_repair import repair_json
                except ImportError:
                    repair_json = lambda x: x
                match = re.search('(\\{.*\\}|\\[.*\\])', text, re.S)
                if match:
                    raw = match.group()
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        repaired = repair_json(raw)
                        return json.loads(repaired)
                raise ValueError('No JSON found')
            
            try:
                data = extract_json(content_result)
            except Exception as e:
                logger.error('Invalid JSON')
                data = {'test_cases': []}
                
            if isinstance(data, list):
                cases = data
            elif isinstance(data, dict):
                if 'test_cases' in data and isinstance(data['test_cases'], list):
                    cases = data['test_cases']
                elif 'case_id' in data or 'title' in data:
                    cases = [data]
                else:
                    cases = []
                    for k, v in data.items():
                        if isinstance(v, list):
                            cases = v
                            break
            else:
                cases = []"""

    text = text.replace(old_parsing, new_parsing)
    
    old_min_check = """            # Dynamic Minimum Validation
            if len(valid_cases) < minimum:
                raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")
                
            logger.info(f'CREATOR_PARSED_TESTS={len(valid_cases)}')
            logger.info(f"CREATOR_BATCH_MODULES={[m.get('name') for m in batch_modules]}")
            log_step(task_id, f'Batch {batch_idx + 1} generated {len(valid_cases)} test cases.', 'Creator')
            return valid_cases
        except Exception as e:
            module_name = batch_modules[0].get('name', 'Unknown') if batch_modules else 'Unknown'
            raw_response = content_result[:3000] if 'content_result' in locals() else "NO_RESPONSE"
            logger.error(f"\\nCREATOR_BATCH_FAILURE\\nBatch: {batch_idx + 1}\\nModule: {module_name}\\nException: {type(e).__name__}\\nMessage: {str(e)}\\nRaw Response:\\n{raw_response}\\n")
            log_step(task_id, f'Warning: Case generation failed for Batch {batch_idx + 1}.', 'Creator')
            return []"""

    new_min_check = """            # Dynamic Minimum Validation
                if len(valid_cases) < minimum:
                    raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")
                    
                logger.info(f'CREATOR_PARSED_TESTS={len(valid_cases)}')
                logger.info(f"CREATOR_BATCH_MODULES={[m.get('name') for m in batch_modules]}")
                log_step(task_id, f'Batch {batch_idx + 1} generated {len(valid_cases)} test cases.', 'Creator')
                return valid_cases
                
            except Exception as e:
                last_exception = e
                last_raw_response = content_result[:3000] if 'content_result' in locals() else "NO_RESPONSE"
                logger.warning(f"Creator retry {retry + 1}/3 failed for {module_name}: {e}")
                
        # If we exhausted all 3 retries
        logger.error(f"\\nCREATOR_BATCH_FAILURE\\nBatch: {batch_idx + 1}\\nModule: {module_name}\\nException: {type(last_exception).__name__}\\nMessage: {str(last_exception)}\\nRaw Response:\\n{last_raw_response}\\n")
        log_step(task_id, f'Warning: Case generation failed for Batch {batch_idx + 1}.', 'Creator')
        return []"""

    text = text.replace(old_min_check, new_min_check)
    
    old_coverage = """    # Strict Module Coverage Gate
    import os
    expected_modules = {m.get("name") for m in valid_modules if m.get("name")}
    generated_modules = {tc.get("module") for tc in all_test_cases if tc.get("module")}
    missing = expected_modules - generated_modules"""

    new_coverage = """    # Strict Module Coverage Gate
    import os
    def module_id(name):
        if not name: return "Unknown"
        return name.split(":")[0].strip()
        
    expected_modules = {module_id(m.get("name")) for m in valid_modules if m.get("name")}
    generated_modules = {module_id(tc.get("module")) for tc in all_test_cases if tc.get("module")}
    missing = expected_modules - generated_modules"""

    text = text.replace(old_coverage, new_coverage)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    refactor()
    print("DONE")
