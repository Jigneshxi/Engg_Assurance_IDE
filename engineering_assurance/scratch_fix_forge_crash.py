import os

def fix_forge_crash():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # The string to find
    old_code = "    log_step(task_id, f'Automation Forge: Activating Automation Framework Setup Agent (#10)... Framework hint: {framework_hint}', 'Forge')\n    prompt = f\"\"\"\\n    ROLE: Automation Architect\\n    TASK: Design a context-aware automation project structure for the system described below.\\n\\n    APPLICATION CONTEXT (derive framework and folder structure from this):\\n    {ucc_summary(ucc, max_chars=1200)}\\n\\n    EXACT SYSTEM MODULES TO MAP: {json.dumps(module_names)}"
    
    new_code = """    log_step(task_id, f'Automation Forge: Activating Automation Framework Setup Agent (#10)... Framework hint: {framework_hint}', 'Forge')

    modules = state.get("combined_data", {}).get("modules", [])
    module_names = []
    for m in modules:
        if isinstance(m, dict):
            name = m.get("name")
            if name:
                module_names.append(name)
        elif isinstance(m, str):
            module_names.append(m)

    logger.info(
        f"FORGE_MODULE_AUDIT | count={len(module_names)} | sample={module_names[:5]}"
    )

    prompt = f\"\"\"\\n    ROLE: Automation Architect\\n    TASK: Design a context-aware automation project structure for the system described below.\\n\\n    APPLICATION CONTEXT (derive framework and folder structure from this):\\n    {ucc_summary(ucc, max_chars=1200)}\\n\\n    EXACT SYSTEM MODULES TO MAP: {json.dumps(module_names)}"""

    if old_code in text:
        text = text.replace(old_code, new_code)
    else:
        print("Could not find exact text in nodes.py to replace!")
        
    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_forge_crash()
    print("Crash fixed.")
