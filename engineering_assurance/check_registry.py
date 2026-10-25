from backend.core.agent_registry import AGENT_REGISTRY
phase2_keys = ['architect', 'logician', 'governor', 'planning_agent', 'api_design', 
               'db_schema', 'engineering_contract', 'tdd_contract', 'service_mesh']
for k in phase2_keys:
    entry = AGENT_REGISTRY.get(k)
    status = "FOUND" if entry else "MISSING"
    label = entry.get('label', '-') if entry else '-'
    print(f"{k}: {status} | label={label}")
