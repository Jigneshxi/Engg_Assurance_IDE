import os

def fix_crew_nodes():
    with open('backend/core/crew_nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # Find the MESH CONFIDENCE formatting
    old_mesh_confidence = "    prompt = f\"\"\"\n    ROLE: Principal Solutions Architect\n    TASK: Synthesize the intelligence mesh into an executive test strategy and risk report.\n    \n    PHASE 1 - CRITICAL ANALYSIS:\n    Analyze the following data payload from 59 specialist agents.\n    Identify contradictions, highlight gaps, and synthesize a unified strategy.\n    \n    PHASE 2 - QUALITY GATE: Self-validate that all required keys are present and populated.\n    If any key is missing or empty, generate appropriate content to fill it.\n    \n    ACTUAL MESH DATA (High-Fidelity Context):\n    {json.dumps(active_data, indent=2)}\n    \n    MESH CONFIDENCE: {mesh_confidence:.0%}\n    CRITIC FEEDBACK: {audit_feedback}\n    USER MISSION ROLE: {role_label}"

    # Actually, let's just do a simpler replacement if it varies.
    if 'MESH CONFIDENCE: {mesh_confidence:.0%}' in text:
        text = text.replace(
            "MESH CONFIDENCE: {mesh_confidence:.0%}",
            "MESH CONFIDENCE: {f'{mesh_confidence:.0%}' if isinstance(mesh_confidence, (int, float)) else 'N/A'}"
        )
    
    with open('backend/core/crew_nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

def fix_nodes_py():
    with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
        text = f.read()

    # Add STATE_AUDIT and MISSING_STATE_KEY
    audit_code = """
    # STATE AUDIT SCRIPT
    for key, value in state.items():
        logger.info(
            f"STATE_AUDIT | {key} | "
            f"type={type(value).__name__} | "
            f"empty={not bool(value) if value is not None else 'NONE'}"
        )
        
    required_keys = [
        "automation_bootstrap",
        "api_validation_report",
        "compliance_remediation",
        "test_cases"
    ]

    for key in required_keys:
        if key not in state:
            logger.error(f"MISSING_STATE_KEY: {key}")
"""

    # Inject audit code before payload building
    start_str = "    payload = {'strategy': state.get('analysis_payload', {}),"
    if start_str in text:
        text = text.replace(start_str, audit_code + "\n" + start_str)
        
    # Inject missing keys into payload
    old_payload = """        'strategy': state.get('analysis_payload', {}),
        'logic_audit': state.get('logic_audit_report', {}),"""
    new_payload = """        'strategy': state.get('analysis_payload', {}),
        'logic_audit': state.get('logic_audit_report', {}),
        'automation_bootstrap': state.get('automation_bootstrap', {}),
        'api_validation_report': state.get('api_validation_report', {}),
        'compliance_remediation': state.get('compliance_remediation', {}),"""
        
    if old_payload in text:
        text = text.replace(old_payload, new_payload)

    with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_crew_nodes()
    fix_nodes_py()
    print("Fixes applied successfully.")
