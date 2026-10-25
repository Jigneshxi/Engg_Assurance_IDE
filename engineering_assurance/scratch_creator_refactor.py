import re
import os

def refactor_nodes():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Creator Node Refactor
    # Find batching logic
    old_batching = """    def estimate_size(module):
        return len(str(module.get('description', ''))) + len(str(module.get('workflows', []))) + len(str(module.get('acceptance_criteria', [])))
    batches = []
    current_batch = []
    current_chars = 0
    target_batch_size = 3000
    for module in sorted_modules:
        size = estimate_size(module)
        if current_chars + size > target_batch_size and current_batch:
            batches.append((current_batch, current_chars))
            current_batch = []
            current_chars = 0
        current_batch.append(module)
        current_chars += size
    if current_batch:
        batches.append((current_batch, current_chars))"""
    
    new_batching = """    def estimate_size(module):
        return len(str(module.get('description', ''))) + len(str(module.get('workflows', []))) + len(str(module.get('acceptance_criteria', [])))
    batches = [([m], estimate_size(m)) for m in sorted_modules]"""
    
    text = text.replace(old_batching, new_batching)

    # Find parsing and validation logic inside process_batch
    old_parsing = """            if isinstance(data, list):
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
            logger.info(f'CREATOR_PARSED_TESTS={len(cases)}')
            logger.info(f"CREATOR_BATCH_MODULES={[m.get('name') for m in batch_modules]}")
            log_step(task_id, f'Batch {batch_idx + 1} generated {len(cases)} test cases.', 'Creator')
            return cases"""

    new_parsing = """            if isinstance(data, list):
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
                
            # Schema Validation
            valid_cases = []
            for tc in cases:
                if isinstance(tc, dict) and tc.get('case_id') and tc.get('module') and tc.get('title') and tc.get('steps'):
                    valid_cases.append(tc)
            
            # Dynamic Minimum Validation
            module_ac_count = len(batch_modules[0].get('acceptance_criteria', [])) if batch_modules else 0
            minimum = max(3, module_ac_count)
            if len(valid_cases) < minimum:
                raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")
                
            logger.info(f'CREATOR_PARSED_TESTS={len(valid_cases)}')
            logger.info(f"CREATOR_BATCH_MODULES={[m.get('name') for m in batch_modules]}")
            log_step(task_id, f'Batch {batch_idx + 1} generated {len(valid_cases)} test cases.', 'Creator')
            return valid_cases"""
            
    text = text.replace(old_parsing, new_parsing)
    
    # Coverage Gate at end of ThreadPoolExecutor
    old_pool_end = """        for future in as_completed(futures):
            res = future.result()
            if res:
                all_test_cases.extend(res)
    log_step(task_id, f'Creator suite produced {len(all_test_cases)} total cases across {len(modules)} modules.', 'Creator')
    try:"""
    
    new_pool_end = """        for future in as_completed(futures):
            res = future.result()
            if res:
                all_test_cases.extend(res)
                
    # Coverage metrics logging
    import collections
    generated_per_module = collections.Counter(tc.get("module") for tc in all_test_cases)
    coverage_log = ["CREATOR_COVERAGE:"]
    for mod_name, count in generated_per_module.items():
        coverage_log.append(f"{mod_name} = {count}")
    coverage_log.append(f"TOTAL = {len(all_test_cases)}")
    log_step(task_id, "\\n".join(coverage_log), "Creator")

    # Strict Module Coverage Gate
    import os
    expected_modules = {m.get("name") for m in valid_modules if m.get("name")}
    generated_modules = {tc.get("module") for tc in all_test_cases if tc.get("module")}
    missing = expected_modules - generated_modules
    
    # STRICT_CREATOR_MODE defaults to True as per requirements
    STRICT_CREATOR_MODE = os.environ.get("STRICT_CREATOR_MODE", "true").lower() == "true"
    if missing:
        error_msg = f"Creator coverage failure\\nExpected: {len(expected_modules)}\\nGenerated: {len(generated_modules)}\\nMissing:\\n" + "\\n".join(sorted(list(missing)))
        if STRICT_CREATOR_MODE:
            raise RuntimeError(error_msg)
        else:
            log_step(task_id, f"[WARNING] {error_msg}", "Creator")
            
    log_step(task_id, f'Creator suite produced {len(all_test_cases)} total cases across {len(modules)} modules.', 'Creator')
    try:"""

    text = text.replace(old_pool_end, new_pool_end)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    refactor_nodes()
    print("Creator node refactored successfully.")
