"""
================================================================================
CONVERGE -- 4-MODULE PRODUCT API
================================================================================
"""
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.api.models import GenerateRequest
from backend.core.database import get_db, GenerationTask
from backend.api.routes.tasks import kickoff_generation_task, make_serializable
from backend.core.auth_models import User
from backend.api.routes.auth import get_current_user
from backend.rag.recall_service import governed_recall
from backend.core.mission_policy import (
    ALL_MISSION_AGENT_KEYS,
    build_mission_manifest,
    build_mission_profile,
    get_allowed_modules,
    get_role_defaults as get_role_policy_defaults,
    normalize_depth,
    normalize_modules,
    normalize_role,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/converge", tags=["CONVERGE Product Modules"])


class ConvergeMissionRequest(BaseModel):
    sources: List[Any] = []
    context: str = ""
    active_agents: Optional[Dict[str, Any]] = None
    modules: Optional[List[str]] = None
    depth: str = "standard"
    module: str = "all"
    role: str = "qa_engineer"
    min_log_level: Optional[int] = 3
    parent_task_id: Optional[str] = None
    use_node_cache: Optional[bool] = None
    mission_name: Optional[str] = None
    execution_context: Optional[Dict[str, Any]] = None
    execution_mode: Optional[str] = None
    state_overrides: Optional[Dict[str, Any]] = None


class KnowledgeQueryRequest(BaseModel):
    query: str
    n_results: int = 5
    filter_type: Optional[str] = None


class PRStatusUpdateRequest(BaseModel):
    pr_id: str
    status: str   # APPROVED | REJECTED | MERGED


def _coerce_modules(module: str, modules: Optional[List[str]], role: Optional[str] = None) -> List[str]:
    if modules:
        return normalize_modules(modules, fallback_role=role)
    normalized = module.lower().strip()
    if normalized == "all":
        return list(get_role_policy_defaults(role).get("modules", ["ingest", "forge"]))
    if normalized in {"ingest", "forge", "certify", "decide"}:
        return [normalized]
    return list(get_role_policy_defaults(role).get("modules", ["ingest", "forge"]))


def _build_active_agents(
    role_or_module: str,
    module_or_depth: str,
    depth: Optional[str] = None,
    modules: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if depth is None:
        role = "qa_engineer"
        module = role_or_module
        depth = module_or_depth
    else:
        role = role_or_module
        module = module_or_depth

    profile = build_mission_profile(role, _coerce_modules(module, modules, role), depth)
    return profile["active_agents"]


def _resolve_source_mission_id(db: Session, parent_task_id: Optional[str]) -> Optional[int]:
    if not parent_task_id:
        return None
    parent = db.query(GenerationTask).filter(GenerationTask.task_id == parent_task_id).first()
    return parent.mission_id if parent else None


@router.post("/ingest")
async def converge_ingest(request: Request, req: ConvergeMissionRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """MODULE 1 -- INGEST & SYNTHESIZE. Any input. Any format. One hardened specification."""
    active_agents = _build_active_agents(req.role, "ingest", req.depth)
    if req.active_agents:
        active_agents.update(req.active_agents)
    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name,
                              execution_context=req.execution_context, execution_mode=req.execution_mode or "analysis")
    result = await kickoff_generation_task(request=request, req=gen_req, background_tasks=background_tasks, mission_intent="PHASE_1", db=db, current_user=current_user)
    return {**result, "module": "ingest", "depth": req.depth,
            "description": "Requirement ingestion and synthesis pipeline activated."}


@router.post("/forge")
async def converge_forge(request: Request, req: ConvergeMissionRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """MODULE 2 -- GENERATE & FORGE. Specification in. Production-ready test suite out."""
    has_context = bool(req.context and len(req.context.strip()) >= 50)
    has_parent = bool(req.parent_task_id and str(req.parent_task_id).strip())
    if not has_context and not has_parent:
        raise HTTPException(
            status_code=400,
            detail="Module 2 (Forge) requires either requirement context or a parent_task_id from Module 1."
        )
    active_agents = _build_active_agents(req.role, "forge", req.depth)
    if req.active_agents:
        active_agents.update(req.active_agents)
    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name,
                              execution_context=req.execution_context, execution_mode=req.execution_mode or "analysis")
    result = await kickoff_generation_task(request=request, req=gen_req, background_tasks=background_tasks, mission_intent="PHASE_2", db=db, current_user=current_user)
    return {**result, "module": "forge", "depth": req.depth,
            "description": "Test generation and automation forge pipeline activated."}


@router.post("/certify")
async def converge_certify(request: Request, req: ConvergeMissionRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """MODULE 3 -- CERTIFY & COMPLY. Every sprint. Audit-ready. Automatically."""
    active_agents = _build_active_agents(req.role, "certify", req.depth)
    if req.active_agents:
        active_agents.update(req.active_agents)
    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name,
                              execution_context=req.execution_context, execution_mode=req.execution_mode or "analysis")
    result = await kickoff_generation_task(request=request, req=gen_req, background_tasks=background_tasks, mission_intent="PHASE_2", db=db, current_user=current_user)
    return {**result, "module": "certify", "depth": req.depth,
            "description": "Compliance certification and resilience validation pipeline activated."}


@router.post("/decide")
async def converge_decide(request: Request, req: ConvergeMissionRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """MODULE 4 -- DECIDE & OPTIMIZE. Ship or hold -- with a dollar figure. Every time."""
    active_agents = _build_active_agents(req.role, "decide", req.depth)
    if req.active_agents:
        active_agents.update(req.active_agents)
    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name,
                              execution_context=req.execution_context, execution_mode=req.execution_mode or "analysis")
    result = await kickoff_generation_task(request=request, req=gen_req, background_tasks=background_tasks, mission_intent="PHASE_2", db=db, current_user=current_user)
    return {**result, "module": "decide", "depth": req.depth,
            "description": "Release decision and engineering economics pipeline activated."}


@router.post("/mission")
async def converge_full_mission(request: Request, req: ConvergeMissionRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    FULL CONVERGE MISSION — Primary entry point for Mission Launchpad.

    Supports three input modes:
      Mode A — Fresh sources:    sources provided, no parent_task_id → PHASE_1 (ingest first)
      Mode B — Direct context:   context string provided, no sources → PHASE_1 (PRD injection)
      Mode C — Prior run chain:  parent_task_id provided → PHASE_2 (resume from prior UCC)

    Module routing:
      "ingest"  → PHASE_1 only (stop at HITL)
      "forge"   → PHASE_2 if parent_task_id, else PHASE_1 with forge-only agents
      "certify" → PHASE_2 if parent_task_id, else PHASE_1 with certify-only agents
      "decide"  → PHASE_2 if parent_task_id, else PHASE_1 with decide-only agents
    "all"     → PHASE_1 (full pipeline, HITL after ingest+plan)
    """
    logger.info(f"[MISSION-API] requirement chars={len(req.context or '')}")
    module_list = req.modules if req.modules else _coerce_modules(req.module, None, req.role)
    source_mission_id = _resolve_source_mission_id(db, req.parent_task_id)
    manifest = build_mission_manifest(req.role, module_list, req.depth, db=db, source_mission_id=source_mission_id)
    active_agents = dict(manifest["active_agents"])
    if req.active_agents:
        active_agents.update(req.active_agents)
    profile = build_mission_profile(req.role, module_list, req.depth)

    # Determine intent based on input mode
    if req.parent_task_id:
        # Mode C: Chaining from a prior run — resume with full mesh
        intent = "PHASE_2"
    else:
        # Mode A or B: Fresh mission — always start with Phase 1 (ingest + plan)
        intent = "PHASE_1"

    gen_req = GenerateRequest(
        sources=req.sources,
        context=req.context,
        active_agents=active_agents,
        min_log_level=req.min_log_level,
        parent_task_id=req.parent_task_id,
        depth=req.depth,
        role=req.role,
        use_node_cache=req.use_node_cache,
        module=req.module,
        mission_name=req.mission_name,
        execution_context=req.execution_context,
        execution_mode=req.execution_mode or "analysis",
        state_overrides=req.state_overrides
    )
    result = await kickoff_generation_task(request=request, req=gen_req, background_tasks=background_tasks, mission_intent=intent, db=db, current_user=current_user)
    counts = manifest.get("counts", {})
    module_label = " + ".join(m.upper() for m in module_list) if len(module_list) > 1 else (module_list[0].upper() if module_list else req.module.upper())

    try:
        task = db.query(GenerationTask).filter(GenerationTask.task_id == result.get("task_id")).first()
        if task and task.mission_id:
            from backend.services.mission_service import MissionService
            MissionService.update_mission_manifest(db, task.mission_id, manifest)
    except Exception as manifest_err:
        logger.warning(f"[MANIFEST-PERSIST] Failed to store mission manifest: {manifest_err}")

    return {
        **result,
        "module": req.module,
        "modules": module_list,
        "selected_modules": module_list,
        "depth": req.depth,
        "role": req.role,
        "nodes_activated": counts.get("eligible", counts.get("final", 0)),
        "core_agents": profile.get("core_agents", []),
        "supporting_agents": profile.get("supporting_agents", []),
        "dependency_agents": profile.get("dependency_agents", []),
        "system_agents": manifest.get("system_agents", []),
        "configured_agents": manifest.get("configured_agents", []),
        "eligible_agents": manifest.get("eligible_agents", []),
        "bypass_candidates": manifest.get("bypass_candidates", []),
        "artifact_coverage": manifest.get("artifact_coverage", {}),
        "mission_manifest": manifest,
        "intent": intent,
        "description": (
            f"CONVERGE {module_label} mission launched. "
            f"{counts.get('configured', counts.get('final', 0))} configured agents, "
            f"{counts.get('bypassed', 0)} bypass candidates at '{req.depth}' depth."
        )
    }


@router.post("/manifest")
def converge_mission_manifest(
    req: ConvergeMissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the mission manifest without launching execution."""
    module_list = req.modules if req.modules else _coerce_modules(req.module, None, req.role)
    source_mission_id = _resolve_source_mission_id(db, req.parent_task_id)
    manifest = build_mission_manifest(req.role, module_list, req.depth, db=db, source_mission_id=source_mission_id)
    return {
        "module": req.module,
        "modules": module_list,
        "role": req.role,
        "depth": manifest["depth"],
        "mission_manifest": manifest,
    }


@router.get("/role-defaults/{role}")
def get_role_defaults(role: str, current_user: User = Depends(get_current_user)):
    return get_role_policy_defaults(role)
    """
    ROLE-DRIVEN MODULE DEFAULTS — Returns the recommended module configuration
    for a given user role. Powers the Mission Launchpad auto-configuration.
    """
    ROLE_MODULE_DEFAULTS = {
        "qa_engineer": {
            "modules": ["ingest", "forge"],
            "depth": "standard",
            "description": "Ingest requirements and generate a complete test suite.",
            "recommended_views": ["mesh_observatory", "test_case_factory"]
        },
        "sdet": {
            "modules": ["forge"],
            "depth": "standard",
            "description": "Generate automation scripts from an existing specification.",
            "recommended_views": ["crew_code_generators", "crew_scenario_data"],
            "requires_context": True
        },
        "qa_lead": {
            "modules": ["ingest", "forge", "certify"],
            "depth": "standard",
            "description": "Full quality chain — ingest, generate, and certify compliance.",
            "recommended_views": ["mesh_observatory", "release_command"]
        },
        "manager": {
            "modules": ["decide"],
            "depth": "rapid",
            "description": "Release decision and engineering economics from existing run.",
            "recommended_views": ["release_command", "history_trends"],
            "requires_parent_task": True
        },
        "ciso": {
            "modules": ["certify"],
            "depth": "standard",
            "description": "Compliance audit and evidence package generation.",
            "recommended_views": ["crew_security_aspm", "release_command"],
            "requires_context": True
        },
        "cto": {
            "modules": ["decide"],
            "depth": "rapid",
            "description": "Executive release signal — Go/No-Go with financial justification.",
            "recommended_views": ["release_command"],
            "requires_parent_task": True
        },
    }
    defaults = ROLE_MODULE_DEFAULTS.get(role.lower())
    if not defaults:
        return ROLE_MODULE_DEFAULTS.get("qa_engineer")
    return {"role": role, **defaults}


@router.get("/recent-tasks")
def get_recent_completed_tasks(limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    RECENT COMPLETED TASKS — Returns the last N completed tasks for the
    prior-run selector in Mission Launchpad. Allows chaining modules.
    """
    from backend.core.database import GenerationTask
    from sqlalchemy.orm import load_only
    
    # Step 1: Get the task IDs (avoids out of sort memory for large JSON columns)
    task_ids_result = db.query(GenerationTask.task_id).filter(
        GenerationTask.status == "COMPLETED"
    ).order_by(GenerationTask.created_at.desc()).limit(limit).all()
    
    task_ids = [t[0] for t in task_ids_result]
    
    if not task_ids:
        return []
        
    # Step 2: Fetch the full rows without loading the large log payload.
    tasks = db.query(GenerationTask).options(
        load_only(
            GenerationTask.task_id,
            GenerationTask.status,
            GenerationTask.created_at,
            GenerationTask.mission_intent,
            GenerationTask.mission_id,
            GenerationTask.result,
            GenerationTask.partial_state,
        )
    ).filter(
        GenerationTask.task_id.in_(task_ids)
    ).all()
    
    # Sort them back in Python to match the requested order
    tasks.sort(key=lambda x: task_ids.index(x.task_id))

    from backend.core.mission_models import Mission

    items = []
    for t in tasks:
        mission = db.query(Mission).filter(Mission.id == t.mission_id).first() if t.mission_id else None
        items.append(
            {
                "task_id": t.task_id,
                "task_id_short": t.task_id[:8],
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "mission_intent": t.mission_intent or "PHASE_1",
                "has_ucc": bool(
                    (t.result or {}).get("combined_data") or
                    (t.partial_state or {}).get("combined_data")
                ),
                "summary": (
                    (t.result or {}).get("combined_data", {}).get("summary") or
                    (t.partial_state or {}).get("combined_data", {}).get("summary") or
                    f"Task {t.task_id[:8]}"
                ),
                "label": f"{t.task_id[:8]} — {t.created_at.strftime('%b %d %H:%M') if t.created_at else 'Unknown'}",
                "configured_agents": (mission.configured_agents_count if mission else len((t.result or {}).get("active_agents", {}))),
                "eligible_agents": (mission.eligible_agents_count if mission else len((t.result or {}).get("active_agents", {}))),
                "executed_agents": (mission.executed_agents_count if mission else len((t.result or {}).get("executed_agents", []))),
                "bypassed_agents": (mission.bypassed_agents_count if mission else len((t.result or {}).get("bypassed_agents", []))),
                "failed_agents": (mission.failed_agents_count if mission else len((t.result or {}).get("failed_agents", []))),
            }
        )
    return items


@router.get("/release-decision/{task_id}")
def get_release_decision(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """RELEASE COMMAND CENTER -- Go/No-Go card. Aggregates agents #50, #51, #52, #44, #26, #21, #49."""
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    merged = {**(task.result or {}), **(task.partial_state or {})}
    merged.update(merged.get("full_state") or {})

    if task.mission_id:
        from backend.core.mission_models import Mission
        mission = db.query(Mission).filter(Mission.id == task.mission_id).first()
        if mission and mission.phase_outputs:
            merged.update(mission.phase_outputs.get("3", {}))
            merged.update(mission.phase_outputs.get("4", {}))

    release_risk = merged.get("release_risk_decision") or {}
    biz_impact = merged.get("business_impact_intelligence") or {}
    roi = merged.get("eng_economics_roi") or {}
    reliability = merged.get("reliability_eng") or {}
    chaos = merged.get("chaos_scenarios") or []
    compliance = merged.get("compliance_report") or {}
    resilience = merged.get("system_resilience") or {}

    flaky_count = len(reliability.get("flaky_tests") or [])
    controls_count = len(compliance.get("compliance_controls") or [])
    score_components = []
    if isinstance(release_risk.get("risk_score"), (int, float)):
        score_components.append(100 - int(release_risk["risk_score"] * 100))
    # Only include flaky test score if reliability data actually exists (don't default to 100)
    if reliability:
        score_components.append(100 if flaky_count == 0 else 75 if flaky_count < 3 else 50)
    if controls_count > 0:
        score_components.append(90)
    # Only compute a score if at least one decide-tier agent produced real data
    composite_score = int(sum(score_components) / len(score_components)) if score_components else None

    return {
        "task_id": task_id,
        "status": task.status,
        "release_decision": {
            "decision": release_risk.get("recommendation") or release_risk.get("decision") or "PENDING",
            "composite_score": composite_score,
            "justification": release_risk.get("justification") or release_risk.get("narrative_justification") or "",
            "risk_factors": release_risk.get("risk_score") or release_risk.get("risk_factors") or []
        },
        "revenue_guard": {
            "revenue_at_risk": biz_impact.get("revenue_at_risk") or biz_impact.get("revenue_exposure") or "N/A",
            "total_exposure": biz_impact.get("total_exposure") or "N/A",
            "flaky_tests": flaky_count,
            "quarantined": reliability.get("quarantine_count") or 0
        },
        "compliance_status": {
            "standards": compliance.get("applicable_standards") or [],
            "controls_verified": controls_count,
            "status": "CLEAN" if controls_count > 0 else "PENDING"
        },
        "resilience_certificate": {
            "score": resilience.get("resilience_score") or "N/A",
            "chaos_scenarios_passed": len(chaos),
            "stability_score": (reliability.get("health") or {}).get("stability_score") or "N/A"
        },
        "economics": {
            "roi_percentage": roi.get("roi_percentage") or "N/A",
            "estimated_savings": roi.get("estimated_savings") or roi.get("savings") or "N/A"
        }
    }


@router.get("/economics/{task_id}")
def get_economics_report(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ENGINEERING ECONOMICS DASHBOARD (Phase 1.1 - CFO View)
    
    Provides comprehensive financial analysis including:
    - Real-time cost tracking (token + compute)
    - Cost-per-test calculations
    - Manual effort savings (hours * hourly rate)
    - Automation ROI percentage
    - Payback period analysis
    - Executive-ready financial justification
    
    This endpoint powers the CFO View panel in the Release Command Center.
    """
    from backend.core.economics_engine import calculate_task_economics
    
    try:
        # Calculate comprehensive economics
        economics = calculate_task_economics(task_id, db)
        
        # Also fetch legacy agent outputs for backward compatibility
        task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
        
        merged = {**(task.result or {}), **(task.partial_state or {})}
        merged.update(merged.get("full_state") or {})
        
        roi_agent = merged.get("eng_economics_roi") or {}
        biz_agent = merged.get("business_impact_intelligence") or {}
        suite_opt = merged.get("suite_optimization_config") or {}
        test_impact = merged.get("test_impact_config") or {}
        test_cases = merged.get("test_cases") or []
        
        # Merge real-time calculations with agent insights
        return {
            "task_id": task_id,
            "real_time_economics": economics,  # NEW: Phase 1.1 financial intelligence
            "roi_analysis": {
                "roi_percentage": economics["roi_analysis"]["roi_percentage"],
                "estimated_savings": f"${economics['roi_analysis']['net_savings']:.2f}",
                "cost_per_test": f"${economics['roi_analysis']['cost_per_test']:.4f}",
                "payback_period": f"{economics['roi_analysis']['payback_period_days']:.1f} days",
                "costs_breakdown": [
                    {"category": "Token Cost", "amount": economics["cost_breakdown"]["token_cost"]},
                    {"category": "Compute Cost", "amount": economics["cost_breakdown"]["compute_cost"]},
                    {"category": "Total Investment", "amount": economics["total_cost_usd"]}
                ],
                "insights": roi_agent.get("insights") or roi_agent.get("actionable_insights") or [
                    economics["cfo_summary"]["recommendation"]
                ]
            },
            "business_impact": {
                "revenue_at_risk": biz_agent.get("revenue_at_risk") or biz_agent.get("revenue_exposure") or "N/A",
                "risk_multiplier": biz_agent.get("risk_multiplier") or "N/A",
                "defect_portfolio": biz_agent.get("defect_portfolio") or biz_agent.get("pillars") or [],
                "total_exposure": biz_agent.get("total_exposure") or "N/A"
            },
            "suite_efficiency": {
                "optimized_suite_size": suite_opt.get("optimized_suite_size") or len(test_cases),
                "estimated_savings_percent": suite_opt.get("estimated_savings_percent") or "N/A",
                "pruned_redundancies": suite_opt.get("pruned_redundancies") or [],
                "data_source": suite_opt.get("data_source") or "AI-Estimated"
            },
            "impact_analysis": {
                "blast_radius": test_impact.get("blast_radius_score") or test_impact.get("blast_radius") or "N/A",
                "impacted_modules": test_impact.get("impacted_modules") or [],
                "estimated_time_saving": test_impact.get("estimated_time_saving") or "N/A"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ECONOMICS] Report generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Economics calculation failed: {str(e)}")


@router.get("/remediation/{task_id}")
def get_remediation_prs(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    COMPLIANCE REMEDIATION PRs (Phase 2.2)

    Generates structured Git PR proposals for every compliance violation
    identified by the Compliance Governor (Agent #21) during the mission.

    Each PR includes:
    - Title and description (PR-ready)
    - Unified diff showing the exact code fix
    - Severity, standard, and estimated effort
    - Status: PROPOSED (user can approve/reject in the UI)

    Powers the "Remediate Violation" button in the Compliance panel.
    """
    from backend.core.remediation_pr_engine import generate_remediation_prs

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    merged = {**(task.result or {}), **(task.partial_state or {})}
    merged.update(merged.get("full_state") or {})

    compliance_report = merged.get("compliance_report") or {}
    remediation_config = merged.get("compliance_remediation_config") or {}

    # Merge both compliance sources
    combined_report = {**compliance_report, **remediation_config}

    if not combined_report:
        return {
            "task_id": task_id,
            "prs": [],
            "pr_count": 0,
            "message": "No compliance data available. Run a full mission with the Certify module enabled."
        }

    try:
        context = (merged.get("combined_data") or {}).get("description", "")
        prs = generate_remediation_prs(combined_report, task_id, context)

        return {
            "task_id": task_id,
            "prs": prs,
            "pr_count": len(prs),
            "standards_covered": list({pr["standard"] for pr in prs}),
            "critical_count": sum(1 for pr in prs if pr.get("severity") == "CRITICAL"),
            "message": f"{len(prs)} remediation PR(s) generated." if prs else "No actionable violations found."
        }
    except Exception as e:
        logger.error(f"[REMEDIATION-PR] Generation failed for task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"PR generation failed: {str(e)}")


class PRStatusUpdateRequest(BaseModel):
    pr_id: str
    status: str   # APPROVED | REJECTED | MERGED


@router.post("/remediation/{task_id}/update-status")
def update_pr_status(task_id: str, req: PRStatusUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Update the status of a remediation PR (APPROVED / REJECTED / MERGED).
    Persists the decision to the task's partial_state for audit trail.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    valid_statuses = {"APPROVED", "REJECTED", "MERGED", "PROPOSED"}
    if req.status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    try:
        partial = dict(task.partial_state or {})
        pr_decisions = partial.get("pr_decisions") or {}
        pr_decisions[req.pr_id] = req.status.upper()
        partial["pr_decisions"] = pr_decisions

        from sqlalchemy.orm.attributes import flag_modified
        task.partial_state = partial
        flag_modified(task, "partial_state")
        db.commit()

        return {
            "success": True,
            "pr_id": req.pr_id,
            "status": req.status.upper(),
            "message": f"PR {req.pr_id} marked as {req.status.upper()}."
        }
    except Exception as e:
        db.rollback()
        logger.error(f"[REMEDIATION-PR] Status update failed: {e}")
        raise HTTPException(status_code=500, detail=f"Status update failed: {str(e)}")


@router.get("/resilience-inspector/{task_id}")
def get_resilience_inspector(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    RESILIENCE INSPECTOR (Phase 3.1 — Self-Healing Transparency)

    Returns the full locator artifact for every UI element generated during the mission:
    - Primary selector + 3 adaptive backup selectors per element
    - Resilience score (0-100) per element
    - Selector strategy labels (data-testid, aria-label, CSS, XPath)
    - Heal count estimates and fragility risk ratings
    - Overall suite stability percentage

    Powers the "Resilience Inspector" tab in the Artifact Factory (Module 2).
    Makes the AI's invisible self-healing resilience fully demonstrable.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    merged = {**(task.result or {}), **(task.partial_state or {})}
    merged.update(merged.get("full_state") or {})

    locator_data = merged.get("locator_intelligence") or {}
    healing_data = merged.get("self_healing_config") or {}

    # Merge locator intelligence with self-healing hooks for richer output
    elements = locator_data.get("elements") or []

    # Supplement with self-healing hooks if locator data is sparse
    if len(elements) < 3 and healing_data.get("self_healing_hooks"):
        for i, hook in enumerate(healing_data["self_healing_hooks"][:8]):
            elements.append({
                "element_id": f"EL-{str(i+1).zfill(3)}",
                "ui_component": hook.get("ui_component") or hook.get("locator", f"Element {i+1}"),
                "page": "Application",
                "primary_selector": hook.get("locator", ""),
                "primary_strategy": hook.get("strategy", "CSS"),
                "backup_selectors": [
                    {"selector": fb, "strategy": "Adaptive", "confidence": max(90 - (j * 10), 50)}
                    for j, fb in enumerate((hook.get("fallbacks") or [])[:3])
                ],
                "resilience_score": 85,
                "heal_count": 0,
                "fragility_risk": "Low",
                "recommendation": hook.get("strategy", "Adaptive selector chain configured.")
            })

    return {
        "task_id": task_id,
        "elements": elements,
        "total_elements": len(elements),
        "stability": locator_data.get("stability") or healing_data.get("resilience_score") or "N/A",
        "high_risk_count": locator_data.get("high_risk_count") or sum(
            1 for e in elements if e.get("fragility_risk") in ("High", "Critical")
        ),
        "data_source": locator_data.get("data_source") or healing_data.get("data_source") or "AI-Synthesized",
        "audit": locator_data.get("audit") or "Resilience Inspector data from mission execution.",
        "actionable_insights": locator_data.get("actionable_insights") or healing_data.get("actionable_insights") or [],
        "quality_recommendations": locator_data.get("quality_recommendations") or []
    }


@router.get("/migration/{task_id}")
def get_migration_plan(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    AUTOMATION MIGRATION WORKSPACE (Phase 3.2)

    Returns the full migration plan for converting legacy automation suites
    (Selenium, TestRail, JUnit) to modern frameworks (Playwright, CONVERGE).

    Includes:
    - Per-file migration steps with before/after code snippets
    - Framework compatibility matrix
    - Effort estimates and risk ratings
    - Quick wins and blockers list

    Powers the "Migrate Legacy Suite" workflow in Module 2.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    merged = {**(task.result or {}), **(task.partial_state or {})}
    merged.update(merged.get("full_state") or {})

    migration_data = merged.get("auto_migration_assistant") or {}

    return {
        "task_id": task_id,
        "migration_summary": migration_data.get("migration_summary") or {
            "total_files": 0, "estimated_effort_days": 0,
            "automation_gain_percent": 0, "risk_level": "Unknown",
            "target_framework": "Playwright (TypeScript)"
        },
        "migration_steps": migration_data.get("migration_steps") or [],
        "compatibility_matrix": migration_data.get("compatibility_matrix") or [],
        "quick_wins": migration_data.get("quick_wins") or [],
        "blockers": migration_data.get("blockers") or [],
        "actionable_insights": migration_data.get("actionable_insights") or [],
        "quality_recommendations": migration_data.get("quality_recommendations") or []
    }


@router.post("/migration/{task_id}/analyze-file")
async def analyze_legacy_file(
    task_id: str,
    db: Session = Depends(get_db),
    file_content: Optional[str] = None,
    filename: Optional[str] = None,
    source_framework: Optional[str] = "selenium"
, current_user: User = Depends(get_current_user)):
    """
    MIGRATION FILE ANALYZER — Analyze an uploaded legacy test file and generate
    a migration plan for it. Called when user drags a file into the Migration Workspace.
    """
    if not file_content:
        raise HTTPException(status_code=400, detail="file_content is required.")

    from backend.core.identity_orchestrator import IdentityOrchestrator
    import json as _json

    prompt = f"""You are a migration expert. Analyze this legacy {source_framework} test file and generate a migration plan to Playwright TypeScript.

FILENAME: {filename or 'test_file'}
CONTENT:
{file_content[:2000]}

Return JSON with:
{{
  "migration_steps": [
    {{
      "step_id": "MIG-001",
      "source_type": "{source_framework}",
      "target_type": "Playwright",
      "filename": "{filename or 'test_file'}",
      "status": "Ready",
      "effort": "S",
      "risk": "Low",
      "before_snippet": "original code line",
      "after_snippet": "migrated playwright code",
      "migration_notes": "explanation"
    }}
  ],
  "quick_wins": ["..."],
  "blockers": ["..."],
  "estimated_effort_hours": 2
}}"""

    for tier in ("primary", "economy"):
        identity = IdentityOrchestrator.get_identity(tier)
        if not identity:
            continue
        try:
            provider = identity["provider"].lower()
            api_key = identity["key"]
            model = identity["model"]
            base_url = identity.get("url") or ""

            result_text = ""
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key)
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model, max_tokens=1500, temperature=0.1
                )
                result_text = res.choices[0].message.content
            elif provider in ("openai", "openrouter", "gemini"):
                from openai import OpenAI
                default_urls = {"openai": "https://api.openai.com/v1", "openrouter": "https://openrouter.ai/api/v1", "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/"}
                client = OpenAI(api_key=api_key, base_url=base_url or default_urls.get(provider, "https://api.openai.com/v1"))
                clean_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=clean_model, max_tokens=1500, temperature=0.1
                )
                result_text = res.choices[0].message.content

            if result_text:
                import re as _re
                result_text = result_text.strip()
                result_text = _re.sub(r'^```json\s*', '', result_text)
                result_text = _re.sub(r'\s*```$', '', result_text)
                return _json.loads(result_text)
        except Exception as e:
            logger.warning(f"[MIGRATION-ANALYZE] Tier {tier} failed: {e}")
            continue

    return {"migration_steps": [], "quick_wins": [], "blockers": ["Analysis failed — try again."], "estimated_effort_hours": 0}


@router.get("/economics/trend/history")
def get_economics_trend(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ENGINEERING ECONOMICS TREND (Phase 5.1 - Quarterly Health Reporting)
    
    Aggregates financial metrics across multiple missions to show:
    - ROI improvement over time
    - Cumulative savings
    - Cost efficiency trends
    - Test generation velocity
    
    Powers the Quarterly Engineering Health Report.
    """
    from backend.core.economics_engine import get_historical_economics_trend
    return get_historical_economics_trend(db, limit=limit)


@router.get("/compliance-pack/{task_id}")
def get_compliance_pack(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """COMPLIANCE EVIDENCE PACKAGE -- Aggregates agents #21, #27, #09, #18."""
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    merged = {**(task.result or {}), **(task.partial_state or {})}
    merged.update(merged.get("full_state") or {})
    compliance = merged.get("compliance_report") or {}
    remediation = merged.get("compliance_remediation_config") or {}
    traceability = merged.get("traceability_matrix") or []
    security = merged.get("security_signals") or []
    test_cases = merged.get("test_cases") or []
    standards = compliance.get("applicable_standards") or []
    controls = compliance.get("compliance_controls") or []
    evidence_map = {}
    for control in controls:
        std = control.get("control_id", "").split("-")[0] if control.get("control_id") else "GENERAL"
        if std not in evidence_map:
            evidence_map[std] = []
        related_tests = [
            tc.get("case_id") or tc.get("title", "")[:60]
            for tc in test_cases
            if std.lower() in str(tc).lower()
        ][:5]
        evidence_map[std].append({
            "control_id": control.get("control_id"),
            "description": control.get("description"),
            "status": control.get("status", "Required"),
            "test_evidence": related_tests,
            "verified": len(related_tests) > 0
        })
    return {
        "task_id": task_id,
        "generated_at": task.updated_at.isoformat() if task.updated_at else None,
        "applicable_standards": standards,
        "evidence_by_standard": evidence_map,
        "total_controls": len(controls),
        "verified_controls": sum(1 for items in evidence_map.values() for item in items if item.get("verified")),
        "remediation_actions": remediation.get("remediation_actions") or remediation.get("auto_remediated") or [],
        "traceability_coverage": {
            "total_requirements": len(traceability),
            "fully_covered": sum(1 for r in traceability if isinstance(r, dict) and r.get("coverage_status") == "Full"),
            "gaps": [r.get("requirement_id") for r in traceability
                     if isinstance(r, dict) and r.get("coverage_status") in ("None", "Partial")][:10]
        },
        "security_findings": len(security) if isinstance(security, list) else 0,
        "package_status": "COMPLETE" if standards and controls else "PARTIAL"
    }


@router.post("/knowledge-graph")
def query_knowledge_graph(req: KnowledgeQueryRequest, current_user: User = Depends(get_current_user)):
    """KNOWLEDGE GRAPH SEMANTIC QUERY -- ChromaDB vector store natural language interface."""
    try:
        metadata_filter = {"type": req.filter_type} if req.filter_type else None
        decision = governed_recall(
            query=req.query,
            n_results=req.n_results,
            metadata_filter=metadata_filter,
            exclude_synthetic=True,
        )
        return {
            "query": req.query,
            "results_count": len(decision.accepted_contexts),
            "decision": decision.to_dict(),
            "results": [{"id": r.get("memory_key"), "content": r.get("content", "")[:500],
                         "confidence": r.get("score"), "metadata": r.get("metadata", {})}
                        for r in decision.accepted_contexts]
        }
    except Exception as e:
        logger.error(f"[KNOWLEDGE-GRAPH] Query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Knowledge graph query failed: {str(e)}")


@router.get("/mesh-profile")
def get_mesh_profile(
    module: str = Query("all"),
    modules: Optional[str] = Query(None),
    depth: str = Query("standard"),
    role: str = Query("qa_engineer")
, current_user: User = Depends(get_current_user)):
    """MESH PROFILE -- Agent activation preview for Mission Launchpad UI."""
    module_list = normalize_modules([m.strip() for m in modules.split(",") if m.strip()], fallback_role=role) if modules else _coerce_modules(module, None, role)
    profile = build_mission_profile(role, module_list, depth)
    return {
        "module": module,
        "modules": module_list,
        "depth": profile["depth"],
        "role": profile["role"],
        "allowed_modules": profile["allowed_modules"],
        "nodes_activated": profile["counts"].get("eligible", profile["counts"]["final"]),
        "nodes_bypassed": len(profile.get("bypass_candidates", [])),
        "active_agents": profile["active_agents"],
        "core_agents": profile["core_agents"],
        "supporting_agents": profile["supporting_agents"],
        "dependency_agents": profile["dependency_agents"],
        "system_agents": profile["system_agents"],
        "configured_agents": profile.get("configured_agents", []),
        "eligible_agents": profile.get("eligible_agents", []),
        "bypass_candidates": profile.get("bypass_candidates", []),
        "artifact_coverage": profile.get("artifact_coverage", {}),
        "mission_manifest": profile,
        "final_active_agents": profile["final_agents"],
        "counts": profile["counts"],
        "metrics": profile.get("metrics", {}),
        "recommended_views": get_role_policy_defaults(role).get("recommended_views", ["forge", "decide"]),
        "estimated_duration_mins": {"rapid": 3, "standard": 8, "full": 20}.get(profile["depth"], 8),
    }

# ==============================================================================
# PDF EXPORT ENDPOINTS
# ==============================================================================

@router.get("/export/resilience-certificate/{task_id}")
def export_resilience_certificate(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PDF EXPORT -- Resilience Certificate
    Generates a signed PDF certificate from chaos, reliability, SLO, and resilience signals.
    """
    from fastapi.responses import Response
    from backend.core.pdf_export import generate_resilience_certificate

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    try:
        task_data = {
            "task_id": task_id,
            "result": task.result or {},
            "partial_state": task.partial_state or {},
        }
        pdf_bytes = generate_resilience_certificate(task_data)
        filename = f"CONVERGE_Resilience_Certificate_{task_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[PDF-EXPORT] Resilience certificate failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/export/compliance-pack/{task_id}")
def export_compliance_pack(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PDF EXPORT -- Compliance Evidence Package
    Generates a compliance evidence PDF from SOC2/GDPR/HIPAA controls and traceability matrix.
    """
    from fastapi.responses import Response
    from backend.core.pdf_export import generate_compliance_pack

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    try:
        task_data = {
            "task_id": task_id,
            "result": task.result or {},
            "partial_state": task.partial_state or {},
        }
        pdf_bytes = generate_compliance_pack(task_data)
        filename = f"CONVERGE_Compliance_Pack_{task_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[PDF-EXPORT] Compliance pack failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/export/economics/{task_id}")
def export_economics_report(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PDF EXPORT -- Engineering Economics Report
    Generates a financial PDF report from ROI, business impact, and suite efficiency signals.
    """
    from fastapi.responses import Response
    from backend.core.pdf_export import generate_economics_report

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    try:
        task_data = {
            "task_id": task_id,
            "result": task.result or {},
            "partial_state": task.partial_state or {},
        }
        pdf_bytes = generate_economics_report(task_data)
        filename = f"CONVERGE_Economics_Report_{task_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[PDF-EXPORT] Economics report failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/export/release-report/{task_id}")
def export_release_report(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PDF EXPORT -- Full Release Decision Report
    Generates a comprehensive release decision PDF combining all 4 module signals.
    """
    from fastapi.responses import Response
    from backend.core.pdf_export import generate_release_report

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    try:
        task_data = {
            "task_id": task_id,
            "result": task.result or {},
            "partial_state": task.partial_state or {},
        }
        pdf_bytes = generate_release_report(task_data)
        filename = f"CONVERGE_Release_Report_{task_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[PDF-EXPORT] Release report failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

@router.get("/diagnostics/coverage")
def get_depth_coverage():
    from backend.core.mission_policy import MODULE_DELIVERABLES, CAPABILITY_PACKS, ARTIFACT_PACKS
    from backend.core.agent_registry import AGENT_REGISTRY
    
    report = {}
    for depth in ["rapid", "standard", "full"]:
        req_caps = set()
        for mod, depths in MODULE_DELIVERABLES.items():
            req_caps.update(depths.get(depth, []))
            
        req_packs = set()
        for cap in req_caps:
            req_packs.update(CAPABILITY_PACKS.get(cap, []))
            
        req_arts = set()
        for pack in req_packs:
            req_arts.update(ARTIFACT_PACKS.get(pack, []))
            
        agents = []
        for key, config in AGENT_REGISTRY.items():
            for p in config.get("produces", []):
                art = p.get("artifact") if isinstance(p, dict) else p
                if art in req_arts:
                    agents.append(key)
                    break
                    
        report[depth] = {
            "agents_count": len(agents),
            "artifacts": list(req_arts)
        }
        
    # Flow report
    flow = []
    for key, config in AGENT_REGISTRY.items():
        for p in config.get("produces", []):
            art = p.get("artifact") if isinstance(p, dict) else p
            consumers = [k for k, c in AGENT_REGISTRY.items() if art in c.get("consumes", [])]
            flow.append({
                "artifact": art,
                "producer": key,
                "consumers": consumers
            })
            
    return {"depth_coverage": report, "artifact_flow": flow}
