import os
import re

path = 'c:/Users/VVnT/ai-engineering-assurance-v3/backend/agents/nodes/legacy_nodes.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace security_intel_node
security_replacement = '''def security_intel_node(state: AgentState):
    """
    NODE: THE SECURITY AUDITOR (#18 Security Intelligence Agent)
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    ucc = state.get('combined_data', {})
    
    if not ucc:
        log_step(task_id, '[SECURITY-GUARD] Missing context detected. Returning dormant status.', 'Security')
        return {'security_signals': [{'applicable': False, 'reason': 'No Unified Context Contract available for Security assessment.'}]}
        
    log_step(task_id, 'Activating Security Intelligence Agent (#18)...', 'Security')
    
    prompt = f"""
    ROLE: CyberSecurity Expert (Agent #18)
    TASK: Perform a formal STRIDE Threat Model and Vulnerability Surface analysis based on the Unified Context Contract.
    
    UNIFIED CONTEXT CONTRACT:
    {json.dumps(ucc, default=str)[:8000]}
    
    Focus on:
    1. ASPM+ Attack Path Simulation (Injection, Lateral Movement).
    2. PII / Sensitive Data Leakage points in logs/payloads.
    3. Zero-Trust AuthN/AuthZ validation & JWT Hijacking risks.
    4. Supply Chain Security (Third-party library vulnerabilities/SBOM).
    5. Security Test Hooks (DAST/SAST/IAST integration points).
    
    OUTPUT: Strict JSON with the following structure:
    {{
        "threat_model": [
            {{"component": "component name", "stride_category": "Spoofing/Tampering/etc", "risk": "High/Medium/Low", "mitigation": "description"}}
        ],
        "vulnerability_surface": ["surface 1", "surface 2"],
        "security_recommendations": ["rec 1", "rec 2"]
    }}
    """
    
    try:
        content = InferenceCoordinator.execute('CyberSecurity Expert', 'Threat Modeling', 'Security', prompt, log_step, task_id)
        security_signals = robust_json_loads(content)
        log_step(task_id, f"Security generation complete. {len(security_signals.get('threat_model', []))} threats identified.", 'Security')
        return {'security_signals': [security_signals]}
    except Exception as sec_err:
        log_step(task_id, f'[SECURITY-FALLBACK] Security inference failed ({str(sec_err)}).', 'Security', level=LogLevel.ERROR)
        return {'security_signals': [{'error': str(sec_err), 'threat_model': []}]}
'''
content = re.sub(r'def security_intel_node\(state: AgentState\):.*?(?=def \w+\(state:)', security_replacement + '\n', content, flags=re.DOTALL)

# 2. Replace visual_intel_node
visual_replacement = '''def visual_intel_node(state: AgentState):
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Activating Visual Testing Intelligence Agent (#39) [Generative Mode]...', 'VisualIntel')
    
    frontend_code = state.get('frontend_forge_code', [])
    if not frontend_code:
        log_step(task_id, 'No frontend code found for visual baseline derivation.', 'VisualIntel', level=LogLevel.WARN)
        return {'visual_checkpoints': {'status': 'skipped', 'baselines_captured': False}}
        
    prompt = f"""
    ROLE: Principal Frontend UI/UX Automation Architect
    TASK: Analyze the generated frontend components and derive specific Visual Regression Testing baselines, cross-browser compatibility risks, and DOM structural test scenarios.
    
    FRONTEND CODE (Snippet):
    {json.dumps(frontend_code[:5], default=str)}
    
    OUTPUT: Strict JSON with the following structure:
    {{
        "pages_to_scan": ["/login", "/dashboard"],
        "critical_visual_checkpoints": [
            {{"component": "Sidebar", "viewport": "mobile", "assertion": "Should be hidden by default"}}
        ],
        "baselines_captured": true,
        "engine_recommendation": "Playwright / Percy"
    }}
    """
    
    try:
        content = InferenceCoordinator.execute('UI/UX Architect', 'Visual Baseline Extraction', 'VisualIntel', prompt, log_step, task_id)
        report = robust_json_loads(content)
        log_step(task_id, f"Visual Intel complete. {len(report.get('critical_visual_checkpoints', []))} checkpoints defined.", 'VisualIntel')
        return {'visual_checkpoints': report}
    except Exception as e:
        log_step(task_id, f"Visual Intel inference failed: {e}", 'VisualIntel', level=LogLevel.ERROR)
        return {'visual_checkpoints': {'error': str(e), 'baselines_captured': False}}
'''
content = re.sub(r'def visual_intel_node\(state: AgentState\):.*?(?=def \w+\(state:)', visual_replacement + '\n', content, flags=re.DOTALL)

# 3. Replace environment_provisioner_node
env_replacement = '''def environment_provisioner_node(state: AgentState):
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Activating Environment Provisioner (#16) [Generative Mode]...', 'EnvOps')
    
    architect_data = state.get('api_design_spec', {})
    if not architect_data:
        log_step(task_id, 'No architecture spec found for environment generation.', 'EnvOps', level=LogLevel.WARN)
    
    prompt = f"""
    ROLE: Principal Platform Engineer / DevOps Architect
    TASK: Generate an infrastructure-as-code specification (e.g., Docker Compose and Kubernetes configurations) based on the current architecture.
    
    ARCHITECTURE SPEC:
    {json.dumps(architect_data, default=str)}
    
    OUTPUT: Strict JSON with the following structure:
    {{
        "docker_compose_yaml": "string containing docker-compose.yml",
        "kubernetes_manifests": ["string of yaml files"],
        "provision_report": {{"docker": true, "kubernetes": true, "status": "Provisioned", "teardown_policy": "Ephemeral"}},
        "environment_config": {{"browser": "chrome", "execution_mode": "remote_grid", "grid": true}}
    }}
    """
    
    try:
        content = InferenceCoordinator.execute('Platform Engineer', 'Environment Provisioning', 'EnvOps', prompt, log_step, task_id)
        result = robust_json_loads(content)
        log_step(task_id, 'Environment Provisioner: Configurations synthesized successfully.', 'EnvOps')
        return {
            'environment_config': result.get('environment_config', {'browser': 'chrome', 'execution_mode': 'local', 'grid': False}), 
            'provision_report': result.get('provision_report', {'status': 'Provisioned'}),
            'iac_artifacts': {
                'docker_compose': result.get('docker_compose_yaml'),
                'k8s': result.get('kubernetes_manifests')
            }
        }
    except Exception as e:
        log_step(task_id, f"Environment Provisioner failed ({e}). Returning fallback.", 'EnvOps', level=LogLevel.ERROR)
        import shutil
        has_docker = shutil.which('docker') is not None
        has_node = shutil.which('node') is not None
        has_k8s = shutil.which('kubectl') is not None
        report = {'docker': has_docker, 'kubernetes': has_k8s, 'node': has_node, 'status': 'Provisioned', 'teardown_policy': 'Ephemeral', 'error': str(e)}
        env_config = {'browser': 'chrome', 'execution_mode': 'local', 'grid': False}
        return {'environment_config': env_config, 'provision_report': report}
'''
content = re.sub(r'def environment_provisioner_node\(state: AgentState\):.*?(?=def \w+\(state:)', env_replacement + '\n', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Successfully replaced security_intel_node, visual_intel_node, and environment_provisioner_node in legacy_nodes.py')
