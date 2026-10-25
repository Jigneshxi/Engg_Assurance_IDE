import os
import logging
from backend.agents.state import AgentState, log_step

logger = logging.getLogger(__name__)

def repository_intelligence_node(state: AgentState):
    """
    AGENT: Repository Intelligence (The Standard Enforcer)
    ROLE: Context injector using LLM.
    Reads static rules and governance policies from the repo and
    injects a summarized AI-analyzed version into the state.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Repository Intelligence: Scanning workspace for governance rules...', 'RepoIntel')
    
    if not state.get('capabilities'):
        log_step(task_id, "PHASE 1 FAILED: repository_intelligence_node requires capabilities. Did ingestor_node execute?", 'RepoIntel', level='ERROR')
        raise RuntimeError("repository_intelligence_node requires capabilities. Did ingestor_node execute?")
        
    logger.info(f"[CTX] repository_intelligence_node received capabilities: {'capabilities' in state}, count: {len((state.get('capabilities') or []))}")
    logger.info(f"[CTX] repository_intelligence_node unified_context_contract present: {'unified_context_contract' in state}")
    
    # Locate docs_dir robustly across workspace roots
    candidate_dirs = [
        os.path.join("docs", "ai-default-project-structure", "ai-default-project"),
        os.path.join("..", "docs", "ai-default-project-structure", "ai-default-project"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "ai-default-project-structure", "ai-default-project"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "docs", "ai-default-project-structure", "ai-default-project"),
    ]
    docs_dir = next((d for d in candidate_dirs if os.path.exists(d)), candidate_dirs[0])
    files_to_read = ["RULES.md", "DATA-GOVERNANCE.md", "WoW_Process.md"]
    
    context_blocks = []
    
    for filename in files_to_read:
        file_path = os.path.join(docs_dir, filename)
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                context_blocks.append(f"=== {filename} ===\n{content}\n")
        else:
            log_step(task_id, f"RepoIntel Warning: {filename} not found at {file_path}", 'RepoIntel')
            
    if context_blocks:
        raw_repo_context = "\n".join(context_blocks)
        
        prompt = f"""
        ROLE: Senior Engineering Manager & Process Enforcer
        TASK: Analyze the following raw repository governance documents and summarize the core engineering standards, data governance policies, and Ways of Working (WoW) that ALL generated code must adhere to.
        
        RAW DOCUMENTS:
        {raw_repo_context[:8000]}
        
        OUTPUT: Strict JSON with the following structure:
        {{
            "core_engineering_standards": ["standard 1", "standard 2"],
            "data_governance_policies": ["policy 1"],
            "ways_of_working": ["process 1"]
        }}
        """
        try:
            content = InferenceCoordinator.execute('Process Enforcer', 'Governance Summarization', 'RepoIntel', prompt, log_step, task_id)
            result = robust_json_loads(content)
            log_step(task_id, 'Repository Intelligence: AI synthesized repository governance context.', 'RepoIntel')
            repo_context = json.dumps(result)
        except Exception as e:
            from backend.agents.state import LogLevel
            log_step(task_id, f"RepoIntel inference failed ({e}). Proceeding with raw context.", 'RepoIntel', level=LogLevel.ERROR)
            repo_context = raw_repo_context
    else:
        repo_context = "No standard repository governance documents found."
        log_step(task_id, 'Repository Intelligence: Baseline not found, proceeding with default context.', 'RepoIntel')
        
    return {"repo_intelligence_context": repo_context}

from backend.core.inference import InferenceCoordinator
import json

def robust_json_loads(text: str) -> dict:
    try:
        import re
        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return json.loads(text)
    except Exception:
        return {}

def governance_node(state: AgentState):
    """
    AGENT: Governance (Enterprise Risk Officer)
    ROLE: Reads the PRD, assigns Risk Tier and Data Classification.
    Enforces Stop-the-Line guardrails for PII.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    import time
    time.sleep(2)  # Stagger to avoid Gemini rate limits
    log_step(task_id, 'Governance: Analyzing PRD for Risk and Data Classification...', 'Governor')
    
    logger.info(f"[CTX] governance_node received capabilities: {'capabilities' in state}, count: {len((state.get('capabilities') or []))}")
    logger.info(f"[CTX] governance_node unified_context_contract present: {'unified_context_contract' in state}")
    
    combined = state.get('combined_data', {})
    if 'prd_input' in state:
        description = state.get('prd_input', 'N/A')
    else:
        description = combined.get('description', 'N/A')
    # Enrich context with compliance flags from ingestion and raw_requirements
    raw_reqs = state.get('raw_requirements', [])
    raw0 = raw_reqs[0] if raw_reqs and isinstance(raw_reqs[0], dict) else {}
    compliance_flags_from_ingestor = combined.get('compliance_flags', []) or raw0.get('compliance_flags', [])
    threat_areas = raw0.get('threat_areas', [])
    nfrs = combined.get('nfrs', []) or raw0.get('nfrs', {})
    integrations = raw0.get('integrations', [])
    
    # Build a concise context (under 2000 chars for local models)
    prd_excerpt = description[:1500] if description else 'N/A'
    flags_str = json.dumps(compliance_flags_from_ingestor[:8]) if compliance_flags_from_ingestor else '[]'
    threats_str = json.dumps(threat_areas[:5]) if threat_areas else '[]'
    
    prompt = f"""You are an Enterprise Risk Officer specializing in India regulatory compliance.

Analyze the system description and return a JSON governance report.

SYSTEM DESCRIPTION (excerpt):
{prd_excerpt}

KNOWN COMPLIANCE FLAGS: {flags_str}
KNOWN THREAT AREAS: {threats_str}

Rules:
1. data_classification: Choose "RESTRICTED / PII", "Internal", or "Public" based on whether the system handles personal data, medical records, financial data, or phone numbers.
2. risk_tier: Choose "CRITICAL", "HIGH", "MEDIUM", or "LOW". Set CRITICAL if health/medical devices, financial transactions, or PII without explicit encryption.
3. compliance_flags: List specific regulatory requirements. For India: check for DPDP Act 2023 (personal data), Medical Device Rules 2017 (medical devices), Drug & Cosmetics Act (pharmacy/chemist), IT Act 2000/CERT-In, RBI guidelines (payments).
4. advisories: A list of objects with "id" (e.g. "GOV-01"), "constraint" (detailed text, NO stubs/ellipses), and "severity" ("BLOCKING" or "WARNING"). Do not use "threat_model" as a key.
5. If PII is processed without compliance guardrails, set risk_tier to "STOP".

OUTPUT: JSON with exactly these keys: "agent" (must be "Compliance"), "data_classification", "risk_tier", "compliance_flags", "advisories" (array of objects).
"""
    try:
        content = InferenceCoordinator.execute('Enterprise Risk Officer', 'Risk Analysis', 'Governor', prompt, log_step, task_id)
        result = robust_json_loads(content)
        
        # Ensure correct schema shape
        result['agent'] = "Compliance"
        if not isinstance(result.get('advisories'), list):
            result['advisories'] = [{"id": "GOV-01", "constraint": "Implement required compliance guardrails.", "severity": "BLOCKING"}]
            
        if not isinstance(result.get('compliance_flags'), list):
            result['compliance_flags'] = compliance_flags_from_ingestor or []
        # Merge in any compliance flags from ingestor that LLM may have missed
        existing = set(result.get('compliance_flags', []))
        for flag in compliance_flags_from_ingestor:
            if str(flag) not in existing:
                result['compliance_flags'].append(flag)
        
        if result.get('risk_tier') == 'STOP':
            log_step(task_id, 'Governance [STOP-THE-LINE]: Unmitigated PII risk detected!', 'Governor', level='ERROR')
        else:
            log_step(task_id, f"Governance: Classified as {result.get('data_classification')} / Risk: {result.get('risk_tier')}", 'Governor')
        return {"compliance_report": result, "risk_advisory_report": {"risk_tier": result.get('risk_tier'), "compliance_advisories": [result]}}
    except Exception as e:
        log_step(task_id, f'Governance analysis failed ({e}). Proceeding cautiously.', 'Governor')
        # Build a deterministic fallback from compliance flags
        fallback_flags = compliance_flags_from_ingestor or ["Review compliance requirements for this domain."]
        fallback = {
            "agent": "Compliance",
            "data_classification": "RESTRICTED / PII" if any("pii" in str(f).lower() or "personal" in str(f).lower() or "dpdp" in str(f).lower() for f in fallback_flags) else "Internal",
            "risk_tier": "HIGH",
            "compliance_flags": fallback_flags,
            "advisories": [{"id": "GOV-01", "constraint": "Apply data protection safeguards.", "severity": "BLOCKING"}],
            "reasoning": "Fallback due to LLM error."
        }
        return {"compliance_report": fallback, "risk_advisory_report": {"risk_tier": fallback["risk_tier"], "compliance_advisories": [fallback]}}

def security_intel_node(state: AgentState):
    """
    AGENT: Security Intelligence (Principal AppSec Engineer)
    ROLE: Outputs a JSON Threat Model matching the AmereyConnect sample output format.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    import time
    time.sleep(0)  # Immediate start
    log_step(task_id, 'Security Intel: Generating Threat Model...', 'Security')
    
    logger.info(f"[CTX] security_intel_node received capabilities: {'capabilities' in state}, count: {len((state.get('capabilities') or []))}")
    logger.info(f"[CTX] security_intel_node unified_context_contract present: {'unified_context_contract' in state}")
    
    combined = state.get('combined_data', {})
    if 'prd_input' in state:
        description = state.get('prd_input', 'N/A')
    else:
        description = combined.get('description', 'N/A')
    raw_reqs = state.get('raw_requirements', [])
    raw0 = raw_reqs[0] if raw_reqs and isinstance(raw_reqs[0], dict) else {}
    threat_areas = raw0.get('threat_areas', [])
    integrations = raw0.get('integrations', [])
    
    prd_excerpt = description[:1200] if description else 'N/A'
    threat_hints = ', '.join(threat_areas[:5]) if threat_areas else 'unknown'
    integrations_str = ', '.join(str(i) for i in integrations[:8]) if integrations else 'none'
    
    prompt = f"""You are a Principal AppSec Engineer. Analyze the system and output a focused threat model.

SYSTEM (excerpt):
{prd_excerpt}

Known threat areas: {threat_hints}
External integrations: {integrations_str}

Identify the single most critical threat vector for this system, and provide a specific mitigation.

OUTPUT: JSON with these EXACT keys:
- "agent": "Security"
- "risk_tier": "CRITICAL", "HIGH", "MEDIUM", or "LOW"
- "advisories": array of objects, each with "id" (e.g. "SEC-01"), "constraint" (detailed actionable mitigation, no stubs), and "severity" ("BLOCKING" or "WARNING")
"""
    try:
        content = InferenceCoordinator.execute('Principal AppSec Engineer', 'Threat Modeling', 'Security', prompt, log_step, task_id)
        result = robust_json_loads(content)
        
        # Ensure proper schema
        result['agent'] = "Security"
        if 'risk_tier' not in result:
            result['risk_tier'] = "HIGH"
        if not isinstance(result.get('advisories'), list) or len(result['advisories']) == 0:
            result['advisories'] = [{
                "id": "SEC-01",
                "constraint": "Implement end-to-end encryption, input validation, and audit logging.",
                "severity": "BLOCKING"
            }]
            
        log_step(task_id, 'Security Intel: Threat Model generated successfully.', 'Security')
        return {"risk_advisory_report": {"security_advisories": [result]}}
    except Exception as e:
        log_step(task_id, f'Security Intel failed ({e}).', 'Security', level='ERROR')
        top_vector = threat_areas[0] if threat_areas else 'Data Interception'
        fallback = {
            "agent": "Security",
            "risk_tier": "HIGH",
            "advisories": [{
                "id": "SEC-01", 
                "constraint": f"Cryptographic signing and validation required against {top_vector}", 
                "severity": "BLOCKING"
            }]
        }
        return {"risk_advisory_report": {"security_advisories": [fallback]}}

def accessibility_intel_node(state: AgentState):
    """
    AGENT: Accessibility Intelligence (A11y Expert)
    ROLE: Analyzes UI/UX requirements for WCAG compliance.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    import time
    time.sleep(4)  # Stagger to avoid Gemini rate limits
    log_step(task_id, 'Accessibility Intel: Analyzing UI for WCAG requirements...', 'Accessibility')
    
    combined = state.get('combined_data', {})
    if 'prd_input' in state:
        description = state.get('prd_input', 'N/A')
    else:
        description = combined.get('description', 'N/A')
    
    prd_excerpt = description[:1000] if description else 'N/A'
    
    prompt = f"""You are a WCAG Accessibility Expert. Analyze the system for potential A11y risks.

SYSTEM (excerpt):
{prd_excerpt}

OUTPUT: JSON with EXACTLY these keys:
- "agent": "Accessibility"
- "advisories": array of objects, each with "id" (e.g. "A11Y-01"), "constraint" (detailed actionable mitigation referencing WCAG, no stubs), and "severity" ("BLOCKING" or "WARNING")
"""
    try:
        content = InferenceCoordinator.execute('Accessibility Expert', 'WCAG Analysis', 'Accessibility', prompt, log_step, task_id)
        result = robust_json_loads(content)
        result['agent'] = "Accessibility"
        if not isinstance(result.get('advisories'), list) or len(result['advisories']) == 0:
            result['advisories'] = [{
                "id": "A11Y-01", 
                "constraint": "Implement semantic HTML and full keyboard navigability across all views.", 
                "severity": "BLOCKING"
            }]
            
        log_step(task_id, 'Accessibility Intel: Analysis complete.', 'Accessibility')
        return {"risk_advisory_report": {"accessibility_advisories": [result]}}
    except Exception as e:
        log_step(task_id, f'Accessibility Intel failed ({e}).', 'Accessibility', level='WARNING')
        fallback = {
            "agent": "Accessibility",
            "advisories": [{
                "id": "A11Y-01", 
                "constraint": "Enforce WCAG 2.1 AA contrast ratios and aria-labels on all interactive elements.", 
                "severity": "BLOCKING"
            }]
        }
        return {"risk_advisory_report": {"accessibility_advisories": [fallback]}}

def risk_report_consolidator_node(state: AgentState):
    """
    AGENT: Risk Report Consolidator
    ROLE: Fan-in node to finalize the risk_advisory_report.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Consolidator: Assembling final Risk Advisory Report...', 'Consolidator')
    
    report = state.get("risk_advisory_report", {})
    
    # Extract the STOP tier if any component flagged it
    RISK_TIER_PRECEDENCE = {"STOP": 4, "CRITICAL": 3, "HIGH": 2, "MEDIUM": 1, "LOW": 0}
    
    # Gather all advisories from the merged dict
    all_advisories = []
    for key in ["security_advisories", "compliance_advisories", "accessibility_advisories"]:
        all_advisories.extend(report.get(key, []))
        
    # Also include any top-level risk_tier just in case
    tiers = [a.get("risk_tier", "LOW") for a in all_advisories if "risk_tier" in a]
    if "risk_tier" in report:
        tiers.append(report["risk_tier"])
        
    final_risk_tier = max(tiers, key=lambda t: RISK_TIER_PRECEDENCE.get(t, 0), default="LOW")

    report["risk_tier"] = final_risk_tier
    
    # Persist the merged data. We don't overwrite the whole dict, just update the tier and ensure keys exist
    return {"risk_advisory_report": report}

from backend.core.inference import InferenceCoordinator
def requirement_clarifier_node(state: AgentState):
    """
    AGENT: Clarifier (Principal Product Owner)
    ROLE: Performs gap analysis across 5 categories and extracts tech stack.
    """
    if state.get('error'):
        return state
        
    task_id = state.get('task_id')
    log_step(task_id, 'Clarifier: Analyzing PRD for gaps and extracting tech stack...', 'Clarifier')
    
    logger.info(f"[CTX] requirement_clarifier_node received capabilities: {'capabilities' in state}, count: {len((state.get('capabilities') or []))}")
    logger.info(f"[CTX] requirement_clarifier_node unified_context_contract present: {'unified_context_contract' in state}")
    
    combined = state.get('combined_data', {})
    if 'prd_input' in state:
        description = state.get('prd_input', '')
    else:
        description = combined.get('description', '')
    capabilities = combined.get('capabilities', []) or state.get('capabilities', [])
    
    prompt = f"""
    ROLE: Principal Product Owner
    TASK: Analyze the following PRD description and capabilities to identify ONLY genuine gaps that would block implementation, and extract the target tech stack.
    
    PRD Description:
    {description[:8000]}
    
    Capabilities:
    {capabilities}
    
    RULES:
    1. Output ONLY a valid JSON object.
    2. The JSON MUST contain "open_questions" (a list of objects with "id", "category", "context", and "question") and "target_tech_stack" (a dictionary).
    3. For each capability, identify ONLY genuine gaps that would block implementation:
       - Missing error states (what happens when X fails?)
       - Undefined data models (what fields does entity X have?)
       - Ambiguous NFRs (SLAs stated without numbers)
       - Conflicting requirements (requirement A contradicts requirement B)
    4. Do NOT flag a gap if the requirement is sufficiently detailed to implement. Return an empty list if no genuine gaps exist for a capability.
    5. The "id" should be format "GAP-001", "GAP-002", etc.
    6. "context" should be a short reference to the module or capability, e.g. "CAP-04 (Payment)".
    7. "question" must be fully written out. NO stubs, NO ellipses.
    8. "target_tech_stack" must be a dictionary with keys: "frontend", "backend", "test_runner_frontend", "test_runner_backend". Provide strings for each.
    """
    
    try:
        content = InferenceCoordinator.execute('Principal Product Owner', 'Gap Analysis', 'Clarifier', prompt, log_step, task_id)
        result = robust_json_loads(content)
        
        target_tech_stack = result.get('target_tech_stack', {})
        if not isinstance(target_tech_stack, dict):
            target_tech_stack = {"backend": str(target_tech_stack)}
            
        open_questions = result.get('open_questions') or []
        log_step(task_id, f'Clarifier identified {len(open_questions)} open questions and tech stack: {target_tech_stack.get("backend", "Unknown")}', 'Clarifier')
        
        return {
            "open_questions": open_questions,
            "target_tech_stack": target_tech_stack
        }
    except Exception as e:
        log_step(task_id, f'Clarifier failed ({e}).', 'Clarifier', level='ERROR')
        return {
            "open_questions": [{"category": "System", "question": "Failed to parse PRD", "impact": "High"}],
            "target_tech_stack": {}
        }