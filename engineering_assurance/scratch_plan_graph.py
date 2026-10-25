"""
================================================================================
PLAN GENERATION GRAPH (Milestone 4 - Phase 3 Gate)
================================================================================
This graph takes the synthesized requirements (Phase 1+2) and the Git Repo Profile,
and generates the structured Implementation Plan JSON. It stops execution and 
returns the plan to the UI for Developer Approval.
"""

import logging
import json
import traceback
import datetime
from typing import Dict, Any

from langgraph.graph import StateGraph, START, END
from backend.agents.state import AgentState, log_step
from backend.core.inference import InferenceCoordinator
from backend.core.mission_models import MissionStatus

logger = logging.getLogger(__name__)

async def implementation_plan_node(state: AgentState) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    
    log_step(task_id, "Implementation Plan: Synthesizing all phase intelligence...", "plan_agent", status="running")
    
    from backend.core.mission_controller import mission_controller
    # Load all previous phase outputs
    phase1 = await mission_controller.load_phase_output(mission_id, 1) or {}
    phase2 = await mission_controller.load_phase_output(mission_id, 2) or {}
    repo_profile = await mission_controller.get_phase_output(mission_id, "repo_profile") or {}
    
    # PRD raw context (the original requirement document)
    prd_raw = (phase1.get("prd_raw") or phase1.get("raw_prd") or phase1.get("original_prd") or "").strip()
    prd_summary = (phase1.get("prd_summary") or phase1.get("executive_summary") or "").strip()
    
    # Phase 1 context
    capabilities = phase1.get("capabilities", [])
    risk_advisories = phase1.get("risk_advisory_report", {}).get("advisories", [])
    tech_stack = phase1.get("target_tech_stack", {})
    nfr_summary = phase1.get("nfr_requirements", phase1.get("non_functional_requirements", {}))
    
    # Phase 2 context
    api_endpoints = phase2.get("api_design_spec", {}).get("endpoints", [])
    db_tables = phase2.get("db_schema_design", {}).get("tables", [])
    tasks = phase2.get("tasks", [])
    engineering_contract = phase2.get("engineering_contract", {})

    # NEW: Architecture-gate outputs from the 7 Phase 2 expansion agents
    security_constraints    = phase2.get("security_constraints", {})
    performance_budget      = phase2.get("performance_budget", {})
    compliance_requirements = phase2.get("compliance_requirements", {})
    module_boundary_map     = phase2.get("module_boundary_map", {})
    traceability_matrix     = phase2.get("traceability_matrix", {})
    integration_dependency_map = phase2.get("integration_dependency_map", {})
    requirement_clarity_report = phase2.get("requirement_clarity_report", {})
    
    # Repo context (brownfield only)
    existing_modules = repo_profile.get("modules", [])
    conventions = repo_profile.get("conventions", {})
    
    compact_modules = []
    for m in module_boundary_map.get("modules", []):
        compact_modules.append({
            "id": m.get("proposed_module_id", m.get("module_id", "")),
            "name": m.get("name", ""),
            "caps": m.get("capabilities", []),
            "tasks": m.get("tasks", [])
        })

    # Build the plan generation prompt
    prd_section = ""
    if prd_raw:
        prd_section = f"## PRD (Original Product Requirements Document)\n{prd_raw[:8000]}\n\n"
    elif prd_summary:
        prd_section = f"## PRD SUMMARY\n{prd_summary[:4000]}\n\n"
    prompt = f"""You are an Enterprise Software Architect generating a detailed Implementation Plan.

You have access to ALL intelligence gathered across ALL phases of analysis:

{prd_section}
## CLARIFIED REQUIREMENTS ({len(capabilities)} capabilities) — YOU MUST ACCOUNT FOR ALL {len(capabilities)}
{json.dumps([{"id": c.get("id", c.get("capability_id", "Unknown")), "title": c.get("title", c.get("name", "Unknown"))} for c in capabilities if isinstance(c, dict)], separators=(',', ':'))}

## RISK CONSTRAINTS (binding advisories)
{json.dumps([a.get("title") for a in risk_advisories if isinstance(a, dict) and a.get("binding")], separators=(',', ':'))}

## TARGET TECH STACK
{json.dumps(tech_stack, separators=(',', ':'))}

## NON-FUNCTIONAL REQUIREMENTS
{json.dumps(nfr_summary, separators=(',', ':')) if nfr_summary else 'Derived from risk advisories above.'}

## API CONTRACTS ({len(api_endpoints)} endpoints defined)
{json.dumps([e.get("path", "") + " [" + e.get("method", "GET") + "] " + e.get("description", "") for e in api_endpoints if isinstance(e, dict)], separators=(',', ':'))}

## DATABASE SCHEMA ({len(db_tables)} tables defined)
{json.dumps([t.get("name", str(t)) + (': ' + t.get('description', '') if isinstance(t, dict) and t.get('description') else '') for t in db_tables if isinstance(t, dict)], separators=(',', ':'))}

## ENGINEERING TASKS ({len(tasks)} tasks from Phase 2) — ALL tasks must appear in at least one module's task_refs
{json.dumps([{"id": t.get("task_id"), "title": t.get("title")} for t in tasks if isinstance(t, dict)], separators=(',', ':'))}

## V&V REQUIREMENTS
{json.dumps([c.get("description", str(c)) if isinstance(c, dict) else str(c) for c in engineering_contract.get("acceptance_criteria", [])], separators=(',', ':'))}

{"## EXISTING REPOSITORY" if existing_modules else "## REPOSITORY MODE: GREENFIELD"}
{json.dumps([m.get("name", str(m)) if isinstance(m, dict) else str(m) for m in existing_modules], separators=(',', ':')) if existing_modules else "No existing code — full greenfield generation."}

{"## EXISTING CONVENTIONS" if conventions else ""}
{json.dumps(conventions, separators=(',', ':')) if conventions else ""}

## SECURITY CONSTRAINTS (binding — merge into module binding_constraints below)
{json.dumps([c.get("constraint", str(c)) if isinstance(c, dict) else str(c) for c in security_constraints.get("module_constraints", [])], separators=(',', ':'))}

## PERFORMANCE BUDGETS (per-endpoint SLA targets for Phase 4 grading)
{json.dumps(performance_budget.get("per_endpoint_budgets", []), separators=(',', ':'))}

## COMPLIANCE FINDINGS (binding — merge into module binding_constraints below)
{json.dumps([f.get("finding", str(f)) if isinstance(f, dict) else str(f) for f in compliance_requirements.get("findings", []) if not isinstance(f, dict) or f.get("binding")], separators=(',', ':'))}

## INTEGRATION DEPENDENCIES (unresolved — surface as open_questions on affected modules)
{json.dumps([d.get("dependency", d.get("name", str(d))) if isinstance(d, dict) else str(d) for d in integration_dependency_map.get("external_dependencies", [])], separators=(',', ':'))}

{f"## PRE-COMPUTED MODULE BOUNDARIES (use these — do NOT invent new module splits)" if compact_modules else "## REPOSITORY MODE: GREENFIELD (module boundaries to be derived from capabilities)"}
{json.dumps(compact_modules, separators=(',', ':')) if compact_modules else ""}

## TRACEABILITY GAPS (uncovered requirements — must appear in plan open_questions)
{json.dumps([g.get("requirement", g.get("description", str(g))) if isinstance(g, dict) else str(g) for g in traceability_matrix.get("uncovered_requirements", [])], separators=(',', ':'))}

---

CRITICAL: You must generate one module for EVERY task listed above. There are {len(tasks)} tasks total. Before writing your final JSON, mentally check off each task_id against a module. If any task_id in this list: {[t.get("task_id") for t in tasks if isinstance(t, dict)]} is not referenced in any module's task_refs, your output is INCOMPLETE and WILL BE REJECTED.

Work through the task list in order. For each task or tightly related small group of tasks (max 3-4), create ONE module. Do not stop after the first module — continue until every task above has been assigned to exactly one module.

Your response is invalid if len(modules) < {max(8, len(tasks)//3)}.

Rules for module boundaries:
- Each module should map to one cohesive capability or a small tightly-coupled group of tasks (typically 1-4 tasks per module, rarely more).
- If a module's files_to_create list would exceed 6-7 files, or its API endpoints span more than 2-3 distinct resource types (e.g. bookings AND payments AND itineraries), you MUST split it into multiple modules.
- If two tasks have different risk profiles, different files, or could reasonably be reviewed and approved independently, they belong in SEPARATE modules — even if they're conceptually related.
- Every task_id from the list above must appear in at least one module's task_refs. Do not drop any task silently.
- Each module must include BOTH backend files (routes, services, models) AND corresponding frontend files (React components/pages needed to use this module's functionality), unless the module is purely backend infrastructure with no direct UI. For example, "User Registration" must include both backend/.../user_routes.py AND frontend/src/pages/Register.jsx or equivalent — do not omit frontend files.

MANDATORY MODULE SPLITTING EXAMPLE:
If a domain involves "Flight Search" AND "Hotel Search" as described separately in the capabilities, these are TWO modules, not one, even though both are "search." A module combining flight_search_service.py, hotel_search_service.py, flight_api_client.py, and hotel_api_client.py into ONE module is WRONG — split into MOD-Flight-Search and MOD-Hotel-Search.
Apply this same splitting logic to every domain pairing in the capability list: booking vs payment vs itinerary vs cancellation are FOUR modules, not one "Booking" module. Registration vs login vs password-reset vs OAuth are separate modules within an Authentication domain if each has independent files and can be reviewed/tested independently.

For EACH module, think through:
- Happy path AND all significant edge cases the implementation must explicitly handle
- Error handling and input validation requirements (e.g. what HTTP status codes, what error messages)
- Acceptance criteria: what tests must pass for this module to be considered complete
- New package dependencies this module introduces

If pre-defined module boundaries are provided above, use them exactly. Do not rename or split them. If there are no pre-defined boundaries, derive one module per logical capability cluster — do NOT collapse everything into fewer than {max(3, len(capabilities) // 3)} modules.

Merge all security and compliance binding_constraints into the relevant module's binding_constraints array. Surface unresolved integration dependencies and traceability gaps as open_questions entries with blocking: true.

Return JSON only, following this exact structure:
{{
  "plan_id": "PLAN-{mission_id[:8] if isinstance(mission_id, str) else str(mission_id)[:8]}",
  "generated_at": "{datetime.datetime.utcnow().isoformat()}",
  "plan_version": 1,
  "total_capabilities": {len(capabilities)},
  "total_tasks": {len(tasks)},
  "modules": [
    {{
      "module_id": "MOD-001",
      "name": "Example Module",
      "module_summary": "1-2 sentence description of what this module does and why it exists as a separate concern.",
      "capability_refs": ["CAP-001"],
      "task_refs": ["TASK-001"],
      "requirement_refs": ["REQ-001"],
      "depends_on": ["MOD-002"],
      "blocks": ["MOD-003", "MOD-007"],
      "files_to_create": ["path/to/file.py"],
      "files_to_update": ["existing/file.py"],
      "api_endpoints_implemented": ["/users/register [POST]"],
      "schema_changes": ["+ users table (id, email, pwhash, created_at)", "+ sessions table (token, user_id, expires_at)"],
      "new_dependencies": [{{"package": "bcrypt", "version": "^4.0", "justification": "password hashing with configurable cost factor"}}],
      "risk_label": "MEDIUM",
      "risk_rationale": "Modifies shared auth middleware used by 3 other modules; any regression breaks the entire auth flow.",
      "binding_constraints": ["Must hash passwords with bcrypt, cost factor >= 12", "JWT expiry must be configurable via env var"],
      "acceptance_criteria": ["Registration rejects duplicate emails with HTTP 409", "Password must be 8+ chars; rejected passwords return 400 with field-level errors", "Login returns JWT valid for 15 minutes"],
      "edge_cases": ["Concurrent registration attempts with same email — only one should succeed", "Login with unverified email — must reject with 403 and descriptive message", "JWT replay after logout — token must be invalidated server-side"],
      "error_handling_requirements": ["Return 400 with field-level errors on validation failure, not generic 500", "Log all auth failures to audit trail with user IP"],
      "open_questions": [{{"question": "How to handle password reset flow — email link or OTP?", "blocking": true}}, {{"question": "Optimal bcrypt cost factor for target hardware (p99 login latency < 200ms)?", "blocking": false}}],
      "approved": false,
      "developer_notes": ""
    }}
  ],
  "open_questions": [],
  "generation_summary": "2-3 sentence description of what this plan implements end-to-end and any cross-cutting concerns to watch."
}}"""

    import asyncio
    raw = await asyncio.to_thread(
        InferenceCoordinator.execute,
        role="Plan Generator",
        goal="Generate a detailed technical implementation plan",
        backstory="You are an expert software architect planning a complex system.",
        prompt=prompt,
        log_step_fn=lambda t, m, s: None,
        task_id=task_id,
        temperature=0.2,
        topology_id="planning_agent_node",
        max_tokens=8000
    )
    
    import re as _re
    def _extract_json(text: str) -> str:
        """Robustly extract the outermost JSON object from an LLM response."""
        # Strip markdown fences first
        for fence in ['```json', '```JSON', '```']:
            if fence in text:
                parts = text.split(fence)
                if len(parts) >= 3:
                    text = parts[1]
                    break
                elif len(parts) >= 2:
                    text = parts[1].split('```')[0]
                    break
        text = text.strip()
        # Find the balanced JSON object
        start = text.find('{')
        if start == -1:
            return text
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return text[start:i+1]
        # fallback: return from first { to last }
        end = text.rfind('}')
        return text[start:end+1] if end > start else text

    clean_json = _extract_json(raw)

    try:
        plan = json.loads(clean_json)
    except json.JSONDecodeError as e:
        logger.warning(f"[PLAN-GRAPH] Initial JSON parse failed: {e} — attempting repair")
        try:
            import json_repair
            plan = json_repair.loads(clean_json)
            logger.info("[PLAN-GRAPH] JSON repair succeeded")
        except Exception as repair_error:
            logger.error(f"[PLAN-GRAPH] Repair also failed: {repair_error}")
            logger.error(f"[PLAN-GRAPH] Raw LLM output (first 2000 chars): {raw[:2000]}")
            raise RuntimeError(f"Plan generation produced invalid JSON: {e}")
        
    if not plan or not plan.get("modules"):
        raise RuntimeError("Plan generation produced empty output — check LLM response")
        
    all_task_ids = {t.get("task_id") for t in tasks if isinstance(t, dict) and t.get("task_id")}
    covered_task_ids = {ref for m in plan.get("modules", []) for ref in m.get("task_refs", [])}
    missing = all_task_ids - covered_task_ids
    if missing:
        logger.warning(f"[PLAN-GRAPH] Plan omits {len(missing)} tasks: {missing}")
        if "open_questions" not in plan:
            plan["open_questions"] = []
        plan["open_questions"].append({
            "question": f"Plan omitted {len(missing)} tasks from Phase 2. They need to be manually assigned to modules: {', '.join(missing)}",
            "blocking": True
        })
    
    module_count = len(plan.get("modules", []))
    log_step(task_id, f"Implementation Plan: {module_count} modules generated ✓", "plan_agent", status="complete")
    
    return {"plan_json": plan}

async def plan_exit_node(state: AgentState) -> dict:
    mission_id = state.get("mission_id")
    plan = state.get("plan_json", {})
    
    if not plan:
        raise RuntimeError("Cannot persist empty implementation plan")
    
    from backend.core.mission_controller import mission_controller
    await mission_controller.save_phase_output(mission_id, "implementation_plan", plan)
    await mission_controller.transition_status(mission_id, MissionStatus.PLAN_PENDING)
    
    log_step(mission_id, f"Implementation Plan ready — {len(plan.get('modules', []))} modules await approval", "system", status="complete")
    return {}

def hitl3_gate_node(state: AgentState) -> dict:
    """Pure passthrough interrupt point — never self-approves."""
    return {}

def build_plan_graph() -> StateGraph:
    """Build the Plan Generation Graph."""
    logger.info("[PLAN-GRAPH] build_plan_graph() called")
    workflow = StateGraph(AgentState)
    
    workflow.add_node("implementation_plan_node", implementation_plan_node)
    workflow.add_node("plan_exit_node", plan_exit_node)
    workflow.add_node("hitl3_gate_node", hitl3_gate_node)
    
    workflow.add_edge(START, "implementation_plan_node")
    workflow.add_edge("implementation_plan_node", "plan_exit_node")
    workflow.add_edge("plan_exit_node", "hitl3_gate_node")
    workflow.add_edge("hitl3_gate_node", END)
    from langgraph.checkpoint.memory import MemorySaver
    checkpointer = MemorySaver()
    
    return workflow.compile(checkpointer=checkpointer, interrupt_before=["hitl3_gate_node"])
