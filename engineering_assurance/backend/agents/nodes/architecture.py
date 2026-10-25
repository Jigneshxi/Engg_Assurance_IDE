import os
import json
import logging
from backend.agents.state import AgentState, log_step

logger = logging.getLogger(__name__)
from backend.core.inference import InferenceCoordinator

def robust_json_loads(text: str) -> dict:
    try:
        import re
        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return json.loads(text)
    except Exception:
        return {}

def architect_node(state: AgentState):
    """
    AGENT: The Architect
    ROLE: Outputs pure Mermaid.js syntax for C4 System Context diagrams.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Architect: Designing C4 System Context (Mermaid)...', 'Architect')
    
    logger.info(f"[CTX] architect_node received capabilities: {'capabilities' in state}, count: {len(state.get('capabilities', []))}")
    logger.info(f"[CTX] architect_node unified_context_contract present: {'unified_context_contract' in state}")
    
    combined = state.get('combined_data', {})
    raw_reqs = state.get('raw_requirements', [])
    raw0 = raw_reqs[0] if raw_reqs and isinstance(raw_reqs[0], dict) else {}

    # Build a focused context (under 600 chars) instead of dumping entire combined_data
    project = raw0.get('project') or combined.get('summary', 'System')
    core_roles = raw0.get('core_roles') or raw0.get('personas', [])
    integrations = raw0.get('integrations', [])
    capabilities = combined.get('capabilities', [])
    # Extract top capability names as "core systems"
    core_systems = [c.get('name', '') for c in capabilities[:6] if isinstance(c, dict) and c.get('name')]
    if not core_systems:
        core_systems = combined.get('modules', [])[:6]
    
    risk_report = state.get("risk_advisory_report", {})
    all_advisories = []
    for key in ["security_advisories", "compliance_advisories", "accessibility_advisories"]:
        all_advisories.extend(risk_report.get(key, []))
        
    # In a real scenario, we'd look for a 'binding' boolean, but to be robust we'll just check any advisory
    # Let's say all critical/high advisories are inherently binding, or they have a 'binding' flag.
    # The user asked to check for a['binding'], so let's check that, or default to True for CRITICAL.
    binding_ids = [a.get('id', f"ADV-{abs(hash(str(a)))}") for a in all_advisories if a.get('binding', a.get('risk_tier') in ['STOP', 'CRITICAL', 'HIGH'])]
    
    focused_context = f"""Project: {project}
User Personas: {', '.join(str(r) for r in core_roles[:5])}
Core Systems/Capabilities: {', '.join(str(s) for s in core_systems[:6])}
External Integrations: {', '.join(str(i) for i in integrations[:8])}
Binding Risk Advisories (Must be explicitly acknowledged): {', '.join(binding_ids) if binding_ids else 'None'}"""
    
    prompt = f"""You are an Enterprise Software Architect. Generate a System Specification Document (SSD) including a C4 System Context diagram.

SYSTEM CONTEXT:
{focused_context}

RULES:
1. Output ONLY a JSON object with key "system_specification".
2. The "system_specification" MUST contain "c4_architecture" (object with "mermaid_syntax" and "bounded_contexts") AND "acknowledged_advisories" (array of strings).
3. You MUST include ALL Binding Risk Advisories in the "acknowledged_advisories" array.
4. mermaid_syntax MUST start with "C4Context" and use Person(), System(), System_Ext(), Rel() macros.
5. Use REAL names from the context. Include all external integrations as System_Ext() entries. Escape newlines as \\n.

Example format:
{{
  "system_specification": {{
    "c4_architecture": {{
      "mermaid_syntax": "C4Context\\n  title...",
      "bounded_contexts": ["Core"]
    }},
    "acknowledged_advisories": ["ADV-123"]
  }}
}}"""
    try:
        content = InferenceCoordinator.execute('Enterprise Software Architect', 'C4 Diagram Design', 'Architect', prompt, log_step, task_id)
        
        result = robust_json_loads(content)
        system_spec = result.get('system_specification', {})
        if not system_spec and 'c4_architecture' in result:
            system_spec = {"c4_architecture": result.get('c4_architecture'), "acknowledged_advisories": result.get('acknowledged_advisories', [])}
            
        c4_arch = system_spec.get('c4_architecture', {})
        if not c4_arch:
            mermaid_content = result.get('mermaid_syntax', result.get('mermaid', ''))
            c4_arch = {"mermaid_syntax": mermaid_content, "bounded_contexts": []}
            system_spec["c4_architecture"] = c4_arch
            
        if not c4_arch.get('mermaid_syntax'):
            c4_arch['mermaid_syntax'] = "graph TD\n  Error[Failed to extract mermaid from JSON]"
            
        # Sprint 3: Binding Advisory Assertion
        spec_dump = json.dumps(system_spec)
        for adv_id in binding_ids:
            assert adv_id in spec_dump, f"Binding advisory {adv_id} missing from SSD"
                
        log_step(task_id, 'Architect: SSD and Mermaid diagram generated & verified.', 'Architect')
        
        # Pydantic validation
        from backend.agents.contracts import ArchitectContract
        validated_arch = ArchitectContract(
            visual_architecture=c4_arch.get('mermaid_syntax', c4_arch.get('mermaid', 'graph TD\n  Error[No syntax extracted]')),
            bounded_contexts=c4_arch.get('bounded_contexts', [])
        )
        return {
            "visual_architecture": validated_arch.visual_architecture,
            "system_specification": system_spec
        }
    except Exception as e:
        log_step(task_id, f'Architect failed ({e}).', 'Architect', level='ERROR')
        # Build deterministic fallback
        roles_str = '\n  '.join(f'Person({r.lower().replace(" ","_").replace("/","_")}, "{r}", "System user")' for r in (core_roles[:3] if core_roles else ['user']))
        ext_systems = '\n  '.join(f'System_Ext({i.lower().replace(" ","_").replace("(","").replace(")","")}, "{i}", "External system")' for i in integrations[:4]) if integrations else ''
        fallback_mermaid = f"C4Context\n  title {project} System Context\n  {roles_str}\n  System(core, \"{project} Core\", \"Main application\")\n  {ext_systems}"
        
        fallback_spec = {
            "c4_architecture": {"mermaid_syntax": fallback_mermaid, "bounded_contexts": []},
            "acknowledged_advisories": binding_ids
        }
        return {
            "visual_architecture": fallback_mermaid,
            "system_specification": fallback_spec
        }

def service_architecture_mesh_node(state: AgentState):
    """
    AGENT: Service Architecture Mesh (Consolidated API Designer)
    ROLE: Resolves OpenAPI vs GraphQL path based on the PRD, outputs valid specs.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'Service Architecture Mesh: Designing microservice contracts...', 'ServiceMesh')
    
    logger.info(f"[CTX] service_architecture_mesh_node received capabilities: {'capabilities' in state}, count: {len(state.get('capabilities', []))}")
    logger.info(f"[CTX] service_architecture_mesh_node unified_context_contract present: {'unified_context_contract' in state}")
    
    caps = state.get('capabilities', [])
    if not caps:
        caps = state.get('combined_data', {}).get('capabilities', [])
        
    API_KEYWORDS = {'endpoint', 'api', 'request', 'response', 'auth', 
                    'login', 'search', 'booking', 'payment', 'notification',
                    'qr', 'order', 'checkout', 'user', 'session'}
    
    api_relevant_caps = [
        c for c in caps
        if any(kw in str(c.get('description', '')).lower() or 
               kw in str(c.get('name', '')).lower()
               for kw in API_KEYWORDS)
    ][:15]
    
    minified_api_caps = [
        {"name": c.get("name"), "features": c.get("features", []), "workflows": c.get("workflows", [])}
        for c in api_relevant_caps
    ]
    
    prompt_context_dict = {
        "project": state.get('project', state.get('combined_data', {}).get('summary', '')),
        "core_roles": state.get('core_roles', state.get('combined_data', {}).get('personas', [])),
        "tech_stack": state.get('target_tech_stack', state.get('combined_data', {}).get('target_tech_stack', {})),
        "api_relevant_capabilities": minified_api_caps,
        "security_constraints": [
            a for a in state.get('risk_advisory_report', {}).get('advisories', [])
            if a.get('category') == 'security' and a.get('binding')
        ]
    }
    
    system_context = json.dumps(prompt_context_dict, indent=2)
    # Simple routing heuristic
    is_graphql = "graphql" in str(system_context).lower()
    
    if is_graphql:
        prompt = f"""
        ROLE: Principal API Designer
        TASK: Design a GraphQL API schema that strictly satisfies the following SYSTEM REQUIREMENTS. Do not output dummy schemas.
        
        SYSTEM REQUIREMENTS:
        {system_context}
        
        RULES:
        1. Output ONLY a JSON object with the exact key 'service_mesh'.
        2. The value of 'service_mesh' MUST be an object with two keys: 'graphql_schema' (string) and 'event_driven_boundaries' (list of strings).
        3. The 'graphql_schema' MUST be valid GraphQL SDL.
        """
        try:
            content = InferenceCoordinator.execute('Principal API Designer', 'GraphQL Schema Design', 'ServiceMesh', prompt, log_step, task_id)
            result = robust_json_loads(content)
            service_mesh = result.get('service_mesh', {})
            graphql_content = service_mesh.get('graphql_schema', '')
            boundaries = service_mesh.get('event_driven_boundaries', [])
            
            if not graphql_content:
                # Fallback if wrapped differently
                graphql_content = result.get('graphql', "type Query { error: String }")
                
            log_step(task_id, 'Service Architecture Mesh: GraphQL Schema generated.', 'ServiceMesh')
            from backend.agents.contracts import ServiceMeshContract
            validated_mesh = ServiceMeshContract(
                type="graphql",
                spec=graphql_content,
                event_driven_boundaries=boundaries
            )
            return {"api_design_spec": {"type": validated_mesh.type, "spec": validated_mesh.spec, "event_driven_boundaries": validated_mesh.event_driven_boundaries}}
        except Exception as e:
            log_step(task_id, f'ServiceMesh failed ({e}).', 'ServiceMesh', level='ERROR')
            return {"api_design_spec": {"type": "graphql", "spec": "type Query { error: String }", "event_driven_boundaries": []}}
    else:
        prompt = f"""
        ROLE: Principal API Designer
        TASK: Design a REST API specification that strictly satisfies the following SYSTEM REQUIREMENTS. Do not output dummy schemas.
        
        SYSTEM REQUIREMENTS:
        {system_context}
        
        RULES:
        1. Output ONLY a JSON object with the exact key 'service_mesh'.
        2. The value of 'service_mesh' MUST be an object with two keys: 'openapi_spec' (a valid OpenAPI 3.0 YAML string) and 'event_driven_boundaries' (list of strings).
        3. Strictly output JSON, no markdown formatting.
        4. Generate a complete OpenAPI 3.0 spec. You MUST include at minimum:
           - All CRUD endpoints for every entity in the data model
           - Search endpoints with all query parameters from the PRD
           - Authentication endpoints (register, login, logout, refresh)
           - All endpoints mentioned in acceptance criteria
           - Minimum 15 endpoints for this application.
        """
        try:
            content = InferenceCoordinator.execute('Principal API Designer', 'OpenAPI Specification Design', 'ServiceMesh', prompt, log_step, task_id)
            result = robust_json_loads(content)
            service_mesh = result.get('service_mesh', {})
            openapi_spec = service_mesh.get('openapi_spec', {})
            boundaries = service_mesh.get('event_driven_boundaries', [])
            
            if isinstance(openapi_spec, str):
                import yaml
                try:
                    # YAML parsing natively drops duplicate keys (last-writer-wins)
                    openapi_spec = yaml.safe_load(openapi_spec)
                except Exception:
                    openapi_spec = {}
            
            if not isinstance(openapi_spec, dict):
                openapi_spec = {}

            if not openapi_spec:
                openapi_spec = result if 'openapi' in result else {"openapi": "3.0.0", "info": {"title": "Error", "version": "1.0"}, "paths": {}}
                
            # Validate and fix OpenAPI Spec
            if 'openapi' not in openapi_spec and 'swagger' not in openapi_spec:
                openapi_spec['openapi'] = '3.0.0'
            if 'info' not in openapi_spec:
                openapi_spec['info'] = {"title": state.get('project', 'API'), "version": "1.0.0"}
            if 'paths' not in openapi_spec:
                openapi_spec['paths'] = {}
            
            # Deduplicate by re-serializing (last-writer-wins in JSON logic naturally handles this in Python if we load from string, 
            # but since we already parsed it, any duplicates were resolved by json.loads)
            
            log_step(task_id, 'Service Architecture Mesh: OpenAPI JSON generated.', 'ServiceMesh')
            from backend.agents.contracts import ServiceMeshContract
            validated_mesh = ServiceMeshContract(
                type="openapi",
                spec=openapi_spec,
                event_driven_boundaries=boundaries
            )
            return {"api_design_spec": {"type": validated_mesh.type, "spec": validated_mesh.spec, "event_driven_boundaries": validated_mesh.event_driven_boundaries}}
        except Exception as e:
            log_step(task_id, f'ServiceMesh failed ({e}).', 'ServiceMesh', level='ERROR')
            return {"api_design_spec": {"type": "openapi", "spec": {"openapi": "3.0.0", "info": {"title": "Error", "version": "1.0"}, "paths": {}}, "event_driven_boundaries": []}}

def db_architect_node(state: AgentState):
    """
    AGENT: DB Architect
    ROLE: Outputs either a Mermaid ERD or SQL DDL.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'DB Architect: Designing data layer...', 'DBArchitect')
    
    caps = state.get('capabilities', [])
    if not caps:
        caps = state.get('combined_data', {}).get('capabilities', [])
        
    logger.info(f"[CTX] db_architect_node capabilities count: {len(caps)}")
    logger.info(f"[CTX] db_architect_node unified_context_contract present: {'unified_context_contract' in state}")
    
    # Extract only DB-relevant capabilities
    db_relevant = [
        c for c in caps 
        if any(kw in str(c.get('description', '')).lower() 
               for kw in ['order', 'user', 'product', 'commission', 'qr', 'chemist'])
    ]
    
    minified_db_caps = [
        {"name": c.get("name"), "features": c.get("features", []), "workflows": c.get("workflows", [])}
        for c in db_relevant[:10]
    ]
    
    # Build minimal prompt — not full UCC
    prompt_context_dict = {
        "project": state.get('project', state.get('combined_data', {}).get('summary', '')),
        "relevant_capabilities": minified_db_caps,
        "core_roles": state.get('core_roles', state.get('combined_data', {}).get('personas', [])),
        "integrations": state.get('integrations', state.get('combined_data', {}).get('integrations', []))
    }
    
    system_context = json.dumps(prompt_context_dict, indent=2)
    
    is_sql = "sql" in str(state.get('combined_data', {})).lower() or "relational" in str(state.get('combined_data', {})).lower()
    
    if is_sql:
        prompt = f"""
        ROLE: DB Architect
        TASK: Design a SQL DDL schema that strictly satisfies the following SYSTEM REQUIREMENTS. Do not output dummy tables.
        
        SYSTEM REQUIREMENTS:
        {system_context}
        
        RULES:
        1. Output ONLY a JSON object with the exact key 'sql'.
        2. The value of 'sql' MUST be pure SQL DDL (CREATE TABLE statements) that accurately reflects the required features.
        """
        try:
            content = InferenceCoordinator.execute('DB Architect', 'SQL DDL Design', 'DBArchitect', prompt, log_step, task_id)
            result = robust_json_loads(content)
            sql_content = result.get('sql', '')
            if not sql_content:
                sql_content = "-- Error extracting SQL from JSON"
            log_step(task_id, 'DB Architect: SQL DDL generated.', 'DBArchitect')
            from backend.agents.contracts import DBArchitectContract
            validated_db = DBArchitectContract(type="sql_ddl", content=sql_content)
            return {"db_schema_design": {"type": validated_db.type, "content": validated_db.content}}
        except Exception as e:
            return {"db_schema_design": {"type": "sql_ddl", "content": "-- Error generating DDL"}}
    else:
        prompt = f"""
        ROLE: DB Architect
        TASK: Design an Entity-Relationship Diagram that strictly satisfies the following SYSTEM REQUIREMENTS. Do not output dummy tables.
        
        SYSTEM REQUIREMENTS:
        {system_context}
        
        RULES:
        1. Output ONLY a JSON object with the exact key 'mermaid'.
        2. The value of 'mermaid' MUST be pure Mermaid.js syntax using erDiagram.
        3. CRITICAL: You MUST escape all newlines as \\n and escape double quotes as \\" inside the JSON string value.
        
        Use ONLY this exact Mermaid ER syntax template:
        erDiagram
          ENTITY_A ||--o{{ ENTITY_B : "relationship"
          ENTITY_A {{
            int id PK
            string field
          }}
        """
        try:
            content = InferenceCoordinator.execute('DB Architect', 'Mermaid ERD Design', 'DBArchitect', prompt, log_step, task_id)
            result = robust_json_loads(content)
            mermaid_content = result.get('mermaid', '')
            if not mermaid_content:
                safe_content = content.replace('"', "'").replace('\n', ' ')
                mermaid_content = f"erDiagram\n    ParseError ||--o{{ Output : \"{safe_content[:100]}\""
            
            import logging

            logger.info(f"=== DB ARCHITECT DEBUG: raw output ===\n{mermaid_content}\n======================================")
            
            log_step(task_id, 'DB Architect: Mermaid ERD generated.', 'DBArchitect')
            from backend.agents.contracts import DBArchitectContract
            validated_db = DBArchitectContract(type="mermaid_erd", content=mermaid_content)
            return {"db_schema_design": {"type": validated_db.type, "content": validated_db.content}}
        except Exception as e:
            log_step(task_id, f'DB Architect failed: {e}', 'DBArchitect', level='ERROR')
            return {"db_schema_design": {"type": "mermaid_erd", "content": f"erDiagram\n    Exception ||--o{{ SYSTEM : \"{str(e)}\""}}

def ux_intelligence_node(state: AgentState):
    """
    AGENT: UX Intelligence
    ROLE: Outputs UX/UI component architectures and accessibility audit.
    """
    if state.get('error'):
        return state
    task_id = state.get('task_id')
    log_step(task_id, 'UX Intelligence: Analyzing user flows and accessibility...', 'UXIntel')
    
    logger.info(f"[CTX] ux_intelligence_node received capabilities: {'capabilities' in state}, count: {len(state.get('capabilities', []))}")
    logger.info(f"[CTX] ux_intelligence_node unified_context_contract present: {'unified_context_contract' in state}")
    
    combined = state.get('combined_data', {})
    system_context = json.dumps(combined, indent=2) if combined else state.get('clarified_requirements', state.get('raw_requirements', 'No PRD found.'))
    
    prompt = f"""
    ROLE: UX Intelligence Analyst
    TASK: Analyze the following SYSTEM REQUIREMENTS and output a JSON UX Architecture report. Do not output dummy flows.
    
    SYSTEM REQUIREMENTS:
    {system_context}
    
    OUTPUT JSON strictly with the key 'accessibility_audit', which must be an object containing 'target' and 'critical_fixes'.
    """
    try:
        content = InferenceCoordinator.execute('UX Analyst', 'UX Architecture', 'UXIntel', prompt, log_step, task_id)
        result = robust_json_loads(content)
        log_step(task_id, 'UX Intelligence: UX Architecture generated.', 'UXIntel')
        return {"ux_report": result}
    except Exception as e:
        log_step(task_id, f'UXIntel failed ({e}).', 'UXIntel', level='ERROR')
        return {"ux_report": {"accessibility_audit": {"target": "WCAG 2.1 Level AA", "critical_fixes": "Audit failed"}}}
