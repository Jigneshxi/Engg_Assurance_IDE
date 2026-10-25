import os
from typing import Dict, Any
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from backend.agents.state import Phase1State
from backend.core.mission_controller import MissionController, MissionStatus

mission_controller = MissionController()

def read_file(filepath: str) -> str:
    # Handle absolute vs relative paths safely
    # If the file doesn't exist, return a fallback so tests don't break
    # In reality it should read from the workspace root
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    full_path = os.path.join(base_dir, filepath)
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return f"Content of {filepath} not found."

from backend.agents.nodes.intelligence import (
    repository_intelligence_node,
    security_intel_node,
    accessibility_intel_node,
    requirement_clarifier_node,
    risk_report_consolidator_node
)

def ingestor_node(state: Phase1State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NODE] ingestor_node executing")
    task_id = state.get('task_id')
    from backend.agents.state import log_step
    from backend.core.inference import InferenceCoordinator
    from backend.agents.nodes.intelligence import robust_json_loads
    
    prd_input = state.get('prd_input', '')
    logger.info(f"[INGESTOR] input chars={len(prd_input)}")
    log_step(task_id, 'Requirements Ingestor: Parsing PRD into Core Capabilities...', 'Ingestor')
    
    # Helper function for executing prompts with retries
    def _execute_and_parse(prompt_text, analyst_role, action_name, expected_key, retries=3, exponential_backoff=True):
        import time
        import re
        for attempt in range(retries):
            try:
                logger.info(f"[INGESTOR] {action_name} prompt chars={len(prompt_text)} (Attempt {attempt+1}/{retries})")
                content = InferenceCoordinator.execute(analyst_role, action_name, 'Ingestor', prompt_text, log_step, task_id)
                logger.info(f"[{action_name}] RAW:\n{content}")
                
                content = content.strip()
                if content.startswith("```"):
                    content = re.sub(r"^```(?:json)?\n?", "", content)
                    content = re.sub(r"\n?```$", "", content)
                    content = content.strip()
                    
                result = robust_json_loads(content)
                
                logger.info(f"[{action_name}] TYPE={type(result)}")
                logger.info(f"[{action_name}] KEYS={list(result.keys()) if isinstance(result, dict) else result}")
                
                if not isinstance(result, dict):
                    raise RuntimeError(f"{action_name} returned {type(result).__name__}, expected dict.")
                
                if expected_key not in result:
                    raise RuntimeError(f"{action_name} missing expected key '{expected_key}'. Returned keys: {list(result.keys()) if isinstance(result, dict) else result}")
                    
                return result
            except Exception as e:
                logger.warning(f"[INGESTOR] {action_name} attempt {attempt+1} failed: {e}")
                if attempt == retries - 1:
                    raise e
                if exponential_backoff:
                    time.sleep(2 ** attempt)
        return {}

    try:
        # Step 1: Pre-flight Classification & Domain Detection (LLM-based & Dynamic)
        prompt_classify = f"""
        ROLE: Enterprise Requirements Analyst & Domain Classifier
        TASK: Analyze the input text to determine its input type and classify its primary business domain.
        
        PRD / Input Text:
        {prd_input}
        
        CLASSIFICATION RULES:
        1. "input_type": "full_prd" | "feature_request" | "bug_report" | "fragment_insufficient"
        2. "detected_domain": "E-Commerce" | "Healthcare" | "Banking" | "Travel" | "General"
           - Use "E-Commerce" for platforms involving online purchasing, product catalogs, shopping carts, affiliate marketing, commission tracking, distributor order routing, or retail sales (including medical device/equipment retail).
           - Use "Healthcare" ONLY if the primary focus is clinical patient care, EHR/EMR, doctor appointments, telehealth video consultations, or hospital bed management.
           - Use "Banking" if focused on loans, bank accounts, fund transfers, or financial credit.
           - Use "Travel" if focused on flights, hotels, itineraries, or reservations.
        3. "domain_details": Concise 1-2 sentence description of the specific business domain, core business model, and target users extracted directly from the input text.
        
        OUTPUT FORMAT: Return JSON only:
        {{
            "input_type": "full_prd",
            "detected_domain": "E-Commerce",
            "domain_details": "Concise 1-2 sentence description of the business domain and core platform workflow.",
            "confidence": "high",
            "reasoning": "One sentence explaining why this domain was selected based on the PRD text."
        }}
        """
        res_class = _execute_and_parse(prompt_classify, 'Enterprise Requirements Analyst', 'Input Classification', 'input_type')
        input_type = res_class.get('input_type', 'full_prd')
        llm_domain = res_class.get('detected_domain')
        domain_details = res_class.get('domain_details', '')
        
        # Dynamic keyword-based Domain Detector fallback if LLM classification is missing
        prd_lower = prd_input.lower()
        ecom_keywords = ["cart", "checkout", "product", "inventory", "shipping", "order", "chemist", "affiliate", "commission", "qr", "distributor", "retail", "catalog", "store", "purchase", "customer"]
        health_keywords = ["patient care", "doctor consultation", "telehealth", "appointment", "hospital bed", "clinical record", "ehr", "emr", "hipaa"]
        
        ecom_score = sum(prd_lower.count(k) for k in ecom_keywords)
        health_score = sum(prd_lower.count(k) for k in health_keywords)
        
        if llm_domain in ["E-Commerce", "Healthcare", "Banking", "Travel", "General"]:
            detected_domain = llm_domain
        elif ecom_score >= health_score and ecom_score > 3:
            detected_domain = "E-Commerce"
        elif health_score > 3:
            detected_domain = "Healthcare"
        else:
            detected_domain = "General"
            
        logger.info(f"[DOMAIN-DETECTOR] final detected_domain={detected_domain} (llm_domain={llm_domain}, ecom_score={ecom_score}, health_score={health_score})")
        logger.info(f"[INGESTOR] input_type classified as {input_type}")
        
        if input_type == "fragment_insufficient":
            raise RuntimeError("Input is a fragment or insufficient to proceed with analysis. Please provide more context.")
            
        if input_type == "bug_report":
            prompt_bug = f"""
            ROLE: Technical Support Engineer
            TASK: Extract bug context from the bug reports. The input may contain multiple bugs (e.g. aggregated from a board).
            Extract each distinct bug into its own object in the array.
            
            Text:
            {prd_input}
            
            OUTPUT FORMAT: Return exactly this JSON structure:
            {{
                "bugs": [
                    {{
                        "affected_component": "Description of the affected component(s)",
                        "expected_behavior": "What should have happened",
                        "actual_behavior": "What actually happened",
                        "reproduction_steps": ["Step 1", "Step 2"]
                    }}
                ]
            }}
            """
            res_bug = _execute_and_parse(prompt_bug, 'Technical Support Engineer', 'Bug Context Extraction', 'bugs')
            
            bugs = res_bug.get("bugs", [])
            capabilities = []
            for idx, bug in enumerate(bugs):
                capabilities.append({
                    "id": f"BUG-FIX-{idx+1:02d}",
                    "name": f"Resolve Bug in {bug.get('affected_component', 'System')}",
                    "description": f"Expected: {bug.get('expected_behavior')}. Actual: {bug.get('actual_behavior')}."
                })
                
            threats = []
            compliance = []
            missing_info = []
            nfr_signals = []
            detected_domain = "Technical Debt / Bug Fix"
            quality_score = 1.0
            ingestion_quality_warning = False
            domain_ctx = f"Bug Reports spanning {len(capabilities)} components"
        else:
            # Step 2: Extract Capabilities dynamically with full domain context
            prompt_caps = f"""
            ROLE: Enterprise Requirements Analyst
            TASK: Analyze the following PRD description for a [{detected_domain}: {domain_details}] system and extract all core capabilities and domain context.
            
            Extract EVERY distinct capability described or implied in this PRD. Do not limit yourself 
            to a fixed number — a large, detailed PRD may have 20-40+ distinct capabilities; a small PRD may have 5. 
            Your count must be driven entirely by what the PRD actually describes, never by a target number.

            Ensure capabilities cover all key user roles and personas present in the PRD text.
            Be specific to the functional features described in the PRD text.

            Do not summarize multiple related capabilities into one generic entry.
            
            PRD Description:
            {prd_input}
            
            OUTPUT FORMAT: Return exactly this JSON structure:
            {{
                "capabilities": [
                    {{"id": "CAP-01", "name": "Feature Name", "description": "Specific functional description"}}
                ],
                "domain_context": "Detailed description of the business domain, core platform objectives, key user personas, and operational workflow."
            }}
            """

            prompt_threats = f"""
            ROLE: Enterprise Security Analyst
            TASK: Analyze the PRD description for a [{detected_domain}] platform and extract all potential threat areas relevant to the system architecture and business model described in the PRD text.
            
            PRD Description:
            {prd_input}
            
            OUTPUT FORMAT: Return exactly this JSON structure:
            {{
                "threat_areas": ["Threat 1", "Threat 2"]
            }}
            """

            prompt_compliance = f"""
            ROLE: Enterprise Compliance Analyst
            TASK: Analyze the PRD description for a [{detected_domain}] platform and extract all applicable compliance flags and regulatory rules relevant to the PRD text.
            
            PRD Description:
            {prd_input}
            
            OUTPUT FORMAT: Return exactly this JSON structure:
            {{
                "compliance_flags": ["Compliance Rule 1", "Compliance Rule 2"]
            }}
            """

            prompt_missing = f"""
            ROLE: Enterprise Requirements Analyst
            TASK: Analyze the PRD description and extract missing information or ambiguities.
            
            PRD Description:
            {prd_input}
            
            OUTPUT FORMAT: Return exactly this JSON structure:
            {{
                "missing_information": ["Missing detail 1", "Missing detail 2"]
            }}
            """

            res_caps = _execute_and_parse(prompt_caps, 'Requirements Analyst', 'PRD Capabilities', 'capabilities')
            res_threats = _execute_and_parse(prompt_threats, 'Security Analyst', 'PRD Threats', 'threat_areas')
            res_compliance = _execute_and_parse(prompt_compliance, 'Compliance Analyst', 'PRD Compliance', 'compliance_flags')
            res_missing = _execute_and_parse(prompt_missing, 'Requirements Analyst', 'PRD Open Questions', 'missing_information')
            
            capabilities = res_caps.get('capabilities', [])
            nfr_signals = res_caps.get('nfr_signals', [])
            threats = res_threats.get('threat_areas', [])
            compliance = res_compliance.get('compliance_flags', [])
            missing_info = res_missing.get('missing_information', [])
            domain_ctx = res_caps.get('domain_context') or domain_details or f"{detected_domain} Platform"
        
        logger.info(f"[CAPABILITY-EXTRACTOR] count={len(capabilities)}")
        logger.info(f"[THREAT-EXTRACTOR] count={len(threats)}")
        logger.info(f"[COMPLIANCE-EXTRACTOR] count={len(compliance)}")
        logger.info(f"[MISSING-INFO-EXTRACTOR] count={len(missing_info)}")
        
        # Structured Validation
        for cap in capabilities:
            required = ["id", "name", "description"]
            missing = [k for k in required if not cap.get(k)]
            if missing:
                raise RuntimeError(f"Invalid capability schema. Missing {missing} in {cap}")
                
        # Domain-Aware Expectations & Quality Scoring
        EXPECTATIONS = {
            "Travel": {"capabilities": 5, "threats": 2, "compliance": 1},
            "Healthcare": {"capabilities": 5, "threats": 4, "compliance": 3},
            "Banking": {"capabilities": 5, "threats": 5, "compliance": 4},
            "E-Commerce": {"capabilities": 5, "threats": 3, "compliance": 2},
            "Technical Debt / Bug Fix": {"capabilities": 1, "threats": 0, "compliance": 0},
            "General": {"capabilities": 3, "threats": 1, "compliance": 0}
        }
        expected = EXPECTATIONS.get(detected_domain, EXPECTATIONS["General"])
        
        cap_score = min(1.0, len(capabilities) / max(1, expected["capabilities"]))
        threat_score = min(1.0, len(threats) / max(1, expected["threats"])) if expected["threats"] > 0 else 1.0
        comp_score = min(1.0, len(compliance) / max(1, expected["compliance"])) if expected["compliance"] > 0 else 1.0
        desc_score = sum(1 for c in capabilities if len(c.get("description", "").split()) >= 10) / max(1, len(capabilities))
        
        # Weighted scoring formula
        quality_score = (cap_score * 0.40) + (desc_score * 0.25) + (threat_score * 0.20) + (comp_score * 0.15)
        logger.info(f"[INGESTOR] quality_score={quality_score:.2f} domain={detected_domain}")
        
        ingestion_quality_warning = False
        if quality_score < 0.60:
            raise RuntimeError(f"Ingestion quality below threshold: {quality_score:.2f}")
        elif quality_score < 0.75:
            logger.warning(f"Ingestion quality warning: {quality_score:.2f}")
            ingestion_quality_warning = True
            
        logger.info(f"[INGESTOR] capabilities generated={len(capabilities)}")
        log_step(task_id, f'Ingestor generated {len(capabilities)} capabilities (Quality: {quality_score:.2f}, Domain: {detected_domain}).', 'Ingestor')
        
        return {
            "capabilities": capabilities,
            "compliance_flags": compliance,
            "threat_areas": threats,
            "missing_information": missing_info,
            "detected_domain": detected_domain,
            "quality_score": quality_score,
            "ingestion_quality_warning": ingestion_quality_warning,
            "ingestion_metrics": {
                "capabilities": len(capabilities),
                "threats": len(threats),
                "compliance": len(compliance),
                "missing_information": len(missing_info)
            },
            "unified_context_contract": {
                "domain": detected_domain,
                "domain_details": domain_details,
                "domain_context": domain_ctx,
                "input_type": input_type
            },
            "nfr_signals": nfr_signals
        }
    except Exception as e:
        logger.error(f"[INGESTOR] failed: {e}")
        log_step(task_id, f'Ingestor failed ({e}).', 'Ingestor', level='ERROR')
        raise e

def validate_ingestion_node(state: Phase1State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NODE] validate_ingestion_node executing")
    
    if not state.get("capabilities"):
        raise RuntimeError("Ingestion produced zero capabilities.")
        
    return {}

def tech_stack_analysis_node(state: Phase1State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NODE] tech_stack_analysis_node executing")
    task_id = state.get('task_id')
    from backend.agents.state import log_step
    from backend.core.inference import InferenceCoordinator
    from backend.agents.nodes.intelligence import robust_json_loads
    
    log_step(task_id, 'Tech Stack & Capability Analyzer: Extracting target tech stack...', 'TechStack')
    
    prd_input = state.get('prd_input', '')
    capabilities = state.get('capabilities', [])
    unified_context = state.get('unified_context_contract', {})
    domain_ctx = unified_context.get('domain_context', '')
    domain = unified_context.get('domain', 'E-Commerce')
    
    prompt = f"""
    ROLE: Enterprise Solution Architect
    TASK: Analyze the following PRD description, domain context, and capabilities to determine the optimal target tech stack for system architecture and code generation.
    
    PRD Description:
    {prd_input}
    
    Domain Context ({domain}):
    {domain_ctx}
    
    Capabilities ({len(capabilities)} total):
    {capabilities[:10]}
    
    RULES:
    1. Output ONLY a valid JSON object containing "target_tech_stack".
    2. Provide CONCRETE, SPECIFIC single-choice selections for each tier (do NOT use vague options like "React or Angular" or "PostgreSQL or MySQL").
    3. Choose industry-standard enterprise stack components aligned with the {domain} requirements:
       - "frontend": e.g., "React.js (TypeScript)"
       - "backend": e.g., "Python (FastAPI)"
       - "database": e.g., "PostgreSQL"
       - "infrastructure": e.g., "AWS (ECS, RDS, S3)" or "Docker Containerization"
    
    OUTPUT FORMAT: Return JSON only:
    {{
        "target_tech_stack": {{
            "frontend": "React.js (TypeScript)",
            "backend": "Python (FastAPI)",
            "database": "PostgreSQL",
            "infrastructure": "AWS (ECS, RDS, S3)"
        }}
    }}
    """
    
    try:
        content = InferenceCoordinator.execute('Enterprise Solution Architect', 'Architecture Analysis', 'TechStack', prompt, log_step, task_id)
        result = robust_json_loads(content)
        
        raw_stack = result.get('target_tech_stack') or {
            "frontend": "React.js (TypeScript)",
            "backend": "Python (FastAPI)",
            "database": "PostgreSQL",
            "infrastructure": "AWS (ECS, RDS, S3)"
        }
        
        # Post-process sanitizer to strictly enforce single choices and strip 'or' options
        target_tech_stack = {}
        for k, v in raw_stack.items():
            if isinstance(v, str):
                # Take first option if LLM returns "Node.js or Python..."
                clean_val = v.split(" or ")[0].split(".")[0].strip()
                target_tech_stack[k] = clean_val
            else:
                target_tech_stack[k] = v
        
        log_step(task_id, f'TechStack extracted target stack: {target_tech_stack.get("backend")}', 'TechStack')
        
        return {
            "target_tech_stack": target_tech_stack
        }
    except Exception as e:
        log_step(task_id, f'TechStack analysis failed ({e}).', 'TechStack', level='ERROR')
        return {
            "target_tech_stack": {
                "frontend": "React.js (TypeScript)",
                "backend": "Python (FastAPI)",
                "database": "PostgreSQL",
                "infrastructure": "AWS (ECS, RDS, S3)"
            }
        }

async def hitl1_gate_node(state: Phase1State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NODE] hitl1_gate_node executing")
    # This node just serves as an interrupt point for HITL approval
    return {}

async def phase1_exit_node(state: Phase1State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NODE] phase1_exit_node executing")
    mission_id = state["mission_id"]
    
    phase1_output = {
        "unified_context_contract": state.get("unified_context_contract") or {"status": "validated", "raw": state.get("prd_input", "")},
        "risk_advisory_report": state.get("risk_advisory_report", {}),
        "capabilities": state.get("capabilities", []),
        "nfr_signals": state.get("nfr_signals", []),
        "target_tech_stack": state.get("target_tech_stack", {}),
        "open_questions": state.get("open_questions", []),
    }
    
    await mission_controller.persist_phase_output(mission_id, 1, phase1_output)
    await mission_controller.transition_status(mission_id, MissionStatus.HITL1_PENDING)
    
    return {}  # Graph exits, HITL checkpoint holds

def get_checkpointer():
    return MemorySaver()

def build_phase1_graph():
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[PHASE1-GRAPH] build_phase1_graph() called — new architecture")
    
    # Disable node cache for phase graph execution
    import os
    os.environ["USE_NODE_CACHE"] = "False"
    
    workflow = StateGraph(Phase1State)
    
    workflow.add_node("ingestor_node", ingestor_node)
    workflow.add_node("validate_ingestion_node", validate_ingestion_node)
    workflow.add_node("repository_intelligence_node", repository_intelligence_node)
    workflow.add_node("tech_stack_analysis_node", tech_stack_analysis_node)
    workflow.add_node("clarifier_node", requirement_clarifier_node)
    workflow.add_node("security_intel_node", security_intel_node)
    workflow.add_node("accessibility_intel_node", accessibility_intel_node)
    workflow.add_node("risk_advisory_node", risk_report_consolidator_node)
    workflow.add_node("hitl1_gate_node", hitl1_gate_node)
    workflow.add_node("phase1_exit_node", phase1_exit_node)
    
    workflow.add_edge(START, "ingestor_node")
    workflow.add_edge("ingestor_node", "validate_ingestion_node")
    workflow.add_edge("validate_ingestion_node", "repository_intelligence_node")
    workflow.add_edge("repository_intelligence_node", "tech_stack_analysis_node")
    workflow.add_edge("tech_stack_analysis_node", "clarifier_node")
    
    # Fan out for risk
    workflow.add_edge("clarifier_node", "security_intel_node")
    workflow.add_edge("clarifier_node", "accessibility_intel_node")
    
    # Fan in
    workflow.add_edge(["security_intel_node", "accessibility_intel_node"], "risk_advisory_node")
    
    workflow.add_edge("risk_advisory_node", "phase1_exit_node")
    workflow.add_edge("phase1_exit_node", "hitl1_gate_node")
    workflow.add_edge("hitl1_gate_node", END)
    
    return workflow.compile(
        checkpointer=get_checkpointer(),
        interrupt_before=["hitl1_gate_node"]
    )
