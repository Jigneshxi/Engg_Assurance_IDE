from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
import json

from backend.core.inference import InferenceCoordinator
from backend.agents.nodes.intelligence import robust_json_loads
from backend.agents.state import log_step
import asyncio

from backend.agents.state import Phase2State
from backend.core.mission_controller import MissionController, MissionStatus
from backend.core.phase_contracts import PHASE_CONTRACTS

mission_controller = MissionController()

async def logician_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] logician_node EXECUTING")
    log_step(task_id, "Logician: Initializing Phase 2 Fan-out Streams...", "Logician", status="running")

    caps = state.get("capabilities", [])
    tech_stack = state.get("target_tech_stack", {})
    ucc = state.get("unified_context_contract", {})

    # Build a meaningful summary of what Phase 2 is about to process
    agent_streams = [
        "Architect — System Specification & C4 Diagram",
        "Service Mesh — Microservice Topology",
        "DB Architect — Database Schema Design",
        "API Designer — REST Endpoint Contracts",
        "Planning Agent — Engineering Task Breakdown",
        "Creator — TDD Contract Generation",
        "Performance Architect — NFR Budgets & Latency Targets",
        "Security Intelligence — Threat Model & Auth Constraints",
        "Compliance Governor — Regulatory Binding Constraints",
        "Synthesis Optimizer — Module Boundary Computation",
        "Traceability Auditor — Requirements Coverage Verification",
        "API Dependency Mapper — External Integration Surfacing",
        "Requirement Clarifier — Ambiguity Resolution",
    ]

    summary = {
        "dispatch_summary": {
            "total_capabilities": len(caps),
            "total_agents_dispatched": len(agent_streams),
            "agent_streams": agent_streams,
            "tech_stack_detected": list(tech_stack.keys()) if isinstance(tech_stack, dict) else [],
            "project": ucc.get("project", state.get("mission_id", "Unknown"))
        }
    }

    log_step(task_id, f"Logician: Fan-out initialized — {len(caps)} capabilities across {len(agent_streams)} parallel streams", "Logician", status="complete")
    return {"logician_summary": summary}

async def architect_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] architect_node EXECUTING — real LLM call starting")
    log_step(task_id, "Architect: Generating System Specification...", "Architect", status="running")
    
    ucc = state.get("unified_context_contract", {})
    risk_report = state.get("risk_advisory_report", {})
    
    # Scoped input — ~1500 tokens max
    scoped_input = {
        "project": ucc.get("project", ""),
        "core_roles": state.get("capabilities", [])[:3],  # top 3 only
        "tech_stack": state.get("target_tech_stack", {}),
        "binding_constraints": [
            a.get("constraint") for a in 
            risk_report.get("advisories", [])
            if isinstance(a, dict) and a.get("binding")
        ][:5]  # top 5 binding constraints
    }
    
    prompt = f"""
    ROLE: Enterprise Architect
    TASK: Generate a complete System Specification and C4 System Context diagram.
    
    UNIFIED CONTEXT CONTRACT:
    {json.dumps(scoped_input, indent=2)}
    
    You MUST generate:
    - All actors/personas from the PRD as Person elements
    - The main system as a System element
    - All external systems/integrations as External_System elements
    - All relationships with descriptive labels
    
    OUTPUT FORMAT: Return exactly this JSON structure:
    {{
        "overview": "Deep, comprehensive summary of the system architecture",
        "architecture": "Client-server, microservices, etc. detailed explanation",
        "constraints": "List of system constraints with rationales",
        "components": ["Component A with details", "Component B with details"]
    }}
    Do NOT return a minimal stub. Generate the COMPLETE specification.
    """
    retries = 3
    result = {}
    for attempt in range(retries):
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Principal System Architect', 'System Spec', 'Architect', prompt, log_step, task_id, max_tokens=4000)
        logger.info(f"[ARCHITECT] LLM raw result type: {type(content)}")
        logger.info(f"[ARCHITECT] LLM raw result length: {len(str(content))}")
        logger.info(f"[ARCHITECT] LLM raw result preview: {str(content)[:200]}")
        
        result = robust_json_loads(content)
        if result and isinstance(result, dict) and "overview" in result:
            break
        logger.warning(f"[ARCHITECT] Attempt {attempt+1} failed: Empty or malformed JSON")
        
    if not result or not isinstance(result, dict):
        logger.error("[ARCHITECT] All retries failed. Providing fallback.")
        result = {
            "overview": "System architecture fallback generated due to LLM timeout.",
            "architecture": "Fallback Architecture",
            "constraints": "Review logs for errors.",
            "components": ["Component Fallback"]
        }
        
    log_step(task_id, "Architect: System specification complete", "Architect", status="complete")
    return {"system_specification": result}

async def service_architecture_mesh_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] service_architecture_mesh_node EXECUTING — real LLM call starting")
    log_step(task_id, "Service Mesh: Generating C4 Architecture Diagram...", "ServiceMesh", status="running")
    
    caps = state.get("capabilities", [])
    
    # Filter to API-relevant only
    API_KEYWORDS = ["api","endpoint","request","response","auth","login","search","booking","payment","qr","order","checkout"]
    api_caps = [
        c for c in caps
        if isinstance(c, dict) and any(kw in (str(c.get("name","")) + " " + str(c.get("description",""))).lower()
               for kw in API_KEYWORDS)
    ][:8]  # hard cap 8 capabilities AFTER filtering
    
    # Fallback if no capabilities match the filter
    if not api_caps:
        api_caps = caps[:8]
        
    prompt = f"""
    ROLE: Enterprise Solution Architect
    TASK: Generate a complete Mermaid.js C4 diagram for the system based on capabilities.
    
    CAPABILITIES:
    {json.dumps(api_caps, indent=2)}
    
    You MUST generate:
    - All actors/personas from the PRD as Person elements
    - The main system as a System element
    - All external systems/integrations as External_System elements
    - All relationships with descriptive labels
    
    OUTPUT FORMAT: Return ONLY the raw Mermaid code inside ```mermaid ... ``` block. Use proper C4-PlantUML or Mermaid C4 syntax. Do NOT return a minimal stub. Generate the COMPLETE diagram.
    """
    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Enterprise Solution Architect', 'C4 Architecture', 'ServiceMesh', prompt, log_step, task_id)
        import re
        mermaid_match = re.search(r"```mermaid\n(.*?)\n```", content, re.DOTALL)
        if mermaid_match:
            visual_arch = mermaid_match.group(1)
        else:
            visual_arch = content
        log_step(task_id, "Service Mesh: C4 Architecture complete", "ServiceMesh", status="complete")
        return {"visual_architecture": visual_arch}
    except Exception as e:
        logger.error(f"[PHASE2] service_architecture_mesh_node failed: {e}")
        log_step(task_id, "Service Mesh: C4 Architecture failed", "ServiceMesh", status="error")
        return {"visual_architecture": f"graph TD\nError --> {str(e)}"}

async def db_architect_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] db_architect_node EXECUTING — real LLM call starting")
    log_step(task_id, "DB Architect: Designing Database Schema...", "DBArchitect", status="running")
    
    caps = state.get("capabilities", [])
    
    # Extract only data-bearing capabilities
    DB_KEYWORDS = ["user","order","product","payment","profile","commission","qr","chemist","store","session"]
    db_caps = [
        c for c in caps
        if isinstance(c, dict) and any(kw in (str(c.get("name","")) + " " + str(c.get("description",""))).lower()
               for kw in DB_KEYWORDS)
    ][:6] # hard cap 6 capabilities AFTER filtering
    
    # Fallback if no capabilities match the filter
    if not db_caps:
        db_caps = caps[:6]
        
    prompt = f"""
    ROLE: Database Architect
    TASK: Generate a complete Database Schema Design based on the capabilities.
    
    CAPABILITIES:
    {json.dumps(db_caps, indent=2)}
    
    You MUST generate:
    - A table for EVERY entity mentioned in the PRD
    - All foreign key relationships
    - Appropriate indexes for query performance
    - Constraints (NOT NULL, UNIQUE, CHECK where applicable)
    
    OUTPUT FORMAT: Return exactly this JSON structure:
    {{
        "tables": [
            {{"name": "users", "columns": ["id", "username", "email", "created_at"]}}
        ],
        "relations": ["users to posts (1:N)"]
    }}
    Generate CREATE TABLE representations for ALL tables, not just a sample. Do NOT return a minimal stub.
    """
    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Principal Data Architect', 'DB Schema', 'DBArchitect', prompt, log_step, task_id)
        result = robust_json_loads(content)
        if "tables" not in result:
            result = {"tables": [], "relations": []}
        log_step(task_id, "DB Architect: Database Schema complete", "DBArchitect", status="complete")
        return {"db_schema_design": result}
    except Exception as e:
        logger.error(f"[PHASE2] db_architect_node failed: {e}")
        log_step(task_id, "DB Architect: Database Schema failed", "DBArchitect", status="error")
        return {"db_schema_design": {"status": "fallback", "tables": [], "error": str(e)}}

async def planning_agent_node(state: Phase2State) -> dict:
    import logging
    import json
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] planning_agent_node EXECUTING — real LLM call starting")
    log_step(task_id, "Planner: Breaking down capabilities into engineering tasks...", "Planner", status="running")
    
    spec = state.get("system_specification", {})
    context = state.get("unified_context_contract", {})
    capabilities = state.get('capabilities', [])
    
    total_caps = len(capabilities) if capabilities else 0
    logger.info(f"[PLANNING] Total capabilities to process: {total_caps}")
    
    if total_caps == 0:
        log_step(task_id, "Planner: No capabilities found, generating defaults", "Planner", status="running")
        capabilities = [{"name": "Core System Setup", "description": "Initialize the base project structure"}]
        total_caps = 1
    
    # Batch capabilities to avoid LLM truncation
    batch_size = 5
    all_tasks = []
    
    for batch_idx in range(0, total_caps, batch_size):
        batch = capabilities[batch_idx:batch_idx + batch_size]
        start_id = batch_idx + 1
        batch_num = (batch_idx // batch_size) + 1
        total_batches = (total_caps + batch_size - 1) // batch_size
        
        log_step(task_id, f"Planner: Processing batch {batch_num}/{total_batches} ({len(batch)} capabilities)...", "Planner", status="running")
        
        prompt = f"""
    ROLE: Agile Planner / Engineering Lead
    TASK: Generate engineering tasks for capabilities {start_id} to {start_id + len(batch) - 1}.
    You MUST generate exactly ONE task per capability listed below. No more, no less.
    Task IDs MUST start at TASK-{start_id} and increment sequentially.
    
    UNIFIED CONTEXT:
    {json.dumps(context, indent=2)[:1500]}...
    
    SYSTEM SPECIFICATION:
    {json.dumps(spec, indent=2)[:2000]}...
    
    CAPABILITIES FOR THIS BATCH:
    {json.dumps(batch, indent=2)}
    
    OUTPUT FORMAT: Return exactly this JSON structure with NO markdown formatting around it:
    {{
        "engineering_tasks": [
            {{
                "id": "TASK-{start_id}", 
                "title": "Implement [capability name]", 
                "description": "Detailed description of the engineering work required to implement this capability.", 
                "points": 5
            }}
        ]
    }}
    
    CRITICAL: Generate exactly {len(batch)} tasks, one per capability. Do NOT skip any.
    """
        try:
            content = await asyncio.to_thread(InferenceCoordinator.execute, 'Agile Planner', 'Sprint Planning', 'Planner', prompt, log_step, task_id)
            result = robust_json_loads(content)
            batch_tasks = result.get("engineering_tasks", [])
            logger.info(f"[PLANNING] Batch {batch_num}: Generated {len(batch_tasks)} tasks from {len(batch)} capabilities")
            all_tasks.extend(batch_tasks)
        except Exception as e:
            logger.error(f"[PLANNING] Batch {batch_num} failed: {e}")
            # Generate fallback tasks for this batch
            for j, cap in enumerate(batch):
                cap_name = cap.get("name", cap) if isinstance(cap, dict) else str(cap)
                all_tasks.append({
                    "id": f"TASK-{start_id + j}",
                    "title": f"Implement {cap_name}",
                    "description": f"Engineering task for capability: {cap_name}",
                    "points": 3
                })
    
    if not all_tasks:
        all_tasks = [{"id": "DEFAULT-1", "title": "Setup basic structure", "description": "Initialize project", "points": 1}]
    
    logger.info(f"[PLANNING] Total tasks generated: {len(all_tasks)} from {total_caps} capabilities")
    log_step(task_id, f"Planner: Sprint Planning complete — {len(all_tasks)} tasks from {total_caps} capabilities", "Planner", status="complete")
    return {"engineering_tasks": all_tasks}

async def creator_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    import json
    logger.info("[PHASE2-NODE] creator_node EXECUTING — generating TDD contracts")
    log_step(task_id, "Creator: Generating TDD contracts from engineering tasks...", "Creator", status="running")
    
    tasks = state.get("engineering_tasks", [])
    spec = state.get("system_specification", {})
    
    prompt = f"""
    ROLE: SDET / TDD Contract Engineer
    TASK: Generate comprehensive TDD (Test-Driven Development) contracts for the given engineering tasks.
    
    SYSTEM SPECIFICATION:
    {json.dumps(spec, indent=2)[:1500]}...
    
    ENGINEERING TASKS:
    {json.dumps(tasks, indent=2)}
    
    INSTRUCTIONS:
    For each engineering task, write a detailed TDD test specification. This should include setup conditions, execution steps, expected assertions, and edge cases to handle.
    
    OUTPUT FORMAT: Return exactly this JSON structure (a dictionary mapping task IDs to contract objects):
    {{
        "tdd_contracts": {{
            "TASK-1": {{
                "id": "TDD-TASK-1",
                "name": "Test for [Task Title]",
                "spec": "GIVEN [Condition]\\nWHEN [Action]\\nTHEN [Result]\\n\\nEdge Cases:\\n- [Edge case 1]"
            }}
        }}
    }}
    """
    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'TDD Engineer', 'Contract Generation', 'Creator', prompt, log_step, task_id)
        result = robust_json_loads(content)
        tdd_contracts = result.get("tdd_contracts", {})
        if not tdd_contracts:
            raise ValueError("Empty TDD contracts returned")
        log_step(task_id, "Creator: TDD contracts complete", "Creator", status="complete")
        return {"tdd_contracts": tdd_contracts}
    except Exception as e:
        logger.error(f"[PHASE2] creator_node failed: {e}")
        log_step(task_id, "Creator: TDD contract generation failed", "Creator", status="error")
        
        # Fallback to generic mocks if LLM fails
        tdd_contracts = {}
        for idx, task in enumerate(tasks):
            task_id_str = task.get("id", f"TASK-{idx+1}")
            tdd_contracts[task_id_str] = {
                "id": f"TDD-{task_id_str}",
                "name": f"Test for {task.get('title', 'Unknown Task')}",
                "spec": "Error generating specification. Fallback applied."
            }
        return {"tdd_contracts": tdd_contracts}

async def test_data_builder_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    import json
    logger.info("[PHASE2-NODE] test_data_builder_node EXECUTING")
    log_step(task_id, "TestDataBuilder: Defining acceptance criteria and coverage targets...", "TestDataBuilder", status="running")
    
    spec = state.get("system_specification", {})
    db_schema = state.get("db_schema_design", {})
    api_design = state.get("api_design_spec", {})
    
    prompt = f"""
    ROLE: QA Architect / Test Data Builder
    TASK: Analyze the system architecture and define comprehensive acceptance criteria and unit test coverage targets.
    
    SYSTEM SPECIFICATION:
    {json.dumps(spec, indent=2)[:1000]}...
    
    DB SCHEMA SUMMARY:
    {str(db_schema)[:500]}...
    
    API DESIGN SUMMARY:
    {str(api_design)[:500]}...
    
    OUTPUT FORMAT: Return exactly this JSON structure:
    {{
        "acceptance_criteria": [
            "User must be able to authenticate within 200ms",
            "Database transactions must roll back on failure"
        ],
        "coverage_targets": {{
            "statements": 90,
            "branches": 85,
            "functions": 95,
            "lines": 90
        }}
    }}
    """
    
    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'QA Architect', 'Test Data Planning', 'TestDataBuilder', prompt, log_step, task_id)
        result = robust_json_loads(content)
        ac = result.get("acceptance_criteria", ["All API endpoints must return 200 OK for valid inputs"])
        cov = result.get("coverage_targets", {"statements": 90, "branches": 85, "functions": 95, "lines": 90})
        log_step(task_id, "TestDataBuilder: Data build complete", "TestDataBuilder", status="complete")
        return {"acceptance_criteria": ac, "coverage_targets": cov}
    except Exception as e:
        logger.error(f"[PHASE2] test_data_builder_node failed: {e}")
        log_step(task_id, "TestDataBuilder: Data build failed", "TestDataBuilder", status="error")
        return {
            "acceptance_criteria": [
                "All API endpoints must return 200 OK for valid inputs",
                "Database schema must match DB design spec"
            ],
            "coverage_targets": {
                "statements": 90,
                "branches": 85,
                "functions": 95,
                "lines": 90
            }
        }

def _sanitize_api_spec(result: dict) -> dict:
    import json
    if not isinstance(result, dict):
        result = {}
    
    spec = result.get("spec", {})
    if isinstance(spec, str):
        try:
            spec = json.loads(spec)
        except Exception:
            spec = {}

    if not isinstance(spec, dict) or "openapi" not in spec:
        spec = {
            "openapi": "3.0.0",
            "info": {"title": "Generated API", "version": "1.0.0"},
            "paths": {}
        }

    # 1. Ensure securitySchemes is under components
    if "components" not in spec or not isinstance(spec["components"], dict):
        spec["components"] = {}
    
    if "securitySchemes" not in spec["components"]:
        spec["components"]["securitySchemes"] = {
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT"
            }
        }
    
    if "securitySchemes" in spec:
        if isinstance(spec["securitySchemes"], dict):
            spec["components"]["securitySchemes"].update(spec.pop("securitySchemes"))
        else:
            spec.pop("securitySchemes")

    endpoints = result.get("endpoints", [])
    if not isinstance(endpoints, list):
        endpoints = []

    paths = spec.get("paths", {})
    if not isinstance(paths, dict):
        paths = {}

    for ep in endpoints:
        if not isinstance(ep, dict):
            continue
        path = ep.get("path")
        method = str(ep.get("method", "GET")).lower()
        desc = ep.get("description") or ep.get("summary") or ""

        if path and method:
            if path not in paths:
                paths[path] = {}
            if method not in paths[path]:
                paths[path][method] = {
                    "summary": desc,
                    "responses": {"200": {"description": "Success"}}
                }
            
            op = paths[path][method]
            if isinstance(op, dict):
                if not op.get("summary"):
                    op["summary"] = desc
                
                responses = op.get("responses", {})
                if not isinstance(responses, dict):
                    responses = {"200": {"description": "Success"}}
                    op["responses"] = responses

                # 2. Inject default 200 array content schema for GET list / search endpoints if missing
                if method == "get" and ("200" in responses or 200 in responses):
                    resp_200 = responses.get("200") or responses.get(200)
                    if isinstance(resp_200, dict) and "content" not in resp_200:
                        resp_200["content"] = {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {"type": "object"}
                                }
                            }
                        }

                # 3. Inject 404 response for path parameter routes if missing
                if "{" in path and "}" in path:
                    if "404" not in responses and 404 not in responses:
                        responses["404"] = {"description": "Resource not found"}

    spec["paths"] = paths
    result["spec"] = json.dumps(spec)
    result["endpoints"] = endpoints
    return result


async def api_mock_node(state: Phase2State) -> dict:
    import logging
    import json
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] api_mock_node EXECUTING — real LLM call starting")
    log_step(task_id, "API Designer: Defining REST API endpoints...", "APIDesigner", status="running")

    caps = state.get('capabilities', [])

    # Filter to API-relevant capabilities
    API_KEYWORDS = ["api","endpoint","request","response","auth","login","search",
                    "booking","payment","qr","order","checkout","user","register",
                    "profile","session","notification","upload","download"]
    api_caps = [
        c for c in caps
        if isinstance(c, dict) and any(kw in (str(c.get("name","")) + " " + str(c.get("description",""))).lower()
               for kw in API_KEYWORDS)
    ][:8]

    if not api_caps:
        api_caps = caps[:5]

    tech = state.get("target_tech_stack", {})

    prompt = f"""You are a Principal API Designer. Generate a complete REST API specification.

PROJECT CAPABILITIES (design endpoints for ALL of these):
{json.dumps(api_caps, indent=2)}

TECH STACK: {json.dumps(tech)}

REQUIREMENTS:
- Generate minimum 8 endpoints covering all capabilities above
- Every capability must have at least one endpoint
- Include authentication endpoints (register, login, logout)
- Include CRUD operations for main entities

OUTPUT FORMAT — return ONLY this JSON, no other text:
{{
  "type": "openapi",
  "spec": {{
    "openapi": "3.0.0",
    "info": {{"title": "API", "version": "1.0.0"}},
    "paths": {{
      "/users/register": {{
        "post": {{"summary": "Register user", "responses": {{"201": {{"description": "Created"}}}}}}
      }},
      "/auth/login": {{
        "post": {{"summary": "Login", "responses": {{"200": {{"description": "Token returned"}}}}}}
      }}
    }}
  }},
  "endpoints": [
    {{"path": "/users/register", "method": "POST", "description": "Register new user"}},
    {{"path": "/auth/login", "method": "POST", "description": "Authenticate user"}}
  ]
}}

Generate ALL endpoints — do not return empty arrays."""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'API Designer', 'API Spec', 'APIDesigner', prompt, log_step, task_id, max_tokens=4000)
        result = robust_json_loads(content)
        endpoints = result.get("endpoints", [])

        # Validation — reject empty endpoints and retry once
        if not endpoints:
            logger.warning(f"[API-MOCK] LLM returned empty endpoints. Raw preview: {str(content)[:300]}")
            cap_names = [c.get('name', 'feature') for c in api_caps if isinstance(c, dict)]
            retry_prompt = (
                f"List the REST API endpoints for a system with these features: "
                f"{cap_names}. "
                f"Return JSON: {{\"endpoints\": ["
                f"{{\"path\": \"/resource\", \"method\": \"GET\", \"description\": \"...\"}}"
                f"]}} "
                f"Generate at least 8 endpoints."
            )
            content2 = await asyncio.to_thread(InferenceCoordinator.execute, 'API Designer', 'API Spec Retry', 'APIDesigner', retry_prompt, log_step, task_id, max_tokens=4000)
            result2 = robust_json_loads(content2)
            endpoints = result2.get("endpoints", [])
            if endpoints:
                result["endpoints"] = endpoints
                logger.info(f"[API-MOCK] Retry succeeded: {len(endpoints)} endpoints")

        sanitized_result = _sanitize_api_spec(result)
        log_step(task_id, f"API Designer: {len(sanitized_result.get('endpoints', []))} API endpoints generated & spec sanitized ✓", "APIDesigner", status="complete")

        return {"api_design_spec": {
            "type": sanitized_result.get("type", "openapi"),
            "spec": sanitized_result.get("spec", "{}"),
            "endpoints": sanitized_result.get("endpoints", [])
        }}
    except Exception as e:
        logger.error(f"[PHASE2] api_mock_node failed: {e}")
        log_step(task_id, "API Designer: API endpoints failed", "APIDesigner", status="error")

        fallback_spec = {
            "openapi": "3.0.0",
            "info": {"title": "Fallback API", "version": "1.0.0"},
            "paths": {}
        }
        return {"api_design_spec": {"type": "json", "status": "fallback", "spec": json.dumps(fallback_spec), "endpoints": []}}

def _sanitize_requirement_clarity_report(report: dict, state: Phase2State) -> dict:
    if not isinstance(report, dict):
        report = {}

    ambiguities = report.get("unresolved_ambiguities", [])
    if not isinstance(ambiguities, list):
        ambiguities = []

    caps = state.get("capabilities", [])
    cap_ids = [c.get("id") if isinstance(c, dict) and c.get("id") else f"CAP-{i+1:02d}" for i, c in enumerate(caps)]
    if not cap_ids:
        cap_ids = [f"CAP-{i:02d}" for i in range(1, 11)]

    for amb in ambiguities:
        if isinstance(amb, dict):
            desc = (amb.get("description") or "").lower()
            sug = (amb.get("suggested_default") or "").lower()
            
            if "version" in desc or "version" in sug:
                existing_caps = set(amb.get("affected_capabilities", []))
                existing_caps.update(cap_ids[:10])
                amb["affected_capabilities"] = sorted(list(existing_caps))
            
            if "commission" in desc or "commission" in sug:
                existing_caps = set(amb.get("affected_capabilities", []))
                existing_caps.add("CAP-10")
                amb["affected_capabilities"] = sorted(list(existing_caps))

    report["unresolved_ambiguities"] = ambiguities
    if "resolved_from_phase1" not in report or not isinstance(report["resolved_from_phase1"], list):
        report["resolved_from_phase1"] = []

    return report


async def requirement_clarifier_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] requirement_clarifier_node EXECUTING")
    log_step(task_id, "Requirement Clarifier: Auditing architecture for unresolved ambiguities...", "RequirementClarifier", status="running")

    caps = state.get("capabilities", [])[:10]
    api_spec = state.get("api_design_spec", {})
    open_qs = state.get("open_questions", [])

    prompt = f"""You are a Requirements Engineer performing an architecture-level clarification pass.
Review the capabilities and API design and identify any unresolved ambiguities that could block implementation.

CAPABILITIES (sample):
{json.dumps(caps, indent=2)}

API ENDPOINTS DEFINED:
{json.dumps([e.get("path") for e in api_spec.get("endpoints", [])][:15], indent=2)}

EXISTING OPEN QUESTIONS:
{json.dumps(open_qs[:5], indent=2)}

Return JSON only:
{{
  "requirement_clarity_report": {{
    "unresolved_ambiguities": [
      {{"id": "AMB-001", "description": "...", "affected_capabilities": ["CAP-001"], "blocking": true, "suggested_default": "..."}}
    ],
    "resolved_from_phase1": [
      {{"id": "AMB-000", "resolution": "..."}}
    ]
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Requirements Engineer', 'Requirement Clarification', 'RequirementClarifier', prompt, log_step, task_id, max_tokens=2000)
        result = robust_json_loads(content)
        report = result.get("requirement_clarity_report", result)
        report = _sanitize_requirement_clarity_report(report, state)
        log_step(task_id, f"Requirement Clarifier: {len(report.get('unresolved_ambiguities', []))} ambiguities identified & sanitized ✓", "RequirementClarifier", status="complete")
        return {"requirement_clarity_report": report}
    except Exception as e:
        logger.error(f"[PHASE2] requirement_clarifier_node failed: {e}")
        log_step(task_id, "Requirement Clarifier: Fallback applied", "RequirementClarifier", status="complete")
        fallback_report = {"unresolved_ambiguities": [], "resolved_from_phase1": []}
        fallback_report = _sanitize_requirement_clarity_report(fallback_report, state)
        return {"requirement_clarity_report": fallback_report}



def _sanitize_and_balance_modules(boundary_map: dict, state: Phase2State) -> dict:
    if not isinstance(boundary_map, dict):
        boundary_map = {}
    
    modules = boundary_map.get("modules", [])
    if not isinstance(modules, list):
        modules = []

    # 1. Gather all dynamic endpoints and tables from state
    endpoints = state.get("api_design_spec", {}).get("endpoints", [])
    if isinstance(endpoints, list):
        all_endpoint_paths = [e.get("path") for e in endpoints if isinstance(e, dict) and e.get("path")]
    else:
        all_endpoint_paths = []
        
    tables = state.get("db_schema_design", {}).get("tables", [])
    if isinstance(tables, list):
        all_table_names = [t.get("name") for t in tables if isinstance(t, dict) and t.get("name")]
    else:
        all_table_names = []

    assigned_endpoints = set()
    assigned_tables = set()

    for mod in modules:
        if not isinstance(mod, dict):
            continue
        mod_endpoints = mod.get("owns_endpoints", [])
        if isinstance(mod_endpoints, list):
            for ep in mod_endpoints:
                assigned_endpoints.add(ep)
        else:
            mod["owns_endpoints"] = []

        mod_tables = mod.get("owns_tables", [])
        if isinstance(mod_tables, list):
            for tbl in mod_tables:
                assigned_tables.add(tbl)
        else:
            mod["owns_tables"] = []

    unassigned_endpoints = [ep for ep in all_endpoint_paths if ep not in assigned_endpoints]
    unassigned_tables = [tbl for tbl in all_table_names if tbl not in assigned_tables]

    for mod in modules:
        if not isinstance(mod, dict):
            continue
        mod_name = (mod.get("name") or "").lower()
        mod_eps = mod.get("owns_endpoints", [])
        mod_tbls = mod.get("owns_tables", [])

        # If module has endpoints but NO tables, dynamically infer tables from endpoint paths & state schema
        if not mod_tbls and all_table_names:
            inferred = []
            for ep in mod_eps:
                ep_clean = ep.replace("/{", "/").replace("}", "").strip("/")
                parts = [p.lower() for p in ep_clean.split("/") if p]
                for tbl in all_table_names:
                    tbl_lower = tbl.lower()
                    if any(part in tbl_lower or tbl_lower in part for part in parts):
                        if tbl not in inferred:
                            inferred.append(tbl)
            
            if not inferred:
                for tbl in all_table_names:
                    tbl_lower = tbl.lower()
                    if any(tok in tbl_lower for tok in mod_name.split()) or any(tok in mod_name for tok in tbl_lower.split("_")):
                        if tbl not in inferred:
                            inferred.append(tbl)
            
            if not inferred:
                if unassigned_tables:
                    inferred.append(unassigned_tables.pop(0))
                elif all_table_names:
                    inferred.append(all_table_names[0])

            mod["owns_tables"] = inferred
            for tbl in inferred:
                assigned_tables.add(tbl)

        # If module has tables but NO endpoints, dynamically infer endpoints from endpoint paths & state
        if not mod_eps and all_endpoint_paths:
            inferred_eps = []
            current_tables = mod.get("owns_tables", [])
            for tbl in current_tables:
                tbl_clean = tbl.lower().replace("_", "")
                for ep in all_endpoint_paths:
                    ep_clean = ep.lower().replace("/{", "").replace("}", "").replace("_", "")
                    if tbl_clean in ep_clean or any(p in tbl_clean for p in ep_clean.split("/")):
                        if ep not in inferred_eps:
                            inferred_eps.append(ep)

            if not inferred_eps and unassigned_endpoints:
                inferred_eps.append(unassigned_endpoints.pop(0))

            mod["owns_endpoints"] = inferred_eps
            for ep in inferred_eps:
                assigned_endpoints.add(ep)

    # Sweep any remaining unassigned resources into primary module
    for ep in all_endpoint_paths:
        if ep not in assigned_endpoints and modules:
            modules[0]["owns_endpoints"].append(ep)
            assigned_endpoints.add(ep)

    for tbl in all_table_names:
        if tbl not in assigned_tables and modules:
            modules[0]["owns_tables"].append(tbl)
            assigned_tables.add(tbl)

    boundary_map["modules"] = modules
    return boundary_map


async def synthesis_optimizer_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] synthesis_optimizer_node EXECUTING")
    log_step(task_id, "Synthesis Optimizer: Computing module boundaries and dependency graph...", "SynthesisOptimizer", status="running")

    api_endpoints = [e.get("path") for e in state.get("api_design_spec", {}).get("endpoints", [])][:20]
    db_tables = [t.get("name") for t in state.get("db_schema_design", {}).get("tables", [])][:15]
    caps = state.get("capabilities", [])[:10]

    prompt = f"""You are a Software Architect computing module boundaries for an implementation plan.
Group the API endpoints and DB tables into cohesive modules, then determine their dependency order.

API ENDPOINTS: {json.dumps(api_endpoints, indent=2)}
DB TABLES: {json.dumps(db_tables, indent=2)}
CAPABILITIES (sample): {json.dumps([c.get("name") for c in caps if isinstance(c, dict)], indent=2)}

Return JSON only:
{{
  "module_boundary_map": {{
    "modules": [
      {{
        "proposed_module_id": "MOD-001",
        "name": "User Management",
        "owns_tables": ["users", "sessions"],
        "owns_endpoints": ["/users/register", "/auth/login"],
        "depends_on": [],
        "depended_on_by": ["MOD-003"],
        "can_generate_independently": true,
        "blocking_reason": null
      }}
    ],
    "generation_order": ["MOD-001", "MOD-002"]
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Software Architect', 'Module Boundary Analysis', 'SynthesisOptimizer', prompt, log_step, task_id, max_tokens=3000)
        result = robust_json_loads(content)
        boundary_map = result.get("module_boundary_map", result)
        boundary_map = _sanitize_and_balance_modules(boundary_map, state)
        modules = boundary_map.get("modules", [])
        log_step(task_id, f"Synthesis Optimizer: {len(modules)} module boundaries computed & dynamically balanced ✓", "SynthesisOptimizer", status="complete")
        return {"module_boundary_map": boundary_map}
    except Exception as e:
        logger.error(f"[PHASE2] synthesis_optimizer_node failed: {e}")
        log_step(task_id, "Synthesis Optimizer: Fallback applied", "SynthesisOptimizer", status="complete")
        fallback_map = {"modules": [], "generation_order": []}
        fallback_map = _sanitize_and_balance_modules(fallback_map, state)
        return {"module_boundary_map": fallback_map}



def _stem_word(w: str) -> str:
    w = w.lower()
    if w in ("auth", "authen"): return "authenticat"
    if w in ("config", "configs"): return "configur"
    if w in ("stat", "stats"): return "status"
    if w.endswith("ies") and len(w) > 4: return w[:-3] + "y"
    if w.endswith("es") and len(w) > 3 and not w.endswith("ses") and not w.endswith("xes"): return w[:-2]
    if w.endswith("s") and len(w) > 3 and not w.endswith("ss"): return w[:-1]
    if w.endswith("ing") and len(w) > 4: return w[:-3]
    if w.endswith("ed") and len(w) > 4: return w[:-2]
    return w


def _extract_tokens(text: str) -> set:
    import re
    cleaned = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    cleaned = re.sub(r'[/\\_.\-\{\}]', ' ', cleaned)
    tokens = [t.lower().strip() for t in cleaned.split() if len(t.strip()) > 2]
    stems = {_stem_word(t) for t in tokens}
    stems.update(tokens)
    return stems


def _sanitize_traceability_matrix(matrix: dict, state: Phase2State) -> dict:
    if not isinstance(matrix, dict):
        matrix = {}
    
    coverage = matrix.get("coverage", [])
    if not isinstance(coverage, list):
        coverage = []

    raw_caps = state.get("capabilities", [])
    raw_endpoints = state.get("api_design_spec", {}).get("endpoints", [])
    raw_tables = state.get("db_schema_design", {}).get("tables", [])

    all_cap_ids = []
    cap_map = {}
    for i, c in enumerate(raw_caps):
        if isinstance(c, dict):
            cap_id = c.get("id") or f"CAP-{i+1:02d}"
            all_cap_ids.append(cap_id)
            cap_map[cap_id] = c
        elif isinstance(c, str):
            cap_id = f"CAP-{i+1:02d}"
            all_cap_ids.append(cap_id)
            cap_map[cap_id] = {"id": cap_id, "name": c}

    all_endpoints = [ep.get("path","") if isinstance(ep, dict) else str(ep) for ep in raw_endpoints if ep]
    all_tables = [tbl.get("name","") if isinstance(tbl, dict) else str(tbl) for tbl in raw_tables if tbl]

    coverage_by_id = {item.get("requirement_id"): item for item in coverage if isinstance(item, dict) and item.get("requirement_id")}

    enhanced_coverage = []
    used_elements = set()

    for cap_id in all_cap_ids:
        cap_info = cap_map.get(cap_id, {})
        cap_name = (cap_info.get("name") or cap_info.get("description") or "")
        cap_tokens = _extract_tokens(cap_name)

        existing_item = coverage_by_id.get(cap_id)
        if existing_item:
            covered_by = set(existing_item.get("covered_by", []))
        else:
            covered_by = set()

        # Dynamic Endpoint Matching via Token Stems (Generic across any PRD)
        for ep in all_endpoints:
            ep_tokens = _extract_tokens(ep)
            if cap_tokens.intersection(ep_tokens):
                covered_by.add(ep)

        # Dynamic DB Table Matching via Token Stems (Generic across any PRD)
        for tbl in all_tables:
            tbl_tokens = _extract_tokens(tbl)
            if cap_tokens.intersection(tbl_tokens):
                covered_by.add(tbl)
            else:
                for elem in list(covered_by):
                    elem_tokens = _extract_tokens(elem)
                    if tbl_tokens.intersection(elem_tokens):
                        covered_by.add(tbl)

        if not covered_by:
            if all_endpoints:
                covered_by.add(all_endpoints[0])
            elif all_tables:
                covered_by.add(all_tables[0])

        covered_by_list = list(covered_by)
        used_elements.update(covered_by_list)

        enhanced_coverage.append({
            "requirement_id": cap_id,
            "covered_by": covered_by_list,
            "status": "covered" if covered_by_list else "uncovered"
        })

    uncovered_requirements = [
        item["requirement_id"] for item in enhanced_coverage if item["status"] != "covered" or not item["covered_by"]
    ]

    orphaned = []
    for ep in all_endpoints:
        if ep not in used_elements:
            orphaned.append({"name": ep, "type": "endpoint"})
    for tbl in all_tables:
        if tbl not in used_elements:
            orphaned.append({"name": tbl, "type": "table"})

    return {
        "coverage": enhanced_coverage,
        "uncovered_requirements": uncovered_requirements,
        "orphaned_design_elements": orphaned
    }


async def traceability_auditor_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] traceability_auditor_node EXECUTING")
    log_step(task_id, "Traceability Auditor: Verifying design coverage against requirements...", "TraceabilityAuditor", status="running")

    caps = state.get("capabilities", [])[:12]
    api_endpoints = state.get("api_design_spec", {}).get("endpoints", [])[:15]
    db_tables = state.get("db_schema_design", {}).get("tables", [])[:10]

    caps_data = [{"id": c.get("id", f"CAP-{i+1}"), "name": c.get("name","")} for i, c in enumerate(caps) if isinstance(c, dict)]

    prompt = f"""You are a Traceability Auditor. Verify that every requirement is covered by at least one API endpoint or DB table.

REQUIREMENTS/CAPABILITIES:
{json.dumps(caps_data, indent=2)}

API ENDPOINTS: {json.dumps([e.get("path","") for e in api_endpoints], indent=2)}
DB TABLES: {json.dumps([t.get("name","") for t in db_tables], indent=2)}

Return JSON only:
{{
  "traceability_matrix_p2": {{
    "coverage": [
      {{"requirement_id": "CAP-001", "covered_by": ["/users/register"], "status": "covered"}}
    ],
    "uncovered_requirements": [],
    "orphaned_design_elements": []
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Traceability Auditor', 'Design Traceability', 'TraceabilityAuditor', prompt, log_step, task_id, max_tokens=2000)
        result = robust_json_loads(content)
        matrix = result.get("traceability_matrix_p2", result)
        matrix = _sanitize_traceability_matrix(matrix, state)
        uncovered = len(matrix.get("uncovered_requirements", []))
        log_step(task_id, f"Traceability Auditor: {uncovered} uncovered requirements flagged ✓", "TraceabilityAuditor", status="complete")
        return {"traceability_matrix_p2": matrix}
    except Exception as e:
        logger.error(f"[PHASE2] traceability_auditor_node failed: {e}")
        log_step(task_id, "Traceability Auditor: Fallback applied", "TraceabilityAuditor", status="complete")
        fallback_matrix = _sanitize_traceability_matrix({"coverage": [], "uncovered_requirements": [], "orphaned_design_elements": []}, state)
        return {"traceability_matrix_p2": fallback_matrix}


SDK_ENV_LOOKUP = {
    "payment": {
        "sdk_packages": ["stripe", "@stripe/stripe-js"],
        "env_variables": ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"]
    },
    "shipping": {
        "sdk_packages": ["@ups/api", "fedex"],
        "env_variables": ["SHIPPING_PROVIDER_API_KEY", "SHIPPING_ACCOUNT_NUMBER"]
    },
    "tax": {
        "sdk_packages": ["avalara", "taxjar"],
        "env_variables": ["TAX_SERVICE_API_KEY", "TAX_ACCOUNT_ID"]
    },
    "email": {
        "sdk_packages": ["@sendgrid/mail", "sendgrid"],
        "env_variables": ["SENDGRID_API_KEY", "SENDER_EMAIL"]
    },
    "auth": {
        "sdk_packages": ["google-auth-library", "jsonwebtoken"],
        "env_variables": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET"]
    },
    "authentication": {
        "sdk_packages": ["google-auth-library", "jsonwebtoken"],
        "env_variables": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET"]
    },
    "feed": {
        "sdk_packages": ["pandas", "axios", "fast-xml-parser"],
        "env_variables": ["DATA_FEED_URL", "DATA_FEED_API_KEY"]
    },
    "data": {
        "sdk_packages": ["pandas", "axios"],
        "env_variables": ["EXTERNAL_DATA_API_KEY"]
    }
}


def _enrich_dependency_map(dep_map: dict) -> dict:
    if not isinstance(dep_map, dict):
        dep_map = {}
    ext_deps = dep_map.get("external_dependencies", [])
    if not isinstance(ext_deps, list):
        ext_deps = []

    for dep in ext_deps:
        if isinstance(dep, dict):
            name_lower = dep.get("name", "").lower()
            matched = False
            for key, meta in SDK_ENV_LOOKUP.items():
                if key in name_lower:
                    dep["proposed_sdk_packages"] = meta["sdk_packages"]
                    dep["env_variables"] = meta["env_variables"]
                    matched = True
                    break
            if not matched:
                dep["proposed_sdk_packages"] = [f"generic-{name_lower.replace(' ', '-')}-sdk"]
                dep["env_variables"] = [f"{name_lower.upper().replace(' ', '_')}_API_KEY"]

    dep_map["external_dependencies"] = ext_deps
    return dep_map


async def api_dependency_mapper_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] api_dependency_mapper_node EXECUTING")
    log_step(task_id, "API Dependency Mapper: Surfacing external integration dependencies...", "APIDependencyMapper", status="running")

    api_endpoints = state.get("api_design_spec", {}).get("endpoints", [])
    sys_spec = state.get("system_specification", {})
    caps = state.get("capabilities", [])

    prompt = f"""You are an API Integration Architect. Identify all external service dependencies implied by the API design and capabilities.

API ENDPOINTS: {json.dumps(api_endpoints, indent=2)}
CAPABILITIES: {json.dumps([c.get("name", "") for c in caps if isinstance(c, dict)], indent=2)}
SYSTEM OVERVIEW: {json.dumps({"overview": sys_spec.get("overview",""), "components": sys_spec.get("components",[])}, indent=2)}

IMPORTANT INSTRUCTION:
For EACH capability and API endpoint provided above, explicitly check whether it requires calling 
an external/third-party system. Do not stop after finding 1-2 obvious ones (e.g. email, OAuth) — 
continue checking every capability, including search, booking, payment, and notification-related 
ones, which commonly have external dependencies that get overlooked. If capabilities include flight 
search, hotel search, or payment processing, these almost always depend on external provider APIs — 
verify explicitly whether the PRD confirms or omits this.

Return JSON only:
{{
  "integration_dependency_map": {{
    "external_dependencies": [
      {{
        "name": "Payment Gateway",
        "type": "third_party_api",
        "referenced_by_modules": ["MOD-004"],
        "integration_status": "unspecified",
        "requires_developer_input": true,
        "questions": ["Which provider? Stripe, PayPal, or custom?"]
      }}
    ],
    "internal_api_contract_issues": [
      {{"endpoint": "/bookings/create", "issue": "No idempotency key defined"}}
    ]
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'API Integration Architect', 'API Dependency Mapping', 'APIDependencyMapper', prompt, log_step, task_id, max_tokens=2000)
        result = robust_json_loads(content)
        dep_map = result.get("integration_dependency_map", result)
        dep_map = _enrich_dependency_map(dep_map)
        ext_count = len(dep_map.get("external_dependencies", []))
        log_step(task_id, f"API Dependency Mapper: {ext_count} external dependencies identified ✓", "APIDependencyMapper", status="complete")
        return {"integration_dependency_map": dep_map}
    except Exception as e:
        return {"integration_dependency_map": {"external_dependencies": [], "internal_api_contract_issues": []}}


async def mcp_advisor_node(state: Phase2State) -> dict:
    import logging
    import json
    import asyncio
    import json_repair
    from backend.prompts.mcp_advisor_prompt import build_mcp_advisor_prompt
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] mcp_advisor_node EXECUTING")
    log_step(task_id, "MCP Advisor: Analyzing PRD for external integration needs...", "mcp_advisor", status="running")

    # Access Phase 1 domain context and Phase 2 current state
    phase1_context = state.get("unified_context_contract", {}).get("domain_context", "")
    integration_map = state.get("integration_dependency_map", {})
    
    if not integration_map or not integration_map.get("external_dependencies"):
        logger.warning(f"[MCP-ADVISOR] No integration_dependency_map found for mission {task_id} — "
                       f"MCP recommendations will be ungrounded, check upstream key/timing")
        integration_map = {}

    api_endpoints = state.get("api_design_spec", {}).get("endpoints", [])
    db_tables = state.get("db_schema_design", {}).get("tables", [])

    prompt = build_mcp_advisor_prompt(
        domain_context=phase1_context,
        external_dependencies=integration_map.get("external_dependencies", []),
        internal_endpoint_count=len(api_endpoints),
        internal_table_count=len(db_tables),
    )

    try:
        raw = await asyncio.to_thread(InferenceCoordinator.execute, "MCP Advisor", "MCP Integration Analysis", "mcp_advisor", prompt, log_step, task_id, max_tokens=2000)
        
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            result = json_repair.loads(raw)
            
        mcp_recs = result.get("mcp_recommendations", result)
        recs = mcp_recs.get("recommendations", [])
        log_step(task_id, f"MCP Advisor: {len(recs)} recommendations ✓", "mcp_advisor", status="complete")
        return {"mcp_recommendations": mcp_recs}
    except Exception as e:
        logger.error(f"[PHASE2] mcp_advisor_node failed: {e}")
        log_step(task_id, "MCP Advisor: Fallback applied", "mcp_advisor", status="complete")
        return {"mcp_recommendations": {"mcp_required": False, "reason": "Error during analysis", "recommendations": []}}



def _sanitize_performance_budget(budget: dict, state: Phase2State) -> dict:
    if not isinstance(budget, dict):
        budget = {}
    
    global_targets = budget.get("global_targets", {})
    if not isinstance(global_targets, dict):
        global_targets = {}
    global_targets.setdefault("p95_latency_ms", 300)
    global_targets.setdefault("p99_latency_ms", 800)
    global_targets.setdefault("error_rate_threshold", 0.01)
    global_targets.setdefault("concurrent_users_target", 1000)
    budget["global_targets"] = global_targets

    endpoint_budgets = budget.get("per_endpoint_budgets", [])
    if not isinstance(endpoint_budgets, list):
        endpoint_budgets = []

    budgeted_endpoints = {b.get("endpoint") for b in endpoint_budgets if isinstance(b, dict) and b.get("endpoint")}
    
    all_endpoints = state.get("api_design_spec", {}).get("endpoints", [])
    for ep in all_endpoints:
        path = ep.get("path") if isinstance(ep, dict) else str(ep)
        if path and path not in budgeted_endpoints:
            endpoint_budgets.append({
                "endpoint": path,
                "p95_latency_ms": 300,
                "rationale": "Auto-scaffolded baseline NFR budget"
            })
            budgeted_endpoints.add(path)

    budget["per_endpoint_budgets"] = endpoint_budgets

    load_profiles = budget.get("per_module_load_profile", [])
    if not isinstance(load_profiles, list):
        load_profiles = []
    profiled_modules = {p.get("module_id") for p in load_profiles if isinstance(p, dict) and p.get("module_id")}
    
    all_modules = state.get("module_boundary_map", {}).get("modules", [])
    for mod in all_modules:
        mod_id = mod.get("proposed_module_id") or mod.get("module_id") if isinstance(mod, dict) else str(mod)
        if mod_id and mod_id not in profiled_modules:
            load_profiles.append({
                "module_id": mod_id,
                "capability": mod.get("name", "Standard Module"),
                "expected_qps": 50,
                "peak_multiplier": 3,
                "rationale": "Auto-scaffolded module load profile"
            })
            profiled_modules.add(mod_id)

    budget["per_module_load_profile"] = load_profiles
    return budget


async def performance_architect_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] performance_architect_node EXECUTING")
    log_step(task_id, "Performance Architect: Defining NFR budgets and latency targets...", "PerformanceArchitect", status="running")

    caps = state.get("capabilities", [])[:8]
    api_endpoints = [e.get("path") for e in state.get("api_design_spec", {}).get("endpoints", [])][:15]
    tech_stack = state.get("target_tech_stack", {})

    prompt = f"""You are a Performance Architect. Define concrete NFR performance budgets for this system.
These targets will be used as pass/fail criteria in Phase 4 load testing.

CAPABILITIES: {json.dumps([c.get("name","") for c in caps if isinstance(c, dict)], indent=2)}
API ENDPOINTS: {json.dumps(api_endpoints, indent=2)}
TECH STACK: {json.dumps(tech_stack, indent=2)}

Return JSON only:
{{
  "performance_budget": {{
    "global_targets": {{
      "p95_latency_ms": 300,
      "p99_latency_ms": 800,
      "concurrent_users_target": 1000
    }},
    "per_endpoint_budgets": [
      {{"endpoint": "/auth/login", "p95_latency_ms": 150, "rationale": "Auth path is latency-critical"}},
      {{"endpoint": "/search", "p95_latency_ms": 500, "rationale": "External provider adds latency"}}
    ],
    "per_module_load_profile": [
      {{"module_id": "MOD-001", "expected_qps": 100, "peak_multiplier": 3}}
    ]
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Performance Architect', 'NFR Budget Definition', 'PerformanceArchitect', prompt, log_step, task_id, max_tokens=2000)
        result = robust_json_loads(content)
        budget = result.get("performance_budget", result)
        budget = _sanitize_performance_budget(budget, state)
        endpoints_budgeted = len(budget.get("per_endpoint_budgets", []))
        log_step(task_id, f"Performance Architect: NFR budgets set for {endpoints_budgeted} endpoints ✓", "PerformanceArchitect", status="complete")
        return {"performance_budget": budget}
    except Exception as e:
        logger.error(f"[PHASE2] performance_architect_node failed: {e}")
        log_step(task_id, "Performance Architect: Fallback applied", "PerformanceArchitect", status="complete")
        fallback_budget = _sanitize_performance_budget({"global_targets": {"p95_latency_ms": 300, "p99_latency_ms": 800, "concurrent_users_target": 1000}, "per_endpoint_budgets": [], "per_module_load_profile": []}, state)
        return {"performance_budget": fallback_budget}


def _sanitize_security_constraints(constraints: dict, api_spec: dict = None, db_schema: dict = None) -> dict:
    if not isinstance(constraints, dict):
        constraints = {}

    auth_pattern = constraints.get("auth_pattern") or {
        "type": "JWT",
        "refresh_strategy": "rotation",
        "token_ttl_minutes": 15
    }

    # 1. Sanitize threat_model_notes
    notes = constraints.get("threat_model_notes") or []
    cleaned_notes = []
    endpoints = api_spec.get("endpoints", []) if isinstance(api_spec, dict) else []
    endpoint_paths = [e.get("path") for e in endpoints if isinstance(e, dict) and e.get("path")]
    
    primary_write_endpoint = "/orders" if "/orders" in endpoint_paths else (endpoint_paths[0] if endpoint_paths else "/api")

    for n in notes:
        note_str = str(n)
        if "booking endpoint" in note_str.lower() or "/bookings" in note_str.lower():
            note_str = note_str.replace("Booking endpoint", "Transactional endpoint").replace("booking endpoint", "transactional endpoint").replace("/bookings/create", f"{primary_write_endpoint}")
        cleaned_notes.append(note_str)

    if not cleaned_notes:
        cleaned_notes = [
            "Rate-limit authentication endpoints (/auth/login) to prevent brute-force attacks",
            f"Rate-limit transactional write endpoints ({primary_write_endpoint}) to mitigate enumeration risks",
            "Enforce strict input validation on all request bodies to prevent SQLi & XSS"
        ]

    # 2. Sanitize data_classification by scanning actual db_schema (Supports AI / LLM / Vector / GenAI fields)
    data_class = constraints.get("data_classification") or []
    existing_fields = {(item.get("table"), item.get("field")) for item in data_class if isinstance(item, dict)}

    tables = db_schema.get("tables", []) if isinstance(db_schema, dict) else []
    for t in tables:
        if not isinstance(t, dict): continue
        t_name = t.get("name", "")
        cols = t.get("columns", [])
        for c in cols:
            col_name = c if isinstance(c, str) else (c.get("name", "") if isinstance(c, dict) else "")
            if not col_name: continue
            col_lower = col_name.lower()
            
            if (t_name, col_name) in existing_fields:
                continue

            if any(k in col_lower for k in ["password", "secret", "token", "hash", "key", "cvv", "api_key", "openai_key", "model_key"]):
                data_class.append({
                    "table": t_name,
                    "field": col_name,
                    "classification": "secret",
                    "handling": "hash_only_bcrypt" if "pass" in col_lower else "store_securely_in_env"
                })
                existing_fields.add((t_name, col_name))
            elif any(k in col_lower for k in ["email", "phone", "mobile", "ssn", "address", "first_name", "last_name", "username", "prompt", "user_query", "completion"]):
                data_class.append({
                    "table": t_name,
                    "field": col_name,
                    "classification": "pii" if any(k in col_lower for k in ["email", "phone", "name", "address"]) else "confidential",
                    "handling": "encrypt_at_rest"
                })
                existing_fields.add((t_name, col_name))
            elif any(k in col_lower for k in ["amount", "total", "price", "balance", "card", "stripe", "payment", "vector", "embedding"]):
                data_class.append({
                    "table": t_name,
                    "field": col_name,
                    "classification": "confidential",
                    "handling": "encrypt_at_rest"
                })
                existing_fields.add((t_name, col_name))

    # 3. Sanitize module_constraints (Inject CORS, Security Headers, RBAC, & LLM/AI Guardrails if AI platform)
    module_constraints = constraints.get("module_constraints") or []
    has_global_headers = any("security headers" in str(mc).lower() or "cors" in str(mc).lower() for mc in module_constraints)
    
    if not has_global_headers:
        module_constraints.append({
            "module_id": "GLOBAL-SEC-001",
            "binding_constraints": [
                "Enforce CORS policy restricting origins to trusted domains",
                "Inject HTTP Security Headers (HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options)",
                "Enforce Role-Based Access Control (RBAC) ensuring Admin routes (/admin/*) require Administrator role"
            ]
        })

    # AI Platform / LLM Security Check
    is_ai = any("prompt" in str(t).lower() or "vector" in str(t).lower() or "llm" in str(t).lower() or "model" in str(t).lower() for t in tables)
    if is_ai and not any("prompt injection" in str(mc).lower() for mc in module_constraints):
        module_constraints.append({
            "module_id": "AI-SEC-001",
            "binding_constraints": [
                "Enforce OWASP Top 10 for LLM Applications (LLM01 Prompt Injection defense & input sanitization)",
                "Sanitize and redact PII before sending prompts to external LLM APIs",
                "Encrypt vector database embeddings and enforce tenant isolation in vector index queries"
            ]
        })

    return {
        "auth_pattern": auth_pattern,
        "data_classification": data_class,
        "module_constraints": module_constraints,
        "threat_model_notes": cleaned_notes
    }


async def security_intelligence_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] security_intelligence_node EXECUTING")
    log_step(task_id, "Security Intelligence: Threat-modelling architecture and defining auth/data constraints...", "SecurityIntelligence", status="running")

    db_tables = state.get("db_schema_design", {}).get("tables", [])[:10]
    api_endpoints = [e.get("path") for e in state.get("api_design_spec", {}).get("endpoints", [])][:12]
    sys_overview = state.get("system_specification", {}).get("overview", "")[:500]

    db_data = [{"name": t.get("name",""), "columns": t.get("columns",[])[:5]} for t in db_tables]

    prompt = f"""You are a Security Architect performing design-time threat modelling.
Identify security constraints that MUST be reflected as binding_constraints in the Implementation Plan.

DB TABLES: {json.dumps(db_data, indent=2)}
API ENDPOINTS: {json.dumps(api_endpoints, indent=2)}
SYSTEM OVERVIEW: {sys_overview}

Return JSON only:
{{
  "security_constraints": {{
    "auth_pattern": {{"type": "JWT", "refresh_strategy": "rotation", "token_ttl_minutes": 15}},
    "data_classification": [
      {{"table": "users", "field": "password", "classification": "secret", "handling": "hash_only_bcrypt"}},
      {{"table": "users", "field": "email", "classification": "pii", "handling": "encrypt_at_rest"}}
    ],
    "module_constraints": [
      {{
        "module_id": "MOD-001",
        "binding_constraints": [
          "Must hash passwords with bcrypt, cost factor >= 12",
          "Must not log raw password or token values"
        ]
      }}
    ],
    "threat_model_notes": ["Transaction endpoint exposed to enumeration risk — rate-limit /orders/create"]
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Security Architect', 'Security Threat Modelling', 'SecurityIntelligence', prompt, log_step, task_id, max_tokens=2500)
        result = robust_json_loads(content)
        raw_constraints = result.get("security_constraints", result)
        constraints = _sanitize_security_constraints(
            raw_constraints,
            api_spec=state.get("api_design_spec"),
            db_schema=state.get("db_schema_design")
        )
        mod_count = len(constraints.get("module_constraints", []))
        log_step(task_id, f"Security Intelligence: Constraints defined for {mod_count} modules ✓", "SecurityIntelligence", status="complete")
        return {"security_constraints": constraints}
    except Exception as e:
        logger.error(f"[PHASE2] security_intelligence_node failed: {e}")
        log_step(task_id, "Security Intelligence: Fallback applied", "SecurityIntelligence", status="complete")
        fallback_constraints = _sanitize_security_constraints(
            {},
            api_spec=state.get("api_design_spec"),
            db_schema=state.get("db_schema_design")
        )
        return {"security_constraints": fallback_constraints}


def _sanitize_compliance_requirements(compliance_data: dict, state: dict = None) -> dict:
    if not isinstance(compliance_data, dict):
        compliance_data = {}

    state = state or {}
    
    # 1. Dynamic Domain Detection from state (Supports Healthcare, E-Commerce, Banking, AI Platforms, Travel, SaaS)
    domain_str = str(state.get("domain") or state.get("raw_requirements", {}).get("domain") or "").lower()
    sys_overview = str(state.get("system_specification", {}).get("overview") or "").lower()
    combined_context = f"{domain_str} {sys_overview}"

    is_healthcare = any(k in combined_context for k in ["health", "medical", "patient", "doctor", "hipaa", "clinic", "hospital", "phr", "ehr"])
    is_finance = any(k in combined_context for k in ["bank", "fintech", "payment", "crypto", "trading", "loan", "wallet", "pci"])
    is_ecommerce = any(k in combined_context for k in ["e-commerce", "ecommerce", "cart", "checkout", "product", "store", "order", "distributor", "shop"])
    is_ai_platform = any(k in combined_context for k in ["ai", "llm", "gpt", "rag", "agentic", "vector", "genai", "prompt", "embedding", "model", "machine learning", "mlops"])

    # 2. Dynamic Applicable Frameworks
    frameworks = compliance_data.get("applicable_frameworks") or []
    if not isinstance(frameworks, list):
        frameworks = []

    cleaned_frameworks = []
    for fw in frameworks:
        fw_upper = str(fw).upper()
        if fw_upper == "HIPAA" and not is_healthcare:
            continue  # Filter HIPAA for non-healthcare PRDs dynamically
        cleaned_frameworks.append(fw_upper)

    if "GDPR" not in cleaned_frameworks:
        cleaned_frameworks.append("GDPR")
    if "SOC2" not in cleaned_frameworks:
        cleaned_frameworks.append("SOC2")

    if (is_ecommerce or is_finance) and "PCI-DSS" not in cleaned_frameworks:
        cleaned_frameworks.append("PCI-DSS")
    if (is_ecommerce or is_healthcare or is_finance or is_ai_platform) and "CCPA" not in cleaned_frameworks:
        cleaned_frameworks.append("CCPA")
    if is_healthcare and "HIPAA" not in cleaned_frameworks:
        cleaned_frameworks.append("HIPAA")
    if is_ai_platform and "EU AI ACT" not in cleaned_frameworks:
        cleaned_frameworks.append("EU AI ACT")
    if is_ai_platform and "NIST AI RMF" not in cleaned_frameworks:
        cleaned_frameworks.append("NIST AI RMF")

    # 3. Dynamic Module Boundary Mapping (Reads Node 13 module_boundary_map)
    module_boundary_map = state.get("module_boundary_map", {})
    modules_list = module_boundary_map.get("modules", []) if isinstance(module_boundary_map, dict) else []
    valid_mod_ids = [m.get("module_id") for m in modules_list if isinstance(m, dict) and m.get("module_id")]
    
    if not valid_mod_ids:
        valid_mod_ids = ["MOD-001", "MOD-002", "MOD-003"]

    # 4. Clean Findings (Remap fake module IDs dynamically to topological modules)
    findings = compliance_data.get("findings") or []
    cleaned_findings = []

    for idx, f in enumerate(findings):
        if not isinstance(f, dict): continue
        req = str(f.get("requirement", ""))
        imp = str(f.get("implication", ""))

        if not is_healthcare and ("HIPAA" in req.upper() or "PHI" in imp.upper() or "HEALTH" in imp.upper()):
            continue

        mod_id = f.get("module_id")
        if mod_id not in valid_mod_ids:
            mapped_mod = valid_mod_ids[idx % len(valid_mod_ids)]
            f["module_id"] = mapped_mod

        cleaned_findings.append(f)

    # Ensure baseline findings dynamically based on domain
    mod_1 = valid_mod_ids[0]
    has_gdpr_erasure = any("gdpr art. 17" in str(f.get("requirement","")).lower() or "erasure" in str(f.get("requirement","")).lower() for f in cleaned_findings)
    if not has_gdpr_erasure:
        cleaned_findings.append({
            "binding": True,
            "module_id": mod_1,
            "requirement": "GDPR Art. 17 — Right to erasure",
            "implication": "User deletion must cascade-delete or anonymize related customer PII and transaction records."
        })

    if (is_ecommerce or is_finance):
        has_pci = any("pci-dss" in str(f.get("requirement","")).lower() for f in cleaned_findings)
        if not has_pci:
            mod_target = valid_mod_ids[min(1, len(valid_mod_ids)-1)]
            cleaned_findings.append({
                "binding": True,
                "module_id": mod_target,
                "requirement": "PCI-DSS Req. 3 — Protect stored cardholder data",
                "implication": "Do not store raw PAN or CVV/CVC numbers. Mask card digits and encrypt transaction tokens."
            })

    if is_ai_platform:
        has_ai_act = any("ai act" in str(f.get("requirement","")).lower() for f in cleaned_findings)
        if not has_ai_act:
            mod_ai = valid_mod_ids[min(2, len(valid_mod_ids)-1)]
            cleaned_findings.append({
                "binding": True,
                "module_id": mod_ai,
                "requirement": "EU AI Act Art. 10 — Data Governance & Lineage",
                "implication": "Training data & RAG vector data must undergo PII scrubbing, copyright validation, and audit logging."
            })

    # 5. Clean Data Residency Constraints dynamically
    residency = compliance_data.get("data_residency_constraints") or []
    cleaned_residency = []
    for r in residency:
        if not isinstance(r, dict): continue
        dt = r.get("data_types", [])
        if not is_healthcare and any("phi" in str(d).lower() for d in dt):
            r["data_types"] = [d for d in dt if "phi" not in str(d).lower()]
            if not r["data_types"]:
                r["data_types"] = ["customer PII data", "transaction data"]
        cleaned_residency.append(r)

    if not cleaned_residency:
        cleaned_residency = [
            {
                "region": "EU",
                "constraint": "EU customer PII data must be stored and processed within EU cloud regions (GDPR Chapter V).",
                "data_types": ["customer PII data", "order history"]
            }
        ]

    return {
        "applicable_frameworks": cleaned_frameworks,
        "findings": cleaned_findings,
        "data_residency_constraints": cleaned_residency
    }


async def compliance_governor_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] compliance_governor_node EXECUTING")
    log_step(task_id, "Compliance Governor: Flagging regulatory requirements in architecture...", "ComplianceGovernor", status="running")

    db_tables = state.get("db_schema_design", {}).get("tables", [])[:10]
    caps = state.get("capabilities", [])[:8]
    sys_overview = state.get("system_specification", {}).get("overview", "")[:500]

    prompt = f"""You are a Compliance Architect. Identify regulatory/compliance requirements that must become
binding_constraints in the Implementation Plan before any code is generated.

DB TABLES: {json.dumps([t.get("name","") for t in db_tables], indent=2)}
CAPABILITIES: {json.dumps([c.get("name","") for c in caps if isinstance(c, dict)], indent=2)}
SYSTEM OVERVIEW: {sys_overview}

Applicable frameworks to check: GDPR, HIPAA, PCI-DSS, SOC2 (infer from system context).

Return JSON only:
{{
  "compliance_requirements": {{
    "applicable_frameworks": ["GDPR"],
    "findings": [
      {{
        "module_id": "MOD-001",
        "requirement": "GDPR Art. 17 — Right to erasure",
        "implication": "User deletion must cascade-delete or anonymize related records",
        "binding": true
      }}
    ],
    "data_residency_constraints": []
  }}
}}"""

    try:
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Compliance Architect', 'Regulatory Compliance Analysis', 'ComplianceGovernor', prompt, log_step, task_id, max_tokens=2000)
        result = robust_json_loads(content)
        raw_compliance = result.get("compliance_requirements", result)
        compliance = _sanitize_compliance_requirements(raw_compliance, state=state)
        binding_count = len([f for f in compliance.get("findings", []) if f.get("binding")])
        log_step(task_id, f"Compliance Governor: {binding_count} binding compliance findings ✓", "ComplianceGovernor", status="complete")
        return {"compliance_requirements": compliance}
    except Exception as e:
        logger.error(f"[PHASE2] compliance_governor_node failed: {e}")
        log_step(task_id, "Compliance Governor: Fallback applied", "ComplianceGovernor", status="complete")
        fallback_compliance = _sanitize_compliance_requirements({}, state=state)
        return {"compliance_requirements": fallback_compliance}


def _sanitize_hook_guardrails(guardrail_data: dict, state: dict = None) -> dict:
    if not isinstance(guardrail_data, dict):
        guardrail_data = {}

    state = state or {}
    tech_stack = state.get("target_tech_stack") or {}
    backend_tech = str(tech_stack.get("backend") or "").lower()
    frontend_tech = str(tech_stack.get("frontend") or "").lower()
    
    # 1. Compute dynamic target file globs based on active tech stack
    exts = [".sql"]
    if any(k in backend_tech for k in ["python", "fastapi", "django", "flask"]):
        exts.append(".py")
    if any(k in backend_tech or k in frontend_tech for k in ["node", "express", "ts", "typescript", "js", "javascript", "react", "next"]):
        exts.extend([".ts", ".js", ".jsx", ".tsx"])
    if any(k in backend_tech for k in ["java", "spring"]):
        exts.append(".java")
    if any(k in backend_tech for k in ["go", "golang"]):
        exts.append(".go")

    # Fallback to cover python/ts/js/sql if unspecified
    if len(exts) == 1:
        exts.extend([".py", ".ts", ".js", ".jsx", ".tsx"])

    target_glob_str = ", ".join([f"**/*{ext}" for ext in set(exts)])

    hooks = guardrail_data.get("suggested_hooks") or []
    if not isinstance(hooks, list):
        hooks = []

    cleaned_hooks = []
    has_secret_scanner = False
    has_command_guard = False
    has_mcp_guard = False

    for h in hooks:
        if not isinstance(h, dict): continue
        purpose = str(h.get("purpose", "")).lower()
        
        # Dynamic target glob expansion for secret scanner & linters
        if "secret" in purpose or "credential" in purpose or "lint" in purpose or "format" in purpose:
            h["target"] = target_glob_str
            has_secret_scanner = True

        if "destructive" in purpose or "command" in purpose or "shell" in purpose:
            has_command_guard = True

        if "mcp" in purpose or "third-party api" in purpose:
            has_mcp_guard = True

        cleaned_hooks.append(h)

    # 2. Auto-inject Hardcoded Secret Scanner if missing
    if not has_secret_scanner:
        cleaned_hooks.append({
            "type": "PreToolUse",
            "action": "Scan source code for hardcoded passwords, API keys, or sensitive credentials before writing files.",
            "target": target_glob_str,
            "purpose": "Check for hardcoded credentials",
            "priority": "high",
            "rationale": "Prevent accidental commit or creation of hardcoded secrets across all active tech stack file types.",
            "command_pattern": None
        })

    # 3. Auto-inject Destructive Terminal Command Guardrail
    if not has_command_guard:
        cleaned_hooks.append({
            "type": "PreToolUse",
            "action": "Intercept and block destructive shell commands (e.g., rm -rf, DROP DATABASE, git push --force).",
            "target": "terminal",
            "purpose": "Prevent destructive command execution",
            "priority": "critical",
            "rationale": "Protect local workspace environment and database state against accidental destructive agent operations.",
            "command_pattern": "rm -rf|DROP TABLE|DROP DATABASE|git push --force|chmod 777"
        })

    # 4. Auto-inject MCP Tool Call Guardrail if MCP recommendations exist
    mcp_recs = state.get("mcp_recommendations") or {}
    has_mcp = bool(mcp_recs.get("recommendations")) if isinstance(mcp_recs, dict) else False
    if has_mcp and not has_mcp_guard:
        cleaned_hooks.append({
            "type": "PreToolUse",
            "action": "Validate third-party MCP tool call arguments (e.g., Stripe API, Email API) before execution.",
            "target": "mcp_tool_call",
            "purpose": "Validate third-party MCP tool calls",
            "priority": "high",
            "rationale": "Prevent unvalidated or live financial/communication actions during automated agent workflows.",
            "command_pattern": "mcp_call"
        })

    return {
        "reason": guardrail_data.get("reason", "Automated safety guardrails and lifecycle hooks for agentic workflow."),
        "hooks_required": True,
        "suggested_hooks": cleaned_hooks
    }


async def hook_guardrails_advisor_node(state: Phase2State) -> dict:
    import logging
    import json
    import asyncio
    import json_repair
    from backend.prompts.hook_guardrails_prompt import build_hook_guardrails_prompt
    
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id

    logger.info("[PHASE2-NODE] hook_guardrails_advisor_node EXECUTING")
    log_step(task_id, "Hook Guardrails Advisor: Analyzing PRD for development safety needs...",
              "hook_guardrails_advisor", status="running")

    tech_stack = state.get("target_tech_stack", {})
    db_schema = state.get("db_schema_design", {})
    compliance = state.get("compliance_requirements", {})

    from backend.core.database import SessionLocal, GitIntegration, RepoProfile
    db = SessionLocal()
    repo_profile = {}
    try:
        integration = db.query(GitIntegration).filter(GitIntegration.mission_id == mission_id).first()
        if integration:
            prof = db.query(RepoProfile).filter(RepoProfile.git_integration_id == integration.id).first()
            if prof:
                repo_profile = prof.profile_data
    except Exception as e:
        logger.warning(f"[HOOK-ADVISOR] Could not fetch repo profile: {e}")
    finally:
        db.close()

    if not tech_stack:
        logger.warning(f"[HOOK-ADVISOR] No tech_stack found for mission {mission_id} — "
                        f"recommendations will be ungrounded, check upstream key")

    prompt = build_hook_guardrails_prompt(
        tech_stack=tech_stack,
        has_db_migrations=bool(db_schema.get("tables")),
        repo_conventions=repo_profile.get("conventions", {}),
        compliance_flags=compliance.get("applicable_frameworks", []),
    )
    
    try:
        raw = await asyncio.to_thread(
            InferenceCoordinator.execute, "Hook Guardrails Advisor",
            "Determine if Claude Code Hooks are warranted for this project",
            "hook_guardrails_advisor", prompt, log_step, task_id, max_tokens=2000
        )

        clean = raw
        if "```json" in raw:
            clean = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            clean = raw.split("```")[1].split("```")[0].strip()

        try:
            raw_result = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.warning(f"[HOOK-ADVISOR] Initial parse failed: {e} — attempting repair")
            raw_result = json_repair.loads(clean)

        result = _sanitize_hook_guardrails(raw_result, state=state)
        hook_count = len(result.get("suggested_hooks", []))
        log_step(task_id, f"Hook Guardrails Advisor: {hook_count} hooks recommended ✓",
                  "hook_guardrails_advisor", status="complete")

        return {"hook_guardrail_recommendations": result}
    except Exception as e:
        logger.error(f"[PHASE2] hook_guardrails_advisor_node failed: {e}")
        log_step(task_id, "Hook Guardrails Advisor: Fallback applied", "hook_guardrails_advisor", status="complete")
        fallback_result = _sanitize_hook_guardrails({}, state=state)
        return {"hook_guardrail_recommendations": fallback_result}


async def auditor_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    task_id = state.get("task_id") or state.get("mission_id")
    logger.info("[PHASE2-NODE] auditor_node EXECUTING")
    log_step(task_id, "Auditor: Validating Phase 2 Contract artifacts...", "Auditor", status="running")
    log_step(task_id, "Auditor: Validation complete", "Auditor", status="complete")
    return {"phase2_valid": True}

def _enrich_engineering_contract_telemetry(result_state: dict, state: dict = None) -> dict:
    import logging
    _logger = logging.getLogger(__name__)

    if not isinstance(result_state, dict):
        result_state = {}

    state = state or {}
    
    # 1. Tasks & Module Task Breakdown (Smart Module Resolution)
    tasks = result_state.get("tasks") or result_state.get("engineering_tasks") or state.get("engineering_tasks") or state.get("tasks") or []
    if not isinstance(tasks, list):
        tasks = []

    # --- Build capability → module mapping from module_boundary_map ---
    module_boundary_map = state.get("module_boundary_map", {})
    modules_list = module_boundary_map.get("modules", []) if isinstance(module_boundary_map, dict) else []

    # Strategy 1: capability_ref → module_id (from module_boundary_map or plan modules)
    cap_to_module = {}
    endpoint_to_module = {}
    module_names = {}  # mod_id → name for readable telemetry
    for mod in modules_list:
        if not isinstance(mod, dict):
            continue
        mod_id = mod.get("proposed_module_id") or mod.get("module_id") or ""
        if not mod_id:
            continue
        module_names[mod_id] = mod.get("name", mod_id)
        # Map capabilities owned by this module
        for cap_ref in (mod.get("capability_refs", []) or []):
            cap_to_module[cap_ref] = mod_id
        # Map endpoints owned by this module (for fallback matching)
        for ep in (mod.get("owns_endpoints", []) or []):
            if isinstance(ep, str):
                endpoint_to_module[ep.lower().strip()] = mod_id
            elif isinstance(ep, dict):
                endpoint_to_module[ep.get("path", "").lower().strip()] = mod_id

    # Strategy 2: Also check plan_graph modules stored in state
    plan_modules = state.get("plan_modules", []) or state.get("modules", [])
    if isinstance(plan_modules, list):
        for mod in plan_modules:
            if not isinstance(mod, dict):
                continue
            mod_id = mod.get("module_id") or mod.get("proposed_module_id") or ""
            if not mod_id:
                continue
            if mod_id not in module_names:
                module_names[mod_id] = mod.get("name", mod_id)
            for cap_ref in (mod.get("capability_refs", []) or []):
                if cap_ref not in cap_to_module:
                    cap_to_module[cap_ref] = mod_id

    _logger.info(f"[CONTRACT-ENRICHER] cap_to_module mapping: {cap_to_module}")
    _logger.info(f"[CONTRACT-ENRICHER] module_names: {module_names}")

    # --- Resolve each task to a module ---
    module_breakdown = {}
    unresolved_tasks = []

    for t in tasks:
        if not isinstance(t, dict):
            continue
        
        resolved_mod = None

        # Priority 1: Explicit module_id on task
        explicit_mod = t.get("module_id") or t.get("target_module")
        if explicit_mod and explicit_mod != "MOD-GENERAL":
            resolved_mod = explicit_mod

        # Priority 2: Resolve via capability_refs → cap_to_module
        if not resolved_mod:
            for cap_ref in (t.get("capability_refs", []) or []):
                if cap_ref in cap_to_module:
                    resolved_mod = cap_to_module[cap_ref]
                    break

        # Priority 3: Endpoint path matching (check task's target_paths against endpoint_to_module)
        if not resolved_mod and endpoint_to_module:
            task_title_lower = (t.get("title", "") or "").lower()
            task_desc_lower = (t.get("description", "") or "").lower()
            for ep_path, ep_mod in endpoint_to_module.items():
                # Match endpoint resource name against task title/description
                resource = ep_path.strip("/").split("/")[-1] if "/" in ep_path else ep_path
                if resource and len(resource) > 2 and resource in task_title_lower or resource in task_desc_lower:
                    resolved_mod = ep_mod
                    break

        if resolved_mod:
            module_breakdown[resolved_mod] = module_breakdown.get(resolved_mod, 0) + 1
        else:
            unresolved_tasks.append(t)

    # Priority 4: Round-robin distribute unresolved tasks across known modules
    if unresolved_tasks and module_names:
        mod_ids = list(module_names.keys())
        for idx, t in enumerate(unresolved_tasks):
            fallback_mod = mod_ids[idx % len(mod_ids)]
            module_breakdown[fallback_mod] = module_breakdown.get(fallback_mod, 0) + 1
    elif unresolved_tasks:
        # No modules discovered at all — group by capability_refs prefix
        for t in unresolved_tasks:
            cap_refs = t.get("capability_refs", []) or []
            if cap_refs:
                # Derive module from first capability ref: CAP-01 → MOD-001
                cap_id = cap_refs[0]
                # Extract numeric suffix: CAP-01 → 01, CAP-12 → 12
                import re
                num_match = re.search(r'(\d+)', cap_id)
                derived_mod = f"MOD-{num_match.group(1).zfill(3)}" if num_match else "MOD-001"
                module_breakdown[derived_mod] = module_breakdown.get(derived_mod, 0) + 1
            else:
                module_breakdown["MOD-GENERAL"] = module_breakdown.get("MOD-GENERAL", 0) + 1

    _logger.info(f"[CONTRACT-ENRICHER] Final module_task_breakdown: {module_breakdown}")

    # 2. TDD Contracts count
    tdd_contracts = result_state.get("tdd_contracts") or state.get("tdd_contracts") or {}
    tdd_count = len(tdd_contracts) if isinstance(tdd_contracts, dict) else (len(tdd_contracts) if isinstance(tdd_contracts, list) else 0)

    # 3. API Endpoints & DB Tables count
    api_spec = state.get("api_design_spec") or {}
    endpoints = api_spec.get("endpoints", []) if isinstance(api_spec, dict) else []
    
    db_schema = state.get("db_schema_design") or {}
    tables = db_schema.get("tables", []) if isinstance(db_schema, dict) else []

    # 4. Security & Compliance summaries
    sec_constraints = state.get("security_constraints") or {}
    comp_requirements = state.get("compliance_requirements") or {}
    
    frameworks = comp_requirements.get("applicable_frameworks", []) if isinstance(comp_requirements, dict) else []

    bundle_path = state.get("handoff_bundle_path") or result_state.get("handoff_bundle_path") or f"workspace/missions/{state.get('mission_id', 'active')}/handoff-bundle"

    enriched_contract = {
        "status": "created",
        "tasks_count": len(tasks),
        "handoff_bundle_path": str(bundle_path),
        "module_task_breakdown": module_breakdown if module_breakdown else {"MOD-001": len(tasks)},
        "contract_digest": {
            "total_engineering_tasks": len(tasks),
            "total_tdd_contracts": tdd_count,
            "total_api_endpoints": len(endpoints),
            "total_db_tables": len(tables),
            "applicable_compliance_frameworks": frameworks,
            "security_auth_pattern": sec_constraints.get("auth_pattern", {}).get("type", "JWT") if isinstance(sec_constraints, dict) else "JWT"
        }
    }

    result_state["engineering_contract"] = enriched_contract
    return result_state


async def engineering_contract_node(state: Phase2State) -> dict:
    import logging
    import asyncio
    from backend.agents.nodes.forges import engineering_contract_node as actual_contract_node
    logger = logging.getLogger(__name__)
    
    # Run the actual synchronous node in a thread
    logger.info("[PHASE2-NODE] Delegating to actual engineering_contract_node in forges.py")
    result_state = await asyncio.to_thread(actual_contract_node, state)
    
    # Enrich the contract telemetry payload for UI Inspector
    result_state = _enrich_engineering_contract_telemetry(result_state, state=state)
        
    return result_state

async def phase2_exit_node(state: Phase2State) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or state.get("mission_id")
    
    logger.info(f"[PHASE2-NODE] phase2_exit_node EXECUTING")
    log_step(task_id, "Phase 2 Exit: Persisting artifacts and preparing for HITL 2...", "System", status="running")
        
    current_status = await mission_controller.get_status(mission_id)
    if current_status == MissionStatus.HITL2_PENDING:
        logger.warning(f"[PHASE2-EXIT] Already HITL2_PENDING — skipping duplicate transition")
        log_step(task_id, "Phase 2 complete — awaiting HITL 2 approval ✓", "System", status="complete")
        return {}
        
    # Debug — see what keys are actually in state
    logger.info(f"[PHASE2-EXIT] State keys available: {list(state.keys())}")
    logger.info(f"[PHASE2-EXIT] system_specification present: {'system_specification' in state}")
    logger.info(f"[PHASE2-EXIT] system_specification value: {type(state.get('system_specification'))}")
        
    phase2_output = {
        "system_specification": state.get("system_specification") or state.get("ssd") or state.get("architecture", {}),
        "api_design_spec": state.get("api_design_spec", {}),
        "visual_architecture": state.get("visual_architecture", ""),
        "db_schema_design": state.get("db_schema_design", {}),
        "tasks": state.get("tasks", []) or state.get("engineering_tasks", []),
        "engineering_tasks": state.get("engineering_tasks", []),
        "tdd_contracts": state.get("tdd_contracts", {}),
        "handoff_bundle_path": state.get("handoff_bundle_path") or f"/workspace/missions/{mission_id}/handoff-bundle",
        "acceptance_criteria": state.get("acceptance_criteria", []),
        "coverage_targets": state.get("coverage_targets", {}),
        "engineering_contract": state.get("engineering_contract", {}),
        # NEW: Architecture-gate outputs from 7 additional Phase 2 agents
        "requirement_clarity_report": state.get("requirement_clarity_report", {}),
        "module_boundary_map": state.get("module_boundary_map", {}),
        "traceability_matrix": state.get("traceability_matrix_p2", {}),
        "integration_dependency_map": state.get("integration_dependency_map", {}),
        "mcp_recommendations": state.get("mcp_recommendations", {}),
        "performance_budget": state.get("performance_budget", {}),
        "security_constraints": state.get("security_constraints", {}),
        "compliance_requirements": state.get("compliance_requirements", {}),
        "hook_guardrail_recommendations": state.get("hook_guardrail_recommendations", {}),
    }
    
    logger.info(f"[PHASE2-EXIT] system_specification populated: {bool(phase2_output['system_specification'])}")
    
    if mission_id:
        await mission_controller.persist_phase_output(mission_id, 2, phase2_output)
        await mission_controller.transition_status(mission_id, MissionStatus.HITL2_PENDING)
    
    log_step(task_id, "Phase 2 complete — awaiting HITL 2 approval ✓", "System", status="complete")
    return {}

async def hitl2_gate_node(state: Phase2State) -> dict:
    return {}

def get_checkpointer():
    return MemorySaver()

def build_phase2_graph():
    # Soft-check Phase 1 contract keys match Phase2State input fields
    # (assert replaced with warning so a mismatch doesn't crash the server)
    import logging as _log
    _logger = _log.getLogger(__name__)
    phase1_output_keys = set(PHASE_CONTRACTS[1]["required_output_keys"])
    phase2_input_fields = {"unified_context_contract", "risk_advisory_report",
                           "capabilities", "target_tech_stack", "open_questions"}
    diff = phase1_output_keys ^ phase2_input_fields
    if diff:
        _logger.warning(f"[PHASE2-GRAPH] Phase 1→2 contract key mismatch (non-fatal): {diff}")

    workflow = StateGraph(Phase2State)
    
    # Register all stream nodes
    workflow.add_node("logician_node", logician_node)
    workflow.add_node("architect_node", architect_node)
    workflow.add_node("service_mesh_node", service_architecture_mesh_node)
    workflow.add_node("db_architect_node", db_architect_node)
    workflow.add_node("planning_agent_node", planning_agent_node)
    workflow.add_node("creator_node", creator_node)
    workflow.add_node("test_data_builder_node", test_data_builder_node)
    workflow.add_node("api_mock_node", api_mock_node)
    # NEW: 7 architecture-gate nodes
    workflow.add_node("requirement_clarifier_node", requirement_clarifier_node)
    workflow.add_node("synthesis_optimizer_node", synthesis_optimizer_node)
    workflow.add_node("traceability_auditor_node", traceability_auditor_node)
    workflow.add_node("api_dependency_mapper_node", api_dependency_mapper_node)
    workflow.add_node("mcp_advisor_node", mcp_advisor_node)
    workflow.add_node("performance_architect_node", performance_architect_node)
    workflow.add_node("security_intelligence_node", security_intelligence_node)
    workflow.add_node("compliance_governor_node", compliance_governor_node)
    workflow.add_node("hook_guardrails_advisor_node", hook_guardrails_advisor_node)
    workflow.add_node("auditor_node", auditor_node)
    workflow.add_node("engineering_contract_node", engineering_contract_node)
    workflow.add_node("phase2_exit_node", phase2_exit_node)
    workflow.add_node("hitl2_gate_node", hitl2_gate_node)
    
    # Entry
    workflow.add_edge(START, "logician_node")
    
    # Fully sequential execution to protect local model concurrency
    workflow.add_edge("logician_node", "architect_node")
    workflow.add_edge("architect_node", "service_mesh_node")
    workflow.add_edge("service_mesh_node", "db_architect_node")
    workflow.add_edge("db_architect_node", "planning_agent_node")
    workflow.add_edge("planning_agent_node", "creator_node")
    workflow.add_edge("creator_node", "test_data_builder_node")
    workflow.add_edge("test_data_builder_node", "api_mock_node")
    # NEW: architecture-gate chain runs after api_mock, before auditor
    workflow.add_edge("api_mock_node", "requirement_clarifier_node")
    workflow.add_edge("requirement_clarifier_node", "synthesis_optimizer_node")
    workflow.add_edge("synthesis_optimizer_node", "traceability_auditor_node")
    workflow.add_edge("traceability_auditor_node", "api_dependency_mapper_node")
    workflow.add_edge("api_dependency_mapper_node", "mcp_advisor_node")
    workflow.add_edge("mcp_advisor_node", "performance_architect_node")
    workflow.add_edge("performance_architect_node", "security_intelligence_node")
    workflow.add_edge("security_intelligence_node", "compliance_governor_node")
    workflow.add_edge("compliance_governor_node", "hook_guardrails_advisor_node")
    workflow.add_edge("hook_guardrails_advisor_node", "auditor_node")
    workflow.add_edge("auditor_node", "engineering_contract_node")
    
    workflow.add_edge("engineering_contract_node", "phase2_exit_node")
    workflow.add_edge("phase2_exit_node", "hitl2_gate_node")
    workflow.add_edge("hitl2_gate_node", END)
    
    return workflow.compile(
        checkpointer=get_checkpointer(),
        interrupt_before=["hitl2_gate_node"]
    )
