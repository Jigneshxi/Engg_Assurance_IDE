import re

def main():
    # Fix architecture.py
    path = "backend/agents/nodes/architecture.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # UX Intel Node
    ux_prompt_target = """OUTPUT JSON strictly with keys: 'core_components', 'user_flows', 'accessibility_requirements'."""
    ux_prompt_replacement = """OUTPUT JSON strictly with the key 'accessibility_audit', which must be an object containing 'target' and 'critical_fixes'."""
    content = content.replace(ux_prompt_target, ux_prompt_replacement)
    
    ux_parse_target = """return {"ux_report": {"core_components": [], "user_flows": [], "accessibility_requirements": []}}"""
    ux_parse_replacement = """return {"ux_report": {"accessibility_audit": {"target": "WCAG 2.1 Level AA", "critical_fixes": "Audit failed"}}}"""
    content = content.replace(ux_parse_target, ux_parse_replacement)
    
    # Service Mesh Node
    srv_prompt_target = """2. The value of 'service_mesh' MUST be an object with two keys: 'openapi_spec' (a valid OpenAPI 3.0 JSON object) and 'event_driven_boundaries' (list of strings)."""
    srv_prompt_replacement = """2. The value of 'service_mesh' MUST be an object with two keys: 'openapi_spec' (a valid OpenAPI 3.0 YAML string) and 'event_driven_boundaries' (list of strings)."""
    content = content.replace(srv_prompt_target, srv_prompt_replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    # Fix forges.py
    path = "backend/agents/nodes/forges.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        
    forge_prompt_target = """ROLE: Senior Backend Engineer
    TASK: Generate backend code based on this contract and DB schema:"""
    forge_prompt_replacement = """ROLE: Senior Backend Engineer
    TASK: Generate FastAPI backend boilerplate code based on this contract and DB schema:"""
    content = content.replace(forge_prompt_target, forge_prompt_replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    # Fix auditors.py
    path = "backend/agents/nodes/auditors.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        
    auditor_prompt_target = """OUTPUT: A single JSON object containing:
- 'release_status' (GO / NO-GO)
- 'risk_level' (Critical / High / Moderate / Low)
- 'executive_summary' (Markdown text explaining the decision)
- 'v_and_v_checks' (Dictionary mapping Acceptance Criteria to PASS/FAIL)
- 'destructive_mutations_detected' (integer)
- 'traceability_coverage_percent' (integer 0-100)"""
    auditor_prompt_replacement = """OUTPUT: A single JSON object containing EXACTLY:
- 'mission_hash' (string e.g. "e9f8a7b6c5d4...")
- 'prd_coverage' (string e.g. "100%")
- 'destructive_mutations_detected' (integer)
- 'v_and_v_checks' (Dictionary mapping tests to PASS/FAIL descriptions)
- 'release_status' (string e.g. "CERTIFIED_FOR_DEPLOYMENT")"""
    content = content.replace(auditor_prompt_target, auditor_prompt_replacement)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
