import os

def fix_rules():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # Part 1: Auto-expand compound ACs during ingestion
    old_valid_modules_start = """    valid_modules = [m for m in modules if m.get('name')]"""
    
    new_valid_modules_start = """    valid_modules = []
    for m in modules:
        if m.get('name'):
            # Decompose compound ACs
            new_acs = []
            for ac in m.get('acceptance_criteria', []):
                if isinstance(ac, str) and ',' in ac and len(ac.split(',')) > 1 and len(ac) < 150:
                    for part in ac.split(','):
                        if part.strip():
                            new_acs.append(part.strip())
                else:
                    new_acs.append(ac)
            m['acceptance_criteria'] = new_acs
            valid_modules.append(m)"""

    if old_valid_modules_start in text:
        text = text.replace(old_valid_modules_start, new_valid_modules_start)

    # Part 2: Replace minimum validation with AC traceability validation
    old_min_check = """                if len(valid_cases) < minimum:
                    raise RuntimeError(f"Insufficient test cases. Expected >= {minimum}, generated {len(valid_cases)}")"""

    new_ac_check = """                if len(valid_cases) == 0:
                    raise RuntimeError("Zero test cases generated.")
                    
                module_acs = set(batch_modules[0].get('acceptance_criteria', []))
                covered_acs = {ac for tc in valid_cases for ac in tc.get("ac_reference", [])}
                
                # Check for strictly missing ACs. We use a relaxed substring check in case LLM alters it slightly.
                missing_acs = []
                for mac in module_acs:
                    # Check if mac is substring of any covered_ac, or vice versa
                    if not any(mac.lower() in cac.lower() or cac.lower() in mac.lower() for cac in covered_acs):
                        missing_acs.append(mac)
                        
                if missing_acs:
                    raise RuntimeError(f"Missing AC coverage. Uncovered ACs: {missing_acs}")"""

    if old_min_check in text:
        text = text.replace(old_min_check, new_ac_check)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_rules()
    print("Fixed rules applied.")
