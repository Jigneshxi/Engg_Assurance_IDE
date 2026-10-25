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


import asyncio

def _extract_json(text: str) -> str:
    """Robustly extract the outermost JSON object from an LLM response."""
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
    start = text.find('{')
    if start == -1: return text
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: return text[start:i+1]
    end = text.rfind('}')
    return text[start:end+1] if end > start else text

async def categorize_capabilities(capabilities: list, task_id: str) -> dict:
    """One cheap LLM call to group capabilities by domain before batching."""
    prompt = f"""Group these {len(capabilities)} capabilities into domain-coherent batches of exactly 4-5 (never more than 5). 
Capabilities that represent success/failure/error variants of the same underlying operation 
MUST be grouped in the same batch, never split across batches.

CRITICAL: Authentication, user registration, login, session management, and profile management 
are ALL PART OF THE SAME DOMAIN and MUST be grouped into the same batch — never split across 
batches. Before finalizing your batches, explicitly check: does more than one batch contain 
capabilities related to "user", "auth", "login", "register", or "profile"? If so, merge them 
into a single batch.

Capabilities:
{json.dumps([{"id": c.get("id", c.get("capability_id", "Unknown")), "name": c.get("title", c.get("name", "Unknown"))} for c in capabilities if isinstance(c, dict)], indent=2)}

Return JSON only:
{{"batches": [["CAP-01", "CAP-02"], ["CAP-03", "CAP-04"]]}}
"""
    try:
        raw = await asyncio.to_thread(
            InferenceCoordinator.execute,
            role="Batch Categorizer",
            goal="Group capabilities into domains",
            backstory="You group system capabilities intelligently.",
            prompt=prompt,
            log_step_fn=lambda t, m, s: None,
            task_id=task_id,
            temperature=0.1,
            topology_id="planning_agent_node",
            max_tokens=2000
        )
        return json.loads(_extract_json(raw))
    except Exception as e:
        logger.warning(f"[PLAN-GRAPH] Categorization failed: {e}")
        return {}

async def _generate_plan_batch(batch_caps, tasks, prd_section, risk_advisories, tech_stack, nfr_summary, api_endpoints, db_tables, engineering_contract, existing_modules, conventions, security_constraints, performance_budget, compliance_requirements, integration_dependency_map, compact_modules, traceability_matrix, mission_id, task_id, audit_section=""):
    prompt = f"""You are an Enterprise Software Architect generating a detailed Implementation Plan for a BATCH of system capabilities.

You have access to intelligence gathered across all phases of analysis, but YOU MUST ONLY GENERATE MODULES FOR THIS BATCH OF CAPABILITIES.

{prd_section}{audit_section}## CLARIFIED REQUIREMENTS FOR THIS BATCH ({len(batch_caps)} capabilities)
{json.dumps([{"id": c.get("id", c.get("capability_id", "Unknown")), "title": c.get("title", c.get("name", "Unknown"))} for c in batch_caps if isinstance(c, dict)], separators=(',', ':'))}

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

## ENGINEERING TASKS (System total: {len(tasks)} tasks)
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


CRITICAL: You are generating modules ONLY for the {len(batch_caps)} capabilities in THIS BATCH. 
Only assign tasks that logically belong to this batch's capabilities. Ignore tasks that belong to other domains.
DO NOT invent new capabilities, products, or features that are not explicitly provided in the batch's CLARIFIED REQUIREMENTS. Every module MUST have at least one valid `capability_ref` corresponding to the IDs provided. Modules without valid `capability_refs` will be rejected.

You MUST strictly follow existing repository conventions for file paths. For new files, always use a predictable nested structure like `src/backend/{{domain}}/` rather than a flat `{{domain}}.py`. Maintain consistency across all files.
- CRITICAL: You MUST use the same backend language and framework across ALL modules in this plan, exactly matching the TARGET TECH STACK provided above. Do not invent new languages. For example, if the stack specifies Python/FastAPI, you MUST use `.py` files. Never switch to JavaScript or Java mid-plan.

Rules for module boundaries:
- Each module should map to one cohesive capability or a small tightly-coupled group of tasks (typically 1-4 tasks per module, rarely more).
- If a module's files_to_create list would exceed 6-7 files, or its API endpoints span more than 2-3 distinct resource types, you MUST split it into multiple modules.
- If two tasks have different risk profiles, different files, or could reasonably be reviewed independently, they belong in SEPARATE modules.
- CRITICAL: Do NOT create separate modules for success/failure/error-handling variants of the same core operation. "Payment Processing" (including success confirmation, failure handling, and duplicate detection) is ONE module — these are behaviors within it, not separate modules. Only split into separate modules when the pieces have genuinely independent files, independent risk profiles, and could be reviewed in separate PRs meaningfully.
- CRITICAL: Do NOT create modules for cross-cutting non-functional concerns like "Scalability", "Usability", "Accessibility", "System Reliability", or "Testability" as standalone features. These are properties that apply ACROSS modules, not modules themselves — they should be expressed as binding_constraints on the specific modules they affect. A valid module must correspond to a concrete, implementable user-facing or system capability with its own specific behavior — not a quality attribute.
- Each module must include BOTH backend files AND frontend files (unless purely backend infrastructure).

MANDATORY MODULE SPLITTING EXAMPLE:
If a domain involves "Flight Search" AND "Hotel Search" as described separately in the capabilities, these are TWO modules, not one. Split into MOD-Flight-Search and MOD-Hotel-Search. Apply this same splitting logic to every domain pairing in the capability list.

For each module, in addition to the short module_summary, also generate a "detailed_summary" 
(2-3 sentences max) written for a developer who needs to understand:
- What this module actually does
- What it deliberately does NOT do (explicit scope boundaries — crucial to prevent duplicates)
- Brief risk framing and dependencies

Be extremely concise to save generation time. Do not restate the acceptance criteria.

Return JSON only, following this exact structure:
{{
  "modules": [
    {{
      "module_id": "MOD-001",
      "name": "Example Module",
      "module_summary": "1-2 sentence description",
      "detailed_summary": "This module establishes the foundational identity layer for the application. New users register with an email and password...",
      "capability_refs": ["CAP-001"],
      "task_refs": ["TASK-001"],
      "requirement_refs": ["REQ-001"],
      "depends_on": ["MOD-002"],
      "blocks": [],
      "files_to_create": ["path/to/file.py"],
      "files_to_update": ["existing/file.py"],
      "api_endpoints_implemented": [
        {{
          "path": "/users/register",
          "method": "POST",
          "request_schema": {{"email": "string", "password": "string"}},
          "response_success": {{"status": 201, "body": {{"id": "string", "token": "string"}}}},
          "response_errors": [
            {{"status": 409, "condition": "email already exists"}},
            {{"status": 400, "condition": "validation failure"}}
          ]
        }}
      ],
      "schema_changes": ["+ users table"],
      "new_dependencies": [{{"package": "bcrypt", "version": "^4.0", "justification": "hashing"}}],
      "risk_label": "MEDIUM",
      "risk_rationale": "Modifies shared auth middleware.",
      "binding_constraints": ["Must hash passwords with bcrypt"],
      "acceptance_criteria": ["Registration rejects duplicate emails"],
      "edge_cases": ["Concurrent registration attempts"],
      "error_handling_requirements": ["Return 400 with field-level errors"],
      "open_questions": [{{
        "id": "OQ-1",
        "text": "How to handle OTP?",
        "blocking": true,
        "ai_suggested_answer": "Recommend integrating AWS Cognito for seamless OTP handling.",
        "ai_suggestion_note": null,
        "developer_answer": null
      }}],
      "approved": false,
      "developer_notes": ""
    }}
  ],
  "open_questions": []
}}

For each open question you raise, also provide an "ai_suggested_answer" — your best-effort recommendation given standard industry practice and the context available, clearly reasoned, 2-3 sentences. This is a suggestion for the developer to accept, edit, or override — not a final decision. If you genuinely cannot form a reasonable suggestion (the gap requires business/product judgment only the developer has), say so explicitly by setting "ai_suggested_answer" to null and providing your reasoning in "ai_suggestion_note", e.g. "This requires a business decision — no technical default applies."
"""
    raw = await asyncio.to_thread(
        InferenceCoordinator.execute,
        role="Plan Generator",
        goal="Generate a detailed technical implementation plan for a batch of capabilities",
        backstory="You are an expert software architect planning a complex system.",
        prompt=prompt,
        log_step_fn=lambda t, m, s: None,
        task_id=task_id,
        temperature=0.2,
        topology_id="planning_agent_node",
        max_tokens=8000
    )
    
    clean_json = _extract_json(raw)
    try:
        return json.loads(clean_json)
    except Exception as e:
        logger.error(f"[PLAN-GRAPH] JSON parse failed for batch: {e}")
        try:
            import json_repair
            return json_repair.loads(clean_json)
        except Exception as repair_error:
            logger.error(f"[PLAN-GRAPH] Repair also failed: {repair_error}")
            return {"modules": [], "open_questions": []}

async def implementation_plan_node(state: AgentState) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    
    log_step(task_id, "Implementation Plan: Synthesizing intelligence in batches...", "plan_agent", status="running")
    
    from backend.core.mission_controller import mission_controller
    phase1 = (await mission_controller.get_phase_output(mission_id, 1)) or {}
    if not phase1 or not phase1.get("capabilities"):
        phase1 = {**state, **phase1}
    phase2 = (await mission_controller.get_phase_output(mission_id, 2)) or {}
    if not phase2 or not phase2.get("tasks"):
        phase2 = {**state, **phase2}
    repo_profile = await mission_controller.get_phase_output(mission_id, "repo_profile") or {}
    
    prd_raw = (phase1.get("prd_raw") or phase1.get("raw_prd") or phase1.get("original_prd") or "").strip()
    prd_summary = (phase1.get("prd_summary") or phase1.get("executive_summary") or "").strip()
    
    capabilities = phase1.get("capabilities") or []
    risk_advisories = (phase1.get("risk_advisory_report") or {}).get("advisories", [])
    tech_stack = phase1.get("target_tech_stack") or {}
    nfr_summary = phase1.get("nfr_requirements") or phase1.get("non_functional_requirements") or {}
    
    api_endpoints = (phase2.get("api_design_spec") or {}).get("endpoints", [])
    db_tables = (phase2.get("db_schema_design") or {}).get("tables", [])
    tasks = phase2.get("tasks") or []
    engineering_contract = phase2.get("engineering_contract") or {}

    security_constraints    = phase2.get("security_constraints") or {}
    performance_budget      = phase2.get("performance_budget") or {}
    compliance_requirements = phase2.get("compliance_requirements") or {}
    module_boundary_map     = phase2.get("module_boundary_map") or {}
    traceability_matrix     = phase2.get("traceability_matrix") or {}
    integration_dependency_map = phase2.get("integration_dependency_map") or {}
    
    existing_modules = repo_profile.get("modules", [])
    conventions = repo_profile.get("conventions", {})

    # Load brownfield audit summary if one was completed for this mission.
    existing_audit_summary = None
    try:
        from backend.core.database import SessionLocal, ExistingCodeAudit, CodeFinding
        from sqlalchemy import func as _func
        with SessionLocal() as _db:
            _audit = (
                _db.query(ExistingCodeAudit)
                .filter(
                    ExistingCodeAudit.mission_id == str(mission_id)
                )
                .order_by(ExistingCodeAudit.created_at.desc())
                .first()
            )
            if _audit and _audit.status in ("COMPLETE", "COMPLETE_TOOLS_UNAVAILABLE"):
                sev_rows = (
                    _db.query(CodeFinding.severity, _func.count(CodeFinding.id))
                    .filter(CodeFinding.audit_id == _audit.id)
                    .group_by(CodeFinding.severity)
                    .all()
                )
                existing_audit_summary = {
                    "status": _audit.status,
                    "tools_run": _audit.tools_run or [],
                    "tools_unavailable": _audit.tools_unavailable or [],
                    "total_findings": _audit.total_findings,
                    "files_scanned": _audit.total_files_scanned,
                    "by_severity": {sev: cnt for sev, cnt in sev_rows},
                }
    except Exception as _e:
        logger.warning(f"[PLAN-GRAPH] Could not load existing audit summary (non-critical): {_e}")

    compact_modules = []
    for m in module_boundary_map.get("modules", []):
        compact_modules.append({
            "id": m.get("proposed_module_id", m.get("module_id", "")),
            "name": m.get("name", ""),
            "caps": m.get("capabilities", []),
            "tasks": m.get("tasks", [])
        })

    prd_section = ""
    if prd_raw:
        prd_section = f"## PRD (Original Product Requirements Document)\n{prd_raw[:8000]}\n\n"
    elif prd_summary:
        prd_section = f"## PRD SUMMARY\n{prd_summary[:4000]}\n\n"

    # Brownfield audit section — injected into every batch prompt
    if existing_audit_summary and existing_audit_summary["status"] == "COMPLETE" and not existing_audit_summary["tools_unavailable"]:
        audit_section = (
            f"## Existing Codebase Audit Results\n"
            f"A code health scan was performed: {existing_audit_summary['files_scanned']} files scanned, "
            f"{existing_audit_summary['total_findings']} findings identified (tools used: {', '.join(existing_audit_summary['tools_run'])}).\n"
            f"By severity: {existing_audit_summary['by_severity']}\n"
            f"Security Intelligence note: When generating new modules, avoid repeating patterns "
            f"already flagged in the existing codebase (e.g., hardcoded secrets, missing input "
            f"validation, insecure dependencies). Reference these findings when defining "
            f"binding_constraints for security-sensitive modules.\n\n"
        )
    elif existing_audit_summary and existing_audit_summary["tools_unavailable"]:
        audit_section = (
            f"## Existing Codebase Audit\n"
            f"A code health scan was attempted, but the following tools were unavailable in "
            f"this environment and did NOT run: {', '.join(existing_audit_summary['tools_unavailable'])}. "
            f"Findings reported ({existing_audit_summary['total_findings']}) are from {', '.join(existing_audit_summary['tools_run']) or 'no tools'} "
            f"only and are NOT fully representative of code health. Do not treat the absence of "
            f"findings from unavailable tools as a clean bill of health — apply standard "
            f"security and quality constraints as if that category was never scanned.\n\n"
        )
    else:
        audit_section = (
            "## Existing Codebase Audit\n"
            "No pre-generation code health scan was performed for this mission. "
            "Do NOT assume the existing codebase is clean — simply note that no audit data "
            "is available. Apply standard security and quality constraints regardless.\n\n"
        )

    # Batched Execution Logic
    batches = []
    if capabilities:
        cat_result = await categorize_capabilities(capabilities, str(task_id))
        batches_ids = cat_result.get("batches", [])
        for b_ids in batches_ids:
            batch_caps = [c for c in capabilities if c.get("id", c.get("capability_id")) in b_ids]
            if batch_caps:
                batches.append(batch_caps)
                
    # Fallback to sequential chunking
    if not batches and capabilities:
        logger.info("[PLAN-GRAPH] Falling back to sequential chunking.")
        batch_size = 5
        for i in range(0, len(capabilities), batch_size):
            batches.append(capabilities[i:i + batch_size])
            
    if not batches:
        batches = [[]]

    # Generate plan for each batch concurrently
    tasks_coros = []
    for batch_caps in batches:
        tasks_coros.append(_generate_plan_batch(
            batch_caps, tasks, prd_section, risk_advisories, tech_stack, nfr_summary, api_endpoints, db_tables, engineering_contract, existing_modules, conventions, security_constraints, performance_budget, compliance_requirements, integration_dependency_map, compact_modules, traceability_matrix, mission_id, task_id,
            audit_section=audit_section
        ))

        
    batch_results = await asyncio.gather(*tasks_coros)
    
    all_modules = []
    all_open_questions = []
    global_counter = 1
    
    valid_capability_ids = {c.get("id", c.get("capability_id")) for c in capabilities if isinstance(c, dict) and c.get("id", c.get("capability_id"))}
    
    for batch_idx, res in enumerate(batch_results):
        batch_modules = res.get("modules", [])
        
        # 1. Filter Hallucinations
        valid_modules = []
        for m in batch_modules:
            refs = set(m.get("capability_refs", []))
            if not refs or not (refs & valid_capability_ids):
                logger.warning(f"[PLAN-GRAPH] Rejected hallucinated module {m.get('module_id', 'Unknown')} ({m.get('name', 'Unknown')}) — no valid capability_refs")
                continue
            valid_modules.append(m)
        
        # 2. Remap IDs locally
        local_remap = {}
        for module in valid_modules:
            old_id = module.get("module_id", "")
            new_id = f"MOD-{global_counter:03d}"
            local_remap[old_id] = new_id
            global_counter += 1
            module["module_id"] = new_id
            
        # 3. Rewrite internal dependencies
        for module in valid_modules:
            module["depends_on"] = [local_remap.get(old, old) for old in module.get("depends_on", [])]
            module["blocks"] = [local_remap.get(old, old) for old in module.get("blocks", [])]
            
        all_modules.extend(valid_modules)
        all_open_questions.extend(res.get("open_questions", []))
        
    # Safety Check: duplicates
    all_ids = [m.get("module_id") for m in all_modules]
    if len(all_ids) != len(set(all_ids)):
        raise RuntimeError("Duplicate module_id detected after remapping!")

        
    # --- Cross-batch near-duplicate detection (blocking) ---
    # Heuristic: tokenise module names and flag pairs with >60% word overlap.
    import re as _re
    def _name_tokens(name: str) -> set:
        stop = {"and", "the", "of", "for", "in", "to", "a", "an", "&", "-", "management", "module"}
        return {w for w in _re.split(r"[\s\-&/]+", name.lower()) if w and w not in stop}

    for i, m1 in enumerate(all_modules):
        t1 = _name_tokens(m1.get("name", ""))
        for m2 in all_modules[i+1:]:
            t2 = _name_tokens(m2.get("name", ""))
            if not t1 or not t2:
                continue
            overlap = len(t1 & t2) / max(len(t1), len(t2))
            if overlap >= 0.6:
                all_open_questions.append({
                    "id": f"OQ-SYS-{len(all_open_questions)+1}",
                    "text": (
                        f"System detected: '{m1.get('name')} ({m1['module_id']})' and "
                        f"'{m2.get('name')} ({m2['module_id']})'  have highly overlapping names "
                        f"({int(overlap*100)}% token overlap). They may be duplicates generated "
                        f"by different batches. Review for consolidation before approval."
                    ),
                    "blocking": True,
                    "ai_suggested_answer": None,
                    "ai_suggestion_note": (
                        f"Inspect both modules' capability_refs and files_to_create. "
                        f"If they implement the same feature, reject the lower-numbered module "
                        f"and ensure {m2['module_id']} covers the full scope."
                    ),
                    "developer_answer": None
                })
        



    from collections import defaultdict
    import re

    def normalize_endpoint(ep) -> str:
        if isinstance(ep, dict):
            path = ep.get("path", "").strip().lower()
            method = ep.get("method", "").strip().upper()
            return f"{path} [{method}]"
            
        ep_str = str(ep).strip()
        match = re.match(r"^(.*?)\s*\[(\w+)\]\s*$", ep_str)
        if match:
            path, method = match.groups()
            return f"{path.strip().lower()} [{method.strip().upper()}]"
        return ep_str.lower()

    endpoint_owners = defaultdict(list)
    for m in all_modules:
        for ep in m.get("api_endpoints_implemented", []):
            key = normalize_endpoint(ep)
            endpoint_owners[key].append(m)

    for ep, owners in endpoint_owners.items():
        if len(owners) > 1:
            owner_ids = [m["module_id"] for m in owners]
            names_map = {m["module_id"]: m.get("name", "") for m in owners}
            
            # Simple heuristic to suggest a likely owner based on path overlap
            ep_parts = ep.replace("/", " ").replace("[", "").replace("]", "").lower().split()
            best_match_id = owner_ids[0]
            best_match_score = -1
            for m in owners:
                score = sum(1 for part in ep_parts if part in m.get("name", "").lower())
                if score > best_match_score:
                    best_match_score = score
                    best_match_id = m["module_id"]
                    
            suggestion = f"Likely {best_match_id} ({names_map[best_match_id]}) should own this; consider removing it from the others."
            all_open_questions.append({
                "id": f"OQ-SYS-{len(all_open_questions)+1}",
                "text": f"System detected: Endpoint '{ep}' is claimed by multiple modules: {owner_ids}. Exactly one module should own this endpoint — verify and resolve before approval.",
                "blocking": True,
                "ai_suggested_answer": None,
                "ai_suggestion_note": suggestion,
                "developer_answer": None
            })

    # --- File-ownership conflict check ---
    # If 2+ modules list the same path in files_to_create, sequential generation
    # would silently overwrite the earlier module's file. Flag these blocking.
    from collections import defaultdict as _dd
    file_owners = _dd(list)
    for m in all_modules:
        for fp in m.get("files_to_create", []):
            if fp:
                file_owners[fp.strip()].append(m)

    for fpath, owners in file_owners.items():
        if len(owners) > 1:
            owner_ids = [m["module_id"] for m in owners]
            all_open_questions.append({
                "id": f"OQ-SYS-{len(all_open_questions)+1}",
                "text": (
                    f"System detected: File '{fpath}' is listed as [NEW] by multiple modules: "
                    f"{owner_ids}. Sequential generation will silently overwrite earlier modules' "
                    f"output. Consolidate into one owning module, or mark subsequent modules as [UPDATE]."
                ),
                "blocking": True,
                "ai_suggested_answer": None,
                "ai_suggestion_note": (
                    f"Assign ownership of '{fpath}' to the first module that creates it "
                    f"(likely {owner_ids[0]}). All other modules referencing it should list "
                    f"it under files_to_update, not files_to_create."
                ),
                "developer_answer": None
            })

    plan = {
        "plan_id": f"PLAN-{str(mission_id)[:8]}",
        "generated_at": datetime.datetime.utcnow().isoformat(),
        "plan_version": 1,
        "total_capabilities": len(capabilities),
        "total_tasks": len(tasks),
        "modules": all_modules,
        "open_questions": all_open_questions,
        "generation_summary": f"Generated {len(all_modules)} modules across {len(batches)} domain batches."
    }
        
    all_task_ids = {t.get("task_id") for t in tasks if isinstance(t, dict) and t.get("task_id")}
    covered_task_ids = {ref for m in plan.get("modules", []) for ref in m.get("task_refs", [])}
    missing = all_task_ids - covered_task_ids
    if missing:
        logger.warning(f"[PLAN-GRAPH] Plan omits {len(missing)} tasks: {missing}")
        if "open_questions" not in plan:
            plan["open_questions"] = []
        plan["open_questions"].append({
            "id": f"OQ-SYS-{len(plan['open_questions'])+1}",
            "text": f"System detected: Plan omitted {len(missing)} tasks from Phase 2. They need to be manually assigned to modules: {', '.join(list(missing)[:5])}...",
            "blocking": True,
            "ai_suggested_answer": None,
            "ai_suggestion_note": "System-generated missing task warning.",
            "developer_answer": None
        })
    
    log_step(task_id, f"Implementation Plan: {len(all_modules)} modules generated ✓", "plan_agent", status="complete")
    
    return {"plan_json": plan}

async def plan_exit_node(state: AgentState) -> dict:
    mission_id = state.get("mission_id")
    plan = state.get("plan_json", {})
    
    if not plan:
        raise RuntimeError("Cannot persist empty implementation plan")
    
    from backend.core.mission_controller import mission_controller
    await mission_controller.save_phase_output(mission_id, "implementation_plan", plan)
    current_status = await mission_controller.get_status(mission_id)
    if current_status == MissionStatus.PLAN_GENERATION_RUNNING:
        await mission_controller.transition_status(mission_id, MissionStatus.PLAN_PENDING)
    else:
        await mission_controller.set_status(mission_id, MissionStatus.PLAN_PENDING)
    
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
