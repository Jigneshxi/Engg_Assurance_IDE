import json

def fix_indentation():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    start = text.find('    def process_batch(batch_idx, batch_modules):')
    end = text.find('    with ThreadPoolExecutor', start)

    new_func = """    def process_batch(batch_idx, batch_modules):
        module_name = batch_modules[0].get('name', 'Unknown') if batch_modules else 'Unknown'
        log_step(task_id, f"Creator: Generating Batch {batch_idx + 1}/{len(batches)} (Modules: {', '.join((m.get('name', 'Unknown') for m in batch_modules))})...", 'Creator')
        
        prompt_dict = {
            'ROLE': 'Senior Test Architect', 
            'TASK': 'Generate detailed, atomic, execution-ready test scenarios strictly for the following modules.', 
            'MODULES_CONTEXT': [{'module_id': m.get('module_id'), 'name': m.get('name'), 'entities': m.get('entities', []), 'workflows': m.get('workflows', []), 'acceptance_criteria': m.get('acceptance_criteria', []), 'risks': m.get('risks', []), 'dependencies': m.get('dependencies', [])} for m in batch_modules], 
            'CRITICAL_EXECUTION_DIRECTIVES': ['NO GENERIC FALLBACKS. Do not generate generic login/auth cases unless explicitly in the workflows.', 'STRICT TRACEABILITY. Every test case MUST trace to an acceptance criteria listed above.', 'DOMAIN ACCURACY. Use exact business entities mentioned above.', 'OUTPUT STRICTLY JSON. DO NOT INCLUDE REASONING, CHAIN OF THOUGHT, OR <think> TAGS.', 'RETURN ONLY A JSON ARRAY OF TEST CASES.'], 
            'OUTPUT_FORMAT': [{'case_id': 'TC-[module_id]-001', 'title': '[Specific business-driven title]', 'ac_reference': ['[AC explicitly copied from context]'], 'module': '[Name of the module]', 'workflow': '[Workflow from context]', 'preconditions': [], 'steps': [], 'expected_result': '', 'severity': 'High', 'test_type': 'Functional'}]
        }
        prompt = json.dumps(prompt_dict, ensure_ascii=False)
        
        last_exception = None
        last_raw_response = "NO_RESPONSE"
        
        for retry in range(3):
            try:
                content_result = InferenceCoordinator.execute('QA Engineer', f'Generate Tests Batch {batch_idx + 1}', 'Creator', prompt, log_step, task_id, topology_id='Creator', max_tokens=4096)
                logger.info(f'CREATOR_RAW_OUTPUT_SIZE={len(content_result)}')
                logger.warning(f'CREATOR_RAW_OUTPUT={content_result[:2000]}')

                def extract_json(text):
                    import re, json
                    try:
                        from json_repair import repair_json
                    except ImportError:
                        repair_json = lambda x: x
                    match = re.search(r'(\\{.*\\}|\\[.*\\])', text, re.S)
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
                    cases = []
                    
                # Logging raw parsed cases before schema validation
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
        return []
"""
    text = text[:start] + new_func + text[end:]
    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_indentation()
    print("Fixed indentation.")
