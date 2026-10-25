import os

def fix_forge_crash():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # The buggy string to replace
    buggy_str = "EXACT SYSTEM MODULES TO MAP: {json.dumps([m.get('name') for m in state.get('combined_data', {}).get('modules', []) if m.get('name')])}"
    
    # We will compute module_names before the prompt
    new_logic = """    modules = state.get('combined_data', {}).get('modules', [])
    module_names = []
    for m in modules:
        if isinstance(m, dict):
            if m.get("name"):
                module_names.append(m["name"])
        elif isinstance(m, str):
            module_names.append(m)

    prompt = f\"\"\"
    ROLE: Automation Architect"""

    # We need to find the prompt definition in automation_forge_node
    # Actually, let's just replace the prompt = f""" with the logic above, and then replace the buggy string inside it.
    
    # Let's search for "    prompt = f\"\"\"\n    ROLE: Automation Architect"
    prompt_start = "    prompt = f\"\"\"\n    ROLE: Automation Architect"
    if prompt_start in text:
        text = text.replace(prompt_start, new_logic)
        
    fixed_str = "EXACT SYSTEM MODULES TO MAP: {json.dumps(module_names)}"
    if buggy_str in text:
        text = text.replace(buggy_str, fixed_str)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_forge_crash()
    print("Crash fixed.")
