"""
AGENT GENERATION TASKS
Handles asynchronous Test Plan generation and status polling for the UI.
"""
from aiohttp import request
import hashlib
import logging
import uuid
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session
from backend.api.models import GenerateRequest, ExecutionContext, Phase1ApprovalBody, Phase2ApprovalBody
from backend.core.config import settings
from backend.core.database import get_db, GenerationTask
from backend.core.runtime_state import get_runtime_session_id, task_runtime_session
from backend.agents.state import LogLevel
from backend.core.mission_models import MissionArtifact, ArtifactStatus
from backend.services.mission_service import MissionService
from backend.core.auth_models import User
from backend.api.routes.auth import get_current_user, verify_task_ownership

# --- CENTRAL MASTER AGENT REGISTRY (44-NODE MESH DEFINITION) ---
# Alignment: Synchronized with frontend/src/agentsList.ts 
# This serves as the 'Source of Truth' for all mesh topology and UI visualization.
from backend.api.routes.tools import evaluate_readiness

from backend.core.agent_registry import AGENT_REGISTRY
MASTER_AGENTS = [
    {
        "id": config["id"],
        "label": config["label"],
        "agent": str(i).zfill(2),
        "key": key
    }
    for i, (key, config) in enumerate(AGENT_REGISTRY.items())
]

DEPTH_NODE_PRESETS = {
    "rapid": {
        "ingestor", "clarifier", "synthesis_initial", "governor", "planning_agent",
        "logician", "architect", "api_design", "db_schema", "engineering_contract", "tdd_contract",
        "creator", "data_builder", "api_mock", "auditor",
        "lifecycle", "automation_forge", "api_coder", "self_healing", "visual_intel",
        "microservices", "agent_2", "regression", "run_orchestrator", "env_provisioner",
    },
    "standard": {
        "ingestor", "clarifier", "synthesis_initial", "governor", "planning_agent",
        "logician", "architect", "api_design", "db_schema", "engineering_contract", "tdd_contract",
        "creator", "data_builder", "api_mock", "auditor",
        "lifecycle", "automation_forge", "api_coder", "self_healing", "visual_intel",
        "microservices", "agent_2", "regression", "run_orchestrator", "env_provisioner",
        "api_validation", "test_impact", "performance", "delivery", "chaos",
        "mobile_testing", "graphql_validator", "feature_flag", "monitor", "slo",
        "tracing", "reliability_engineering", "cross_browser", "data_pipeline",
        "suite_optimization", "digital_twin", "compliance_remediation", "event_driven",
        "ux_intelligence", "env_consistency",
    },
    "full": {
        "ingestor", "clarifier", "synthesis_initial", "governor", "planning_agent",
        "logician", "architect", "api_design", "db_schema", "engineering_contract", "tdd_contract",
        "creator", "data_builder", "api_mock", "auditor",
        "lifecycle", "automation_forge", "api_coder", "self_healing", "visual_intel",
        "microservices", "agent_2", "regression", "run_orchestrator", "env_provisioner",
        "api_validation", "test_impact", "performance", "delivery", "chaos",
        "mobile_testing", "graphql_validator", "feature_flag", "monitor", "slo",
        "tracing", "reliability_engineering", "cross_browser", "data_pipeline",
        "suite_optimization", "digital_twin", "compliance_remediation", "event_driven",
        "ux_intelligence", "env_consistency", "security", "perf_intel", "obs_intel",
        "rca_intel", "inc_remed", "sys_resil", "rel_risk", "biz_impact", "roi_intel",
        "knowledge_graph", "meta_intel", "exploratory", "locator", "migration",
        "mutation", "i18n_testing", "release_commander", "trend_analyst", "synthesis_final",
    },
}

PHASE_2_REQUIRED_KEYS = {"writer", "synthesis_final"}
ALL_AGENT_KEYS = sorted(
    {
        a["key"] for a in MASTER_AGENTS
    }
    | DEPTH_NODE_PRESETS["full"]
    | PHASE_2_REQUIRED_KEYS
)

def _normalize_agent_mode(value):
    if value is False:
        return "bypass"
    if value is True:
        return "auto"
    mode = str(value or "").lower().strip()
    if mode in {"auto", "manual", "bypass"}:
        return mode
    return "bypass"

def _build_depth_baseline(depth: str) -> dict:
    preset = DEPTH_NODE_PRESETS.get((depth or "standard").lower(), DEPTH_NODE_PRESETS["standard"])
    return {key: ("auto" if key in preset else "bypass") for key in ALL_AGENT_KEYS}

def _sanitize_active_agents(active_agents: dict | None) -> dict:
    sanitized = {}
    for raw_key, raw_value in (active_agents or {}).items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        canonical = key if key in ALL_AGENT_KEYS else key.lower()
        if canonical not in ALL_AGENT_KEYS:
            continue
        sanitized[canonical] = _normalize_agent_mode(raw_value)
    return sanitized

def _resolve_active_agents(req: GenerateRequest, restored_surface: dict | None = None) -> dict:
    try:
        from backend.core.mission_policy import build_mission_profile, VALID_MODULES
        module_name = str(getattr(req, "module", "") or "").strip().lower()
        if module_name == "all":
            modules = list(VALID_MODULES)
        else:
            modules = [module_name] if module_name else None
        profile = build_mission_profile(req.role, modules, req.depth, restored_surface=restored_surface)
        baseline = dict(profile.get("active_agents", {}))
    except Exception as profile_error:
        logger.warning(f"[AGENT-SURFACE] Mission profile fallback: {profile_error}")
        baseline = _build_depth_baseline(req.depth or "standard")

    provided = _sanitize_active_agents(req.active_agents)
    if provided:
        baseline.update(provided)
    return baseline

def _apply_mission_guards(resolved_agents: dict, mission_intent: str | None) -> dict:
    guarded = dict(resolved_agents or {})
    if mission_intent == "PHASE_1":
        guarded["run_orchestrator"] = "bypass"
        guarded["suite_optimization"] = "bypass"
    if mission_intent in ("PHASE_2", "PHASE_3", "PHASE_4"):
        for key in PHASE_2_REQUIRED_KEYS:
            guarded[key] = "auto"
    return guarded


def _build_phase_2_execution_audit(task: GenerationTask, mission_id: int, result_state: dict | None = None, final_result: dict | None = None, status: str = "COMPLETED", error_message: str | None = None) -> dict:
    partial_state = task.partial_state if isinstance(task.partial_state, dict) else {}
    active_agents = task.active_agents if isinstance(task.active_agents, dict) else {}

    bypass_evaluations = {}
    if isinstance(partial_state.get("bypass_evaluations"), dict):
        bypass_evaluations.update(partial_state.get("bypass_evaluations", {}))
    if isinstance(partial_state.get("bypass_evaluation"), dict):
        single = partial_state.get("bypass_evaluation", {})
        agent_name = str(single.get("agent") or single.get("agent_name") or "unknown").strip() or "unknown"
        bypass_evaluations.setdefault(agent_name, single)

    configured_agents = sorted([str(agent).strip() for agent in active_agents.keys() if str(agent).strip()])
    eligible_agents = sorted([
        str(agent).strip()
        for agent, mode in active_agents.items()
        if str(agent).strip() and _normalize_agent_mode(mode) != "bypass"
    ])
    bypassed_agents = sorted(set(bypass_evaluations.keys()) | {
        str(agent).strip()
        for agent, mode in active_agents.items()
        if str(agent).strip() and _normalize_agent_mode(mode) == "bypass"
    })

    executed_agents = partial_state.get("executed_agents")
    if not isinstance(executed_agents, list) or not executed_agents:
        executed_agents = [agent for agent in configured_agents if agent not in bypassed_agents]

    bypass_reasons = {}
    for agent_name, payload in bypass_evaluations.items():
        if isinstance(payload, dict):
            bypass_reasons[agent_name] = payload.get("reason")
        else:
            bypass_reasons[agent_name] = str(payload)

    final_state = {}
    if isinstance(final_result, dict):
        full_state = final_result.get("full_state", {})
        if isinstance(full_state, dict):
            final_state = full_state

    audit = {
        "phase": 2,
        "mission_id": mission_id,
        "task_id": task.task_id,
        "status": status,
        "configured_agents": configured_agents,
        "eligible_agents": eligible_agents,
        "executed_agents": executed_agents,
        "bypassed_agents": bypassed_agents,
        "bypass_reasons": bypass_reasons,
        "active_agents_snapshot": active_agents,
        "error_message": error_message or "",
        "creator_context_audit": partial_state.get("creator_context_audit") or final_state.get("creator_context_audit"),
        "workflow_structural_audit": partial_state.get("workflow_structural_audit") or final_state.get("workflow_structural_audit"),
        "clarified_workflows": partial_state.get("workflow_modules") or final_state.get("workflow_modules"),
        "resolved_surface": partial_state.get("resolved_surface") or final_state.get("resolved_surface"),
        "traceability_map_size": len(partial_state.get("traceability_map") or final_state.get("traceability_map") or []),
        "result_summary": {
            "has_download_url": bool((result_state or {}).get("download_url") or (final_result or {}).get("download_url")),
            "has_markdown_preview": bool((result_state or {}).get("markdown_preview") or (final_result or {}).get("markdown_preview")),
            "has_analysis_payload": bool((result_state or {}).get("analysis_payload") or (final_result or {}).get("analysis_payload")),
        },
    }
    return {key: value for key, value in audit.items() if value not in (None, "", [], {}) or key in {"phase", "mission_id", "task_id", "status"}}


def _persist_phase_2_execution_audit(db: Session, task: GenerationTask, mission_id: int, result_state: dict | None = None, final_result: dict | None = None, status: str = "COMPLETED", error_message: str | None = None) -> dict | None:
    if not mission_id or not task:
        return None

    audit_payload = _build_phase_2_execution_audit(
        task=task,
        mission_id=mission_id,
        result_state=result_state,
        final_result=final_result,
        status=status,
        error_message=error_message,
    )

    task.partial_state = {**(task.partial_state or {}), "phase_execution_audit": audit_payload}
    db.flush()

    artifact = MissionService.save_artifact(
        db,
        mission_id,
        "system",
        "PHASE_2_EXECUTION_AUDIT",
        audit_payload,
        producer_version=settings.VERSION,
    )
    artifact.artifact_status = ArtifactStatus.APPROVED if status == "COMPLETED" else ArtifactStatus.FAILED
    db.commit()
    return audit_payload


def _task_mission_metrics(task: GenerationTask, db: Session) -> dict:
    if task and task.mission_id:
        try:
            from backend.core.mission_models import Mission
            mission = db.query(Mission).filter(Mission.id == task.mission_id).first()
            if mission:
                return {
                    "configured_agents_count": mission.configured_agents_count or mission.total_agents or 0,
                    "eligible_agents_count": mission.eligible_agents_count or mission.total_agents or 0,
                    "executed_agents_count": mission.executed_agents_count or 0,
                    "bypassed_agents_count": mission.bypassed_agents_count or 0,
                    "failed_agents_count": mission.failed_agents_count or mission.failed_agents or 0,
                    "artifact_coverage": mission.artifact_coverage or {},
                    "mission_manifest": mission.mission_manifest or {},
                }
        except Exception:
            pass

    active_agents = task.active_agents or {}
    configured = len([v for v in active_agents.values() if v not in (False, "bypass")])
    bypassed = len([v for v in active_agents.values() if v in (False, "bypass")])
    return {
        "configured_agents_count": configured,
        "eligible_agents_count": configured,
        "executed_agents_count": 0,
        "bypassed_agents_count": bypassed,
        "failed_agents_count": 0,
        "artifact_coverage": {},
        "mission_manifest": {},
    }
# V3.6.0-LIBERATED: AGENT MESH STABILIZATION
from backend.core.database import get_db, GenerationTask

def make_serializable(data):
    """
    ARCHITECTURE: V3.6.0 NUCLEAR SERIALIZER
    Logic: Recursive coercion with terminal string fallback.
    """
    import json
    def scrub(obj):
        if isinstance(obj, (list, tuple, set)): return [scrub(i) for i in obj]
        if isinstance(obj, dict):
            forbidden = {"sources", "config", "token", "auth", "session"}
            return {k: scrub(v) for k, v in obj.items() if k not in forbidden}
        if hasattr(obj, "dict") and callable(getattr(obj, "dict")): return scrub(obj.dict())
        if hasattr(obj, "model_dump") and callable(getattr(obj, "model_dump")): return scrub(obj.model_dump(mode='json'))
        if isinstance(obj, (str, int, float, bool)) or obj is None: return obj
        return str(obj)

    try:
        return json.loads(json.dumps(scrub(data), default=str))
    except Exception as e:
        logger.error(f"[SERIALIZER] V3.4.7 Critical Recovery: {e}")
        return {"error": "Native Serializer Collision"}

# --- FRAMEWORK REGISTRIES (TIER & ROLE COMPOSITION) ---
# Logic: These registries define the 'Allowed Mesh Surface' for different stakeholders.
from backend.core.phase_registry import PHASE_DEFINITIONS

# Extract legacy INGEST_NODES equivalent from Phase 1 Definition for Role mapping
INGEST_NODES = PHASE_DEFINITIONS[1]["nodes"]
FORGE_NODES = [
    "creator", "data_builder", "api_mock", "automation_forge", "api_coder", "migration", 
    "cross_browser", "mobile_testing", "visual_intel", "run_orchestrator", "delivery", 
    "feature_flag", "mutation", "env_provisioner", "digital_twin", "env_consistency", 
    "performance", "chaos", "security", "microservices", "tracing", "data_pipeline", "event_driven"
]
OPERATIONS_NODES = ["release_commander", "trend_analyst"]
CERTIFY_NODES = [
    "critic", "auditor", "governor", "rel_risk", "compliance_remediation", "rca_intel", 
    "inc_remed", "obs_intel", "self_healing", "locator", "suite_optimization", "reliability_eng", 
    "slo", "ux_intelligence", "perf_intel", "obs_intelligence", "sys_resilience", "i18n_testing"
]
DECIDE_NODES = ["rel_risk", "biz_impact", "roi_intel", "knowledge_graph", "meta_intel", "synthesis_optimizer", "synthesis_final", "writer", "exploratory"] + OPERATIONS_NODES

# Role Mapping: Defines the default 'Mesh Visibility' for each stakeholder profile
ROLE_REGISTRY = {
    "qa_engineer": INGEST_NODES + FORGE_NODES,
    "sdet": FORGE_NODES,
    "qa_lead": INGEST_NODES + FORGE_NODES + CERTIFY_NODES,
    "manager": DECIDE_NODES + OPERATIONS_NODES,
    "ciso": CERTIFY_NODES,
    "cto": DECIDE_NODES + OPERATIONS_NODES
}

router = APIRouter(prefix="/api/tasks", tags=["Agent Workflow"])
logger = logging.getLogger(__name__)

from pydantic import BaseModel
from backend.api.models import FetchSource

class ClassifyRequest(BaseModel):
    sources: list[FetchSource]
    context: str = ""

@router.post("/classify")
async def classify_input(req: ClassifyRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PRE-FLIGHT CLASSIFICATION
    Fetches raw inputs and determines if it's a full_prd, feature_request, bug_report, or fragment_insufficient.
    """
    from backend.core.fetcher_factory import FetcherFactory
    from backend.core.inference import InferenceCoordinator
    from backend.agents.nodes.intelligence import robust_json_loads
    
    combined_prd = req.context or ""
    if req.sources:
        for s in req.sources:
            if not s.ticket_id:
                continue
            platform = getattr(s, "platform", "directpaste").lower()
            if platform in ("directpaste", "fileupload"):
                combined_prd += "\n\n" + s.ticket_id
            else:
                try:
                    fetcher = FetcherFactory.get_fetcher(
                        platform=platform,
                        url=s.config.url if hasattr(s, "config") and s.config else None,
                        email=s.config.email if hasattr(s, "config") and s.config else None,
                        token=s.config.token if hasattr(s, "config") and s.config else None
                    )
                    data = fetcher.fetch(s.ticket_id)
                    if data:
                        combined_prd += f"\n\n--- Source: {platform.upper()} ({s.ticket_id}) ---\n"
                        combined_prd += f"Title: {data.get('summary', '')}\n\n"
                        combined_prd += f"Description:\n{data.get('description', '')}\n\n"
                        if data.get('acceptance_criteria'):
                            combined_prd += f"Acceptance Criteria:\n" + "\n".join(f"- {ac}" for ac in data['acceptance_criteria'])
                except Exception as e:
                    logger.error(f"[CLASSIFY-FETCH] Failed to fetch {s.ticket_id} from {platform}: {e}")
                    combined_prd += f"\n\n[ERROR: Failed to fetch {s.ticket_id} from {platform}: {e}]"

    combined_prd = combined_prd.strip()
    if not combined_prd:
        return {"input_type": "fragment_insufficient", "confidence": "high", "reasoning": "Input is completely empty."}

    prompt = f"""Classify this input text. Return JSON only:
{{
  "input_type": "full_prd" | "feature_request" | "bug_report" | "fragment_insufficient",
  "confidence": "high" | "medium" | "low",
  "reasoning": "one sentence"
}}

Text:
{combined_prd}
"""
    try:
        def dummy_log(*args, **kwargs): pass
        content = InferenceCoordinator.execute('Enterprise Requirements Analyst', 'Input Classification', 'System', prompt, dummy_log, "classify_task")
        import re
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
            content = content.strip()
        
        result = robust_json_loads(content)
        return {
            "input_type": result.get("input_type", "fragment_insufficient"),
            "confidence": result.get("confidence", "low"),
            "reasoning": result.get("reasoning", "Fallback parsing applied.")
        }
    except Exception as e:
        logger.error(f"[CLASSIFY] Failed to classify: {e}")
        return {"input_type": "fragment_insufficient", "confidence": "low", "reasoning": "Classification error."}

@router.post("/generate")
async def kickoff_generation_task(
    request: Request,
    req: GenerateRequest, 
    background_tasks: BackgroundTasks, 
    mission_intent: str = None, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    NON-BLOCKING WORKFLOW DISPATCHER
    """
    task_id = str(uuid.uuid4())
    print('DEBUG TYPE DB:', type(db))
    print('DEBUG TYPE CURRENT_USER:', type(current_user))
    print('DEBUG CURRENT_USER:', current_user)
    logger.info(f"[DISPATCHER] Starting Task: {task_id} (Intent: {mission_intent})")
    
    try:
        # --- PHASE-AWARE MESH COMPOSITION (V5.6) ---
        # Logic: honor the user's explicit mesh selection when provided, and
        # fall back to a depth baseline when the payload does not include a
        # registry map. Depth is the default execution surface; manual registry
        # selections widen that surface.
        restored_surface = None
        if mission_intent == "PHASE_2" and req.parent_task_id:
            parent_task = db.query(GenerationTask).filter(GenerationTask.task_id == req.parent_task_id).first()
            if parent_task and isinstance(parent_task.partial_state, dict):
                restored_surface = parent_task.partial_state.get("resolved_surface")

        resolved_agents = _apply_mission_guards(_resolve_active_agents(req, restored_surface), mission_intent)
        try:
            from backend.core.mission_policy import build_mission_profile
            surface_modules = [req.module] if req.module and str(req.module).strip().lower() != "all" else None
            execution_surface = build_mission_profile(req.role, surface_modules, req.depth, restored_surface=restored_surface)
        except Exception as surface_error:
            logger.warning(f"[MISSION-SURFACE] Could not build execution surface: {surface_error}")
            execution_surface = {
                "active_agents": resolved_agents,
                "final_agents": [k for k, v in resolved_agents.items() if v not in (False, "bypass")],
                "configured_agents": [k for k, v in resolved_agents.items() if v not in (False, "bypass")],
                "dependency_expansion": [],
                "execution_groups": [],
                "telemetry": {
                    "budget": len(resolved_agents),
                    "selected": len([k for k, v in resolved_agents.items() if v not in (False, "bypass")]),
                    "dependency_added": 0,
                    "group_added": 0,
                    "bypassed": len([k for k, v in resolved_agents.items() if v in (False, "bypass")]),
                },
            }
        enabled_agents = sorted([k for k, v in resolved_agents.items() if v not in (False, "bypass")])
        bypassed_agents = sorted([k for k, v in resolved_agents.items() if v in (False, "bypass")])

        # Merge the user's manual choices into the execution surface
        if execution_surface:
            execution_surface["active_agents"] = resolved_agents
            execution_surface["final_agents"] = enabled_agents
            execution_surface["configured_agents"] = enabled_agents
            if "telemetry" in execution_surface:
                execution_surface["telemetry"]["selected"] = len(enabled_agents)
                execution_surface["telemetry"]["bypassed"] = len(bypassed_agents)
            if "counts" in execution_surface:
                execution_surface["counts"]["final"] = len(enabled_agents)
                execution_surface["counts"]["executed"] = len(enabled_agents)
                execution_surface["counts"]["bypassed"] = len(bypassed_agents)

        logger.info(
            "[MISSION-SURFACE] task=%s intent=%s module=%s enabled=%s bypassed=%s",
            task_id,
            mission_intent,
            getattr(req, "module", None),
            enabled_agents[:20],
            bypassed_agents[:20],
        )

        new_task = GenerationTask(
            task_id=task_id, 
            status="PENDING", 
            logs=[],
            active_agents=resolved_agents,
            mission_intent=mission_intent,
            min_log_level=req.min_log_level if req.min_log_level is not None else 3,
            partial_state={"runtime_session_id": get_runtime_session_id(), "resolved_surface": execution_surface},
            created_by=current_user.id
        )
        db.add(new_task)
        db.commit()

        # Mark the task as processing immediately so the UI does not sit in a
        # long-lived PENDING state if the background worker takes a moment to start.
        new_task.status = "PROCESSING"
        db.commit()
        
        # Mission Persistence Integration
        input_payload = req.model_dump(mode='json') if hasattr(req, "model_dump") else req.dict()
        total_agents = len([a for a in resolved_agents.values() if a not in (False, "bypass")])
        
        mission_id = None
        if req.parent_task_id:
            parent_task = db.query(GenerationTask).filter(GenerationTask.task_id == req.parent_task_id).first()
            if parent_task and parent_task.mission_id:
                mission = MissionService.attach_phase_to_mission(
                    db=db, 
                    mission_id=parent_task.mission_id, 
                    phase=mission_intent or "PHASE_UNKNOWN", 
                    additional_agents=total_agents
                )
                if mission:
                    mission_id = mission.id

        if not mission_id:
            # Generate deterministic requirement hash for regression tracking
            req_hash = None
            if hasattr(req, "context") and req.context:
                import re
                normalized = str(req.context).strip().lower().replace('\r\n', '\n')
                normalized = re.sub(r'\s+', ' ', normalized)
                req_hash = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
                
            
            # Compute Readiness and Risk Snapshot
            readiness_eval = evaluate_readiness(req.execution_context, req.execution_mode.value if hasattr(req.execution_mode, 'value') else req.execution_mode)
            risk_level_snapshot = readiness_eval["risk_level_snapshot"]
            execution_readiness = readiness_eval["readiness"]

            # Store execution targets structure for multi-target future proofing
            execution_targets = None
            if req.execution_context:
                execution_targets = {
                    "urls": [url for url in [
                        str(req.execution_context.application_url) if req.execution_context.application_url else None, 
                        str(req.execution_context.api_base_url) if req.execution_context.api_base_url else None
                    ] if url],
                    "repositories": [str(req.execution_context.repository_url)] if req.execution_context.repository_url else []
                }

            mission = MissionService.create_mission(
                db=db,
                user_id=current_user.id,
                mission_name=getattr(req, 'mission_name', None) or getattr(req, 'module', None) or "Unnamed Mission",
                mission_type=mission_intent or "PHASE_1",
                execution_depth=req.depth or "standard",
                input_payload=input_payload,
                total_agents=total_agents,
                configured_agents_count=total_agents,
                eligible_agents_count=total_agents,
                executed_agents_count=0,
                bypassed_agents_count=0,
                failed_agents_count=0,
                requirement_hash=req_hash,
                correlation_id=getattr(request.state, "correlation_id", None),
                execution_mode=req.execution_mode.value if hasattr(req.execution_mode, 'value') else req.execution_mode,
                created_from_context=True if req.execution_context else False,
                execution_context=req.execution_context.model_dump(mode='json') if req.execution_context else None,
                execution_readiness=execution_readiness,
                risk_level_snapshot=risk_level_snapshot
            )
            # Update targets post-creation since it's not in create_mission signature yet (or add it above)
            mission.execution_targets = execution_targets
            mission.mission_manifest = {**(mission.mission_manifest or {}), "resolved_surface": execution_surface}
            db.commit()
            
            mission_id = mission.id
            
        new_task.mission_id = mission_id
        db.commit()
        
        # Action: Trigger the asynchronous reasoning loop.
        if mission_intent == "PHASE_1":
            from backend.core.fetcher_factory import FetcherFactory
            combined_prd = req.context or ""
            if hasattr(req, 'sources') and req.sources:
                for s in req.sources:
                    if not s.ticket_id:
                        continue
                    platform = getattr(s, "platform", "directpaste").lower()
                    if platform in ("directpaste", "fileupload"):
                        combined_prd += "\n\n" + s.ticket_id
                    else:
                        try:
                            fetcher = FetcherFactory.get_fetcher(
                                platform=platform,
                                url=s.config.url if hasattr(s, "config") and s.config else None,
                                email=s.config.email if hasattr(s, "config") and s.config else None,
                                token=s.config.token if hasattr(s, "config") and s.config else None
                            )
                            data = fetcher.fetch(s.ticket_id)
                            if data:
                                combined_prd += f"\n\n--- Source: {platform.upper()} ({s.ticket_id}) ---\n"
                                combined_prd += f"Title: {data.get('summary', '')}\n\n"
                                combined_prd += f"Description:\n{data.get('description', '')}\n\n"
                                if data.get('acceptance_criteria'):
                                    combined_prd += f"Acceptance Criteria:\n" + "\n".join(f"- {ac}" for ac in data['acceptance_criteria'])
                        except Exception as e:
                            logger.error(f"[FETCH] Failed to fetch source {s.ticket_id} from {platform}: {e}")
                            combined_prd += f"\n\n[ERROR: Failed to fetch {s.ticket_id} from {platform}: {e}]"
            background_tasks.add_task(execute_phase_1_mission, task_id, mission_id, combined_prd.strip())
        else:
            background_tasks.add_task(run_agent_workflow_logic, task_id, req, req.parent_task_id, mission_id)
        
        # Return resolved active_agents so the UI can sync immediately
        return {"task_id": task_id, "status": "PENDING", "active_agents": resolved_agents}
    except Exception as e:
        logger.error(f"[DISPATCHER-ERROR] Failed to initialize task: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to initialize generation task.")

@router.post("/orchestrate/phase1")
async def kickoff_phase1_task(
    request: Request,
    req: GenerateRequest, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    HITL PHASE 1: THE ORCHESTRATION CORE
    """
    # VERIFICATION SIGNATURE: If this doesn't show up in logs, you are NOT running V3.0
    logger.info("[VERIFICATION] PHASE 1 TRIGGERED ON V3.0 ENGINE")
    return await kickoff_generation_task(request=request, req=req, background_tasks=background_tasks, mission_intent="PHASE_1", db=db, current_user=current_user)

@router.post("/orchestrate/phase2")
async def kickoff_phase2_task(
    request: Request,
    req: GenerateRequest, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    HITL PHASE 2: THE ACTIONABLE FACTORY

    Accepts either:
    - A context string prefixed with "PRIMARY REQUIREMENT CONTRACT (REFINED):" (legacy HITL flow)
    - Any non-empty context string (CONVERGE mission approval flow)
    - A parent_task_id pointing to a completed Phase 1 task (context restored from DB)
    """
    # Guard: need EITHER a non-empty context OR a parent_task_id to restore from
    has_context = bool(req.context and req.context.strip())
    has_parent  = bool(req.parent_task_id and str(req.parent_task_id).strip())

    if not has_context and not has_parent:
        raise HTTPException(
            status_code=400,
            detail="Phase 2 requires either an approved context contract or a parent_task_id from Phase 1."
        )

    # If context is missing but parent_task_id is set, restore context from the parent task
    if not has_context and has_parent:
        from backend.core.database import SessionLocal, GenerationTask as GT
        with SessionLocal() as db_inner:
            parent = db_inner.query(GT).filter(GT.task_id == req.parent_task_id).first()
            if parent and parent.result:
                current_runtime_id = get_runtime_session_id()
                parent_runtime_id = task_runtime_session(parent)
                if current_runtime_id and parent_runtime_id and parent_runtime_id != current_runtime_id:
                    raise HTTPException(
                        status_code=409,
                        detail="Parent mission belongs to a previous runtime session. Start a fresh Phase 1 mission before resuming."
                    )
                md = parent.result.get("markdown_preview", "")
                if md:
                    req = req.model_copy(update={
                        "context": f"PRIMARY REQUIREMENT CONTRACT (REFINED):\n{md}"
                    })

    return await kickoff_generation_task(request=request, req=req, background_tasks=background_tasks, mission_intent="PHASE_2", db=db, current_user=current_user)


@router.post("/approve-contract/{task_id}")
async def approve_engineering_contract(
    request: Request,
    task_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"[DEPRECATED] approve-contract called for {task_id} — update frontend to use phase-specific endpoints")
    raise HTTPException(
        status_code=410,
        detail="This endpoint is deprecated. Use /missions/{id}/approve/phase2 instead."
    )

from fastapi import Body

@router.get("/missions/{mission_id}/resume-state")
async def get_resume_state(mission_id: str, db: Session = Depends(get_db)):
    from backend.core.mission_controller import mission_controller, MissionStatus
    
    current_status = await mission_controller.get_status(mission_id)
    if not current_status:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    def safe_load(phase):
        import asyncio
        try:
            # We must await the coroutine, but since we're in an async function we can just await it directly
            pass
        except Exception:
            return {}
            
    # Load phase outputs safely
    try:
        phase1_output = await mission_controller.load_phase_output(mission_id, 1)
    except Exception:
        phase1_output = {}
        
    try:
        phase2_output = await mission_controller.load_phase_output(mission_id, 2)
    except Exception:
        phase2_output = {}
        
    try:
        phase3_output = await mission_controller.load_phase_output(mission_id, 3)
    except Exception:
        phase3_output = {}
        
    try:
        phase4_output = await mission_controller.load_phase_output(mission_id, 4)
    except Exception:
        phase4_output = {}

    try:
        implementation_plan = await mission_controller.get_phase_output(mission_id, "implementation_plan")
    except Exception:
        implementation_plan = {}
        
    return {
        "status": current_status,
        "phase1_output": phase1_output,
        "phase2_output": phase2_output,
        "phase3_output": phase3_output,
        "phase4_output": phase4_output,
        "implementation_plan": implementation_plan
    }

@router.post("/missions/{mission_id}/hard-reset")
async def hard_reset_mission(mission_id: str):
    from backend.core.mission_controller import mission_controller
    logger.info(f"[RESET] Hard resetting mission {mission_id} (Soft Delete)")
    await mission_controller.soft_delete_mission(mission_id)
    return {"status": "success", "message": "Mission deleted"}

@router.post("/missions/{mission_id}/approve/phase1")
async def approve_phase1(mission_id: str, body: Phase1ApprovalBody, background_tasks: BackgroundTasks):
    from backend.core.mission_controller import mission_controller, MissionStatus
    import logging
    logger = logging.getLogger(__name__)
    from fastapi import HTTPException
    
    current_status = await mission_controller.get_status(mission_id)
    if current_status != MissionStatus.HITL1_PENDING:
        raise HTTPException(status_code=400, detail=f"Expected HITL1_PENDING, got {current_status}")
    
    await mission_controller.transition_status(mission_id, MissionStatus.PHASE1_APPROVED)
    logger.info(f"[HITL-1] Phase 1 approved for {mission_id} — status=PHASE1_APPROVED, dispatching Phase 2")
    
    # Save open questions / edits if any
    if body.resolved_questions:
        from backend.agents.state import write_partial_state, flush_partial_state
        write_partial_state(mission_id, {"open_questions": body.resolved_questions})
        flush_partial_state(mission_id)
    
    # Wrap in explicit error logger so any Phase 2 crash surfaces in server logs
    async def _run_phase2_with_logging():
        try:
            logger.info(f"[HITL-1] Background Phase 2 task STARTED for {mission_id}")
            await execute_phase_2_mission(mission_id)
            logger.info(f"[HITL-1] Background Phase 2 task COMPLETED for {mission_id}")
        except Exception as bg_exc:
            logger.error(
                f"[PHASE2-CRASH] Mission {mission_id} Phase 2 background task failed: {bg_exc}",
                exc_info=True
            )
    
    background_tasks.add_task(_run_phase2_with_logging)
    
    return {"status": "phase2_started", "mission_id": mission_id}


@router.post("/missions/{mission_id}/approve/phase2")
async def approve_phase2(mission_id: str):
    from backend.core.mission_controller import mission_controller, MissionStatus
    import logging
    import asyncio
    logger = logging.getLogger(__name__)
    from fastapi import HTTPException
    
    logger.info(f"[HITL-2] Approving Phase 2 for mission {mission_id}")
    
    # Verify current status is correct
    current_status = await mission_controller.get_status(mission_id)
    if current_status != MissionStatus.HITL2_PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve Phase 2 — mission is in {current_status}, expected HITL2_PENDING"
        )
    
    # Transition to approved and trigger Plan Generation
    await mission_controller.approve_phase2(mission_id)
    
    async def run_plan_generation():
        try:
            from backend.agents.graphs.plan_graph import build_plan_graph
            state = await mission_controller.get_mission_runtime(mission_id)
            if not state:
                state = {}
            state["mission_id"] = mission_id
            if "task_id" not in state:
                state["task_id"] = mission_id
            
            graph = build_plan_graph()
            final_state = await graph.ainvoke(
                state,
                config={"configurable": {"thread_id": str(mission_id)}}
            )
            state.update(final_state)
            await mission_controller.set_mission_runtime(mission_id, state)
            
            if final_state.get("status") == "FAILED":
                await mission_controller.transition_status(mission_id, MissionStatus.FAILED)
                
        except Exception as e:
            logger.error(f"[PLAN-CRASH] {mission_id}: {e}", exc_info=True)
            await mission_controller.transition_status(mission_id, MissionStatus.FAILED)
            
    asyncio.create_task(run_plan_generation())
    return {"status": "plan_generation_started"}

@router.post("/missions/{mission_id}/approve/phase3-plan")
async def approve_phase3_plan(mission_id: str, body: dict):
    from backend.core.mission_controller import mission_controller, MissionStatus
    import logging
    import asyncio
    logger = logging.getLogger(__name__)
    from fastapi import HTTPException
    
    logger.info(f"[HITL-3] Approving Plan and Starting Phase 3 forges for mission {mission_id}")
    
    current_status = await mission_controller.get_status(mission_id)
    
    if current_status == MissionStatus.PHASE3_RUNNING:
        logger.info(f"[HITL-3] Mission {mission_id} is already in PHASE3_RUNNING. Ignoring redundant approval.")
        return {"status": "already_running", "modules_approved": len(body.get("approved_modules", []))}
        
    if current_status not in [MissionStatus.PLAN_PENDING, MissionStatus.PLAN_APPROVED]:
        raise HTTPException(
            status_code=400,
            detail=f"Expected PLAN_PENDING or PLAN_APPROVED, got {current_status}"
        )
    
    approved_modules = body.get("approved_modules", [])
    plan_with_edits = body.get("plan", {})
    
    # Save the edited plan
    if plan_with_edits:
        mission_runtime = await mission_controller.get_mission_runtime(mission_id)
        mission_runtime["plan_json"] = plan_with_edits
        await mission_controller.set_mission_runtime(mission_id, mission_runtime)
    
    if not approved_modules:
        if plan_with_edits and "modules" in plan_with_edits:
            approved_modules = [m["module_id"] for m in plan_with_edits["modules"] if m.get("approved")]
            
    if not approved_modules:
        raise HTTPException(400, "No modules approved — approve at least one module")

    if current_status != MissionStatus.PLAN_APPROVED:
        # 1. Resume the planner graph so it officially finishes its node
        from backend.agents.graphs.plan_graph import build_plan_graph
        try:
            plan_graph_instance = build_plan_graph()
            await plan_graph_instance.ainvoke(None, config={"configurable": {"thread_id": str(mission_id)}})
        except Exception as e:
            logger.warning(f"[HITL-3] Error resuming plan_graph, continuing anyway: {e}")
            
        # 2. transition through PLAN_APPROVED to PHASE3_RUNNING
        await mission_controller.approve_phase3_plan(mission_id)
    
    # Step 2 — execute_phase_3_mission handles the actual forges
    async def run_phase3():
        try:
            await execute_phase_3_mission(mission_id, approved_modules=approved_modules)
        except Exception as e:
            logger.error(f"[PHASE3-CRASH] {mission_id}: {e}", exc_info=True)
            try:
                current = await mission_controller.get_status(mission_id)
                _terminal = (MissionStatus.FAILED, MissionStatus.PARTIAL_FAILURE, MissionStatus.MISSION_COMPLETE)
                if current not in _terminal:
                    await mission_controller.transition_status(mission_id, MissionStatus.FAILED)
                else:
                    logger.warning(f"[PHASE3-CRASH] Mission {mission_id} already terminal ({current}), skipping redundant transition")
            except Exception as te:
                logger.warning(f"[PHASE3-CRASH] Could not set FAILED: {te}")
    
    asyncio.create_task(run_phase3())
    return {"status": "phase3b_started", "modules_approved": len(approved_modules)}

@router.post("/missions/{mission_id}/plan/reject-module")
async def reject_plan_module(mission_id: str, body: dict):
    from backend.core.mission_controller import mission_controller
    import logging
    logger = logging.getLogger(__name__)
    
    module_id = body.get("module_id")
    reason = body.get("reason", "Rejected via UI")
    
    if not module_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="module_id is required")
        
    mission_runtime = await mission_controller.get_mission_runtime(mission_id)
    plan = mission_runtime.get("plan_json", {})
    
    updated = False
    if "modules" in plan:
        for m in plan["modules"]:
            if m.get("module_id") == module_id:
                m["approved"] = False
                m["_rejected"] = True
                m["developer_notes"] = reason
                updated = True
                break
                
    if updated:
        await mission_controller.set_mission_runtime(mission_id, mission_runtime)
        logger.info(f"[PLAN] Module {module_id} rejected for mission {mission_id}")
        return {"status": "success", "module_id": module_id}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found in plan")

@router.post("/missions/{mission_id}/tdd-resume")
async def resume_phase3_tdd(mission_id: str):
    from backend.core.mission_controller import mission_controller
    from backend.agents.graphs.phase3_graph import build_phase3_graph
    
    await mission_controller.transition_status(mission_id, "TDD_GREEN")
    
    thread_id = mission_controller.get_thread_id(mission_id, 3)
    phase3_graph = build_phase3_graph()
    
    # Run the graph in background or await it here. The prompt had it awaited.
    await phase3_graph.ainvoke(
        {"all_tests_green": True},
        config={"configurable": {"thread_id": thread_id}}
    )
    
    return {"status": "resumed", "mission_id": mission_id}

@router.post("/missions/{mission_id}/nfr-failed")
async def handle_nfr_failed(mission_id: str):
    from backend.core.mission_controller import mission_controller
    
    # 1. Records which audit domains failed in the DB (Here we could extract from the graph state, but for the endpoint we just trigger the transition and notification)
    # 2. Transitions status back to PHASE3_RUNNING
    await mission_controller.transition_status(mission_id, "PHASE3_RUNNING")
    
    # 3. Notifies the frontend to show Phase 3 panel with failure details (this is just the HTTP response for now)
    return {
        "status": "failed",
        "message": "NFR Audit failed. Mission reverted to Phase 3 for developer remediation.",
        "mission_id": mission_id
    }

@router.post("/approve-clarification/{task_id}")
async def approve_clarification(
    request: Request,
    task_id: str,
    background_tasks: BackgroundTasks,
    open_questions: list = Body(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    HITL PHASE 1: CLARIFICATION LOOP APPROVAL GATE
    Resumes the workflow after user provides clarification to the PRD gaps.
    """
    from backend.core.database import SessionLocal
    from sqlalchemy.orm.attributes import flag_modified

    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    verify_task_ownership(request, task, current_user)

    if task.status not in ("COMPLETED", "PROCESSING", "PENDING"):
        raise HTTPException(status_code=409, detail=f"Task cannot be approved in {task.status} state.")

    partial = dict(task.partial_state or {})
    if partial.get("clarification_approved") is True:
        return {"task_id": task_id, "status": "already_approved"}

    partial["clarification_approved"] = True
    partial["open_questions"] = open_questions
    task.partial_state = partial
    flag_modified(task, "partial_state")
    task.status = "PROCESSING"
    db.commit()

    logger.info("[HITL-APPROVE] clarification_approved=True persisted for task=%s", task_id)

    from backend.api.models import GenerateRequest
    restore_req = GenerateRequest(
        sources=partial.get("sources_snapshot", []),
        context=partial.get("additional_context", ""),
        depth=partial.get("depth", "standard"),
        role=partial.get("role", "qa_engineer"),
        execution_mode=partial.get("execution_mode", "full_execution"),
        active_agents=task.active_agents or {},
        parent_task_id=partial.get("parent_task_id"),
        state_overrides={"clarification_approved": True, "open_questions": open_questions},
    )

    background_tasks.add_task(
        run_agent_workflow_logic,
        task_id,
        restore_req,
        restore_req.parent_task_id,
        task.mission_id,
    )

    return {
        "task_id": task_id,
        "status": "approved",
        "message": "Clarification approved. Mesh is resuming.",
    }


@router.post("/reset/{task_id}")
def reset_stuck_task(request: Request, task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ISS-013 FIX: STUCK TASK RECOVERY ENDPOINT
    
    PURPOSE:
    Allows the UI to reset a task that is stuck in PENDING or PROCESSING state
    without requiring a server restart. Marks the task as FAILED with a clear
    user-facing message so the UI can offer a retry option immediately.
    
    SAFETY: Only resets tasks in PENDING or PROCESSING state.
    COMPLETED and FAILED tasks are left untouched.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    verify_task_ownership(request, task, current_user)
    
    if task.status not in ("PENDING", "PROCESSING"):
        return {
            "task_id": task_id,
            "status": task.status,
            "message": f"Task is already in terminal state '{task.status}'. No reset needed."
        }
    
    previous_status = task.status
    task.status = "FAILED"
    task.error = "Task manually reset by user. Please start a new run."
    
    # Flush any buffered partial state / logs so the UI gets a clean slate
    from sqlalchemy.orm.attributes import flag_modified
    task.partial_state = {}
    task.logs = []
    task.result = None
    flag_modified(task, "partial_state")
    flag_modified(task, "logs")
    from backend.agents.state import reset_runtime_buffers
    reset_runtime_buffers(task_id)
    db.commit()
    
    logger.info(f"[TASK-RESET] Task {task_id[:8]} manually reset from {previous_status} → FAILED by user request.")
    
    return {
        "task_id": task_id,
        "previous_status": previous_status,
        "status": "FAILED",
        "message": "Task has been reset. You can now start a new run."
    }



@router.post("/clear-session")
def clear_session(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    CLEAR SESSION: Wipes all active (PENDING/PROCESSING) tasks for the current user
    and flushes their runtime state buffers, giving a completely clean slate.
    Called when the user clicks the 'Clear Session' button in the UI.
    """
    from backend.agents.state import reset_runtime_buffers
    from sqlalchemy.orm.attributes import flag_modified

    active_tasks = (
        db.query(GenerationTask)
        .filter(
            GenerationTask.created_by == current_user.id,
            GenerationTask.status.in_(["PENDING", "PROCESSING"]),
        )
        .all()
    )

    cleared_ids = []
    for task in active_tasks:
        task.status = "FAILED"
        task.error = "Session cleared by user."
        task.partial_state = {}
        task.logs = []
        task.result = None
        flag_modified(task, "partial_state")
        flag_modified(task, "logs")
        try:
            reset_runtime_buffers(task.task_id)
        except Exception:
            pass
        cleared_ids.append(task.task_id[:8])

    db.commit()
    logger.info(
        f"[CLEAR-SESSION] User {current_user.username} cleared {len(cleared_ids)} active task(s): {cleared_ids}"
    )

    return {
        "status": "cleared",
        "tasks_cleared": len(cleared_ids),
        "message": f"Session cleared. {len(cleared_ids)} active task(s) terminated. Ready for a fresh mission.",
    }


@router.get("/registry")
async def get_agent_registry():
    """Returns the master AGENT_REGISTRY to power dynamic frontend rendering."""
    from backend.core.agent_registry import AGENT_REGISTRY
    return AGENT_REGISTRY


@router.get("/status/{task_id}")
async def get_task_execution_status(request: Request, task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Action: Polling endpoint for the Frontend's 'Reasoning Console'.
    Logic: Returns the task status, logs (monologues), and final results upon completion.
    ENHANCED: Returns dynamic mesh_topology based on log propagation and active agent configuration.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found in historical records.")
    verify_task_ownership(request, task, current_user)

    # Force-flush log_step / write_partial_state coalescing buffers so Phase 2
    # node logs reach the DB before this response is built.
    try:
        from backend.agents.state import flush_log_step, flush_partial_state
        flush_log_step(task_id)
        flush_partial_state(task_id)
        db.expire_all()
        task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    except HTTPException:
        raise
    except Exception as _fe:
        logger.warning(f"[STATUS-FLUSH] Buffer flush failed for {task_id}: {_fe}")

    # --- MASTER AGENT REGISTRY ---
    # We use the globally defined registry to ensure topology consistency.
    master_agents = list(MASTER_AGENTS)
    if task.mission_intent == "PHASE_2":
        master_agents.extend([
            {"id": "ServiceMesh", "label": "Service Mesh", "key": "service_mesh"},
            {"id": "DBArchitect", "label": "DB Architect", "key": "db_architect"}
        ])
    
    # Filter by user configuration (Show all requested OR essential core nodes)
    active_config = task.active_agents or {}
    mesh_nodes = []
    
    # Intelligence Filter Logic:
    # - Nodes explicitly set False are always hidden.
    # - Nodes explicitly set False are always hidden.
    # - Runtime-only placeholder nodes are hidden from topology.
    # - For PHASE_2, bypassed nodes are hidden to avoid false "pending" noise.
    from backend.core.phase_registry import PHASE_DEFINITIONS

    # Detect current phase from mission_status (reliable) rather than mission_intent
    # (which is always PHASE_1 on the task the frontend polls).
    _mission_status = ""
    if task.mission_id:
        try:
            from backend.core.database import SessionLocal as _SL
            from backend.core.mission_models import Mission as _Mission
            with _SL() as _db:
                _m = _db.query(_Mission).filter(_Mission.id == task.mission_id).first()
                if _m:
                    _val = _m.mission_status
                    _mission_status = getattr(_val, 'value', str(_val)) if _val else ""
        except Exception:
            pass

    _PHASE2_STATUSES = {"PHASE2_RUNNING", "HITL2_PENDING", "PHASE2_APPROVED",
                        "PHASE3_RUNNING", "TDD_GREEN", "PHASE4_RUNNING",
                        "NFR_GREEN", "PHASE5_RUNNING", "MISSION_COMPLETE"}
    current_phase = 2 if _mission_status in _PHASE2_STATUSES else 1
    phase_def = PHASE_DEFINITIONS.get(current_phase)
    ui_nodes = set(phase_def["ui_nodes"]) if phase_def else set()

    for agent_meta in master_agents:
        key = agent_meta["key"]
        
        mode = active_config.get(key)
        if mode is False:
            continue
        if key == "test_case_factory":
            continue
        if task.mission_intent == "PHASE_2" and mode == "bypass":
            continue

        node_copy = agent_meta.copy()
        node_copy["status"] = "bypassed" if mode == "bypass" else "pending"
        mesh_nodes.append(node_copy)

    # --- DYNAMIC STATUS PROPAGATION ---
    logs = task.logs or []
    logged_agents_set = set()
    for log in logs:
        agent_name = (log.get("agent") or "System").upper()
        logged_agents_set.add(agent_name)

    # Evidence-based completion support:
    # Orchestrated phase-2 runs can emit sparse per-node logs while still writing
    # node outputs into partial_state / result.full_state. Use these payloads to
    # avoid false "pending" statuses for successfully executed nodes.
    resolved_state = {}
    if isinstance(task.partial_state, dict):
        resolved_state.update(task.partial_state)
    if isinstance(task.result, dict):
        full_state = task.result.get("full_state")
        if isinstance(full_state, dict):
            resolved_state.update(full_state)
        for k in ("analysis_payload", "combined_data", "markdown_preview", "download_url", "filename"):
            if task.result.get(k) is not None:
                resolved_state[k] = task.result.get(k)

    def has_payload(value):
        if value is None:
            return False
        if isinstance(value, str):
            return len(value.strip()) > 0
        if isinstance(value, (list, dict, tuple, set)):
            return len(value) > 0
        return True

    evidence_keys = {
        # Phase 1 nodes
        "ingestor": ["raw_requirements", "combined_data"],
        "clarifier": ["clarified_requirements", "combined_data"],
        "planning_agent": ["engineering_tasks", "analysis_payload"],
        "lifecycle": ["mesh_topology"],
        "auditor": ["traceability_matrix"],
        "governor": ["compliance_report"],
        "synthesis_optimizer": ["combined_data"],
        "creator": ["test_cases"],
        "data_builder": ["test_data_samples"],
        "api_mock": ["mock_specs"],
        "api_validation": ["api_validation_config"],
        "performance": ["performance_config"],
        "security": ["security_signals"],
        "reliability_eng": ["reliability_eng"],
        "ux_intelligence": ["ux_intelligence_config"],
        "synthesis_final": ["final_synthesis"],
        "writer": ["markdown_preview", "download_url", "filename"],
        "agent_2": ["strategy_blueprint"],
        "env_provisioner": ["environment_config"],
        "run_orchestrator": ["execution_plan"],
        # Phase 2 nodes
        "architect": ["system_specification"],
        "logician": ["system_specification"],  # logician fans out; treat as done when spec arrives
        "service_mesh": ["visual_architecture"],
        "db_architect": ["db_schema_design"],
        "db_schema": ["db_schema_design"],
        "api_design": ["api_design_spec"],
        "engineering_contract": ["engineering_contract"],
        "tdd_contract": ["tdd_contracts"],
    }
    
    # Identify the current 'Hot Node' (active reasoning agent)
    active_agent_tags = set()
    for log in reversed(logs):
        agent_raw = (log.get("agent") or "System").upper().replace(" ", "").replace("_", "").replace("-", "")
        if agent_raw not in ["SYSTEM", "INFERENCEV7"]:
             active_agent_tags.add(agent_raw)
             # If it's a known parallel group (Frontend/Backend Forge), we can track both if they are recent
             if agent_raw in ["FRONTENDFORGE", "BACKENDFORGE", "CONTRACTOR"]:
                 if len(active_agent_tags) == 2:
                     break
                 continue
             break

    active_node_id = None
    for node in mesh_nodes:
        # Robust Alignment: Match by ID, Key, Label, and known aliases
        node_id_up = node["id"].upper().replace(" ", "").replace("-", "").replace("_", "")
        node_key_up = node["key"].upper().replace(" ", "").replace("-", "").replace("_", "")
        node_label_up = node["label"].upper().replace(" ", "").replace("-", "").replace("_", "")
        
        match_tags = {node_id_up, node_key_up, node_label_up}
        
        # Hardened alias map for legacy reasoning tags vs new nomenclature
        aliases = {
            "SLO": "SRE", "RELIABILITY": "TRE", "FEATUREFLAGS": "FEATUREFLAG",
            "MONITOR": "PRODMONITOR", "TWIN": "DIGITALTWIN", "OPTIMIZER": "SUITEOPTIMIZER",
            "REMEDIATION": "COMPLIANCEREMEDIATION", "VIRTUALIZER": "APIMOCK",
            "IMPACT": "TESTIMPACT", "FORGE": "AUTOMATIONFORGE", "CODER": "APICODER",
            "DELIVERY": "PROGRESSIVEDELIVER", "RELIABILITYENG": "TRE",
            "VISUALINTEL": "EYE", "SELFHEALING": "REPAIRMAN"
        }
        if node_id_up in aliases:
            match_tags.add(aliases[node_id_up])
            
        # --- AGENT MESH STATUS MAPPING LOGIC ---
        # We determine if an agent is 'active' or 'completed' based on its log presence.
        def is_match(tag):
            if not tag: return False
            tag_clean = tag.upper().replace(" ", "").replace("_", "").replace("-", "")
            if not tag_clean: return False
            
            # 1. Exact matches for performance
            if tag_clean in match_tags: return True
            
            # 2. Heuristic substring matching (e.g., 'SYNTHESIZER' matching 'SYNTHESISOPTIMIZER')
            for mt in match_tags:
                if len(mt) > 3 and len(tag_clean) > 3:
                    if mt in tag_clean or tag_clean in mt: return True
                    # Common aliases/shortcuts
                    if "SYNTHES" in tag_clean and "SYNTHES" in mt: return True
                    if "WRIT" in tag_clean and "COMPOS" in mt: return True
                    if "INGEST" in tag_clean and "INGEST" in mt: return True
                    if "CLARIF" in tag_clean and "CLARIF" in mt: return True
                    if "ARCHIT" in tag_clean and "ARCHIT" in mt: return True

            return False

        # RULE 0: Bypassed nodes remain bypassed.
        if node.get("status") == "bypassed":
            continue

        # RULE 0.5: Explicit status from partial_state active_nodes (Phase 3 forges)
        node_key = node.get("key")
        st_nodes = task.partial_state.get("active_nodes", {}) if task.partial_state else {}
        st_val = st_nodes.get(node_key)
        if st_val:
            if st_val == "running":
                node["status"] = "active"
                active_node_id = node["id"]
                continue
            elif st_val == "complete" or st_val == "completed":
                node["status"] = "completed"

        # RULE 1: If an agent has ANY logs, it's at least 'completed' (or has started)
        if any(is_match(t) for t in logged_agents_set):
            node["status"] = "completed"

        # RULE 1B: If node output evidence exists in persisted state, mark completed.
        # This is especially important for phase-2 orchestrator pools.
        node_key = node.get("key")
        keys_to_check = evidence_keys.get(node_key, [])
        if keys_to_check and any(has_payload(resolved_state.get(k)) for k in keys_to_check):
            node["status"] = "completed"

        # RULE 2: If an agent is the MOST RECENT logging agent, it's 'active' (blinking)
        # BUG-FIX: Only set to active if the task itself is still PROCESSING.
        # AND: If it's already marked as completed, we only keep it active if it matches the current tag.
        if task.status == "PROCESSING" and any(is_match(tag) for tag in active_agent_tags):
            node["status"] = "active"
            active_node_id = node["id"]

    # Final Catch: Ensure no node shows as "running" after completion
    if task.status == "COMPLETED":
        active_node_id = None  # No active node once pipeline is done

    topology = {
        "mesh_id": f"SeQuor-ANT-{task_id[:8]}",
        "nodes": mesh_nodes,
        "active_node_id": active_node_id,
        "status_label": "MESH PROPAGATION IN PROGRESS" if active_node_id else "NETWORK STABILIZED"
    }

    current_phase = 1 if task.mission_intent == "PHASE_1" else 2
    from backend.core.phase_registry import PHASE_DEFINITIONS
    phase_def = PHASE_DEFINITIONS.get(current_phase, {})
    
    phase3_output = None
    phase4_output = None
    phase5_output = None
    if task.mission_id:
        try:
            from backend.core.mission_controller import mission_controller
            PHASE_MINIMUM_STATUS = {
                3: ["PHASE3_RUNNING", "TDD_GREEN", "PHASE4_RUNNING", "NFR_GREEN", "PHASE5_RUNNING", "MISSION_COMPLETE"],
                4: ["PHASE4_RUNNING", "NFR_GREEN", "PHASE5_RUNNING", "MISSION_COMPLETE"],
                5: ["NFR_GREEN", "PHASE5_RUNNING", "MISSION_COMPLETE"],
            }
            if _mission_status in PHASE_MINIMUM_STATUS[3]:
                phase3_output = await mission_controller.get_phase_output(task.mission_id, 3)
            if _mission_status in PHASE_MINIMUM_STATUS[4]:
                phase4_output = await mission_controller.get_phase_output(task.mission_id, 4)
            if _mission_status in PHASE_MINIMUM_STATUS[5]:
                phase5_output = await mission_controller.get_phase_output(task.mission_id, 5)
        except Exception:
            pass
            
    plan_json = None
    if task.mission_id:
        try:
            from backend.core.mission_controller import mission_controller
            plan_json = await mission_controller.get_phase_output(task.mission_id, "implementation_plan")
        except Exception:
            pass

    return {
        "task_id": task.task_id,
        "status": task.status,
        "mission_status": _mission_status,
        "plan_json": plan_json,
        "active_nodes": (task.partial_state or {}).get("active_nodes", {}),
        "tdd_execution_report": (task.partial_state or {}).get("tdd_execution_report", {}),
        "all_tests_green": (task.partial_state or {}).get("all_tests_green", False),
        "phase3_output": phase3_output,
        "phase4_output": phase4_output,
        "phase5_output": phase5_output,
        "nfr_clearance_report": (phase4_output or {}).get("nfr_clearance_report", {}),
        "logs": logs,
        "result": task.result,
        "partial_state": task.partial_state or {},
        "error": task.error,
        "phase": current_phase,
        "phase_name": phase_def.get("name", "Unknown Phase"),
        "next_gate": phase_def.get("status_gate", "UNKNOWN_GATE"),
        "phase_nodes": phase_def.get("nodes", []),
        "mesh_topology": topology 
    }


@router.get("/debug/{task_id}")
def get_task_logs(request: Request, task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    DEBUG WINDOW ENDPOINT

    Returns the complete raw log stream for a task — all levels (INFO, DEBUG, TRACE,
    WARN, ERROR) exactly as stored, with no filtering or interpretation.

    Also includes task metadata (status, intent, created_at, active_agents count)
    so the debug window can show full context for the run.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    verify_task_ownership(request, task, current_user)

    # Flush any buffered live telemetry before the UI consumes this snapshot.
    # This keeps the console and agent workspace from appearing blank while
    # log_step()/write_partial_state() are still inside their coalescing window.
    try:
        from backend.agents.state import flush_log_step, flush_partial_state
        flush_log_step(task_id)
        flush_partial_state(task_id)
        db.expire_all()
        task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"[STATUS-FLUSH] Unable to flush buffered telemetry for {task_id}: {exc}")

    logs = task.logs or []
    metrics = _task_mission_metrics(task, db)

    level_counts: dict = {}
    for log in logs:
        lvl = (log.get("level") or "INFO").upper()
        level_counts[lvl] = level_counts.get(lvl, 0) + 1

    agents_seen = sorted(set(
        log.get("agent", "System") for log in logs
        if log.get("agent") and log.get("agent") != "System"
    ))

    return {
        "task_id": task_id,
        "status": task.status,
        "mission_intent": task.mission_intent or "PHASE_1",
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "error": task.error,
        "configured_agents_count": metrics["configured_agents_count"],
        "eligible_agents_count": metrics["eligible_agents_count"],
        "executed_agents_count": metrics["executed_agents_count"],
        "bypassed_agents_count": metrics["bypassed_agents_count"],
        "failed_agents_count": metrics["failed_agents_count"],
        "artifact_coverage": metrics["artifact_coverage"],
        "total_log_entries": len(logs),
        "level_summary": level_counts,
        "agents_seen": agents_seen,
        "logs": logs,
    }


@router.get("/metrics/{task_id}")
def get_task_dashboard_metrics(task_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    PHASE 3 — DASHBOARD KPI ENDPOINT (DASH-005/006/008)

    PURPOSE:
    Computes all dashboard KPIs server-side from the stored task result so the
    frontend doesn't need fragile client-side extraction across multiple nested
    paths. Returns a single flat metrics object ready for direct display.

    COMPUTATION LOGIC:
    - intelligence_nodes_count: Count of completed/active nodes in mesh_topology
    - synthesized_tests_count: test_cases.length → gherkin_scenarios.length (Phase 1 proxy)
    - sla_confidence: intelligence_metrics → sla_slo_audit → reasoning_audit → mesh_confidence
    - risk_hotspots: Count of H/High impact+likelihood risks + quarantine count
    - requirement_coverage: intelligence_metrics → mesh_analytics
    - mesh_confidence: mesh_confidence float → reasoning_audit.confidence_score
    - execution_readiness: intelligence_metrics.logic_stability → mesh_analytics
    - executive_summary: executive_summary.description → final_synthesis.summary
    - mission_phase: PHASE_1 or PHASE_2 based on mission_intent
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    verify_task_ownership(request, task, current_user)

    result = task.result or {}
    partial = task.partial_state or {}

    # Merge partial_state into result for maximum data availability
    merged = {**result, **partial}

    analysis_payload = merged.get("analysis_payload") or {}
    full_state = merged.get("full_state") or {}
    final_synthesis = (merged.get("final_synthesis") or
                       full_state.get("final_synthesis") or {})
    mesh_analytics = final_synthesis.get("mesh_analytics") or {}
    intelligence_metrics = analysis_payload.get("intelligence_metrics") or {}
    reasoning_audit = analysis_payload.get("reasoning_audit") or {}
    sla_slo_audit = merged.get("sla_slo_audit") or {}
    reliability_eng = merged.get("reliability_eng") or {}
    risk_matrix = analysis_payload.get("risk_matrix") or []
    test_cases = merged.get("test_cases") or []
    gherkin_scenarios = (analysis_payload.get("scope") or {}).get("gherkin_scenarios") or []
    executive_summary = analysis_payload.get("executive_summary") or {}

    # ── intelligence_nodes_count ─────────────────────────────────────────────
    # Count nodes that actually ran from the stored mesh topology
    topology_nodes = (task.result or {}).get("mesh_topology", {})
    if not topology_nodes:
        topology_nodes = {}
    topo_nodes_list = topology_nodes.get("nodes") or []
    ran_nodes = [n for n in topo_nodes_list
                 if isinstance(n, dict) and n.get("status") in ("completed", "active")]
    intelligence_nodes_count = (
        len(ran_nodes) if ran_nodes
        else mesh_analytics.get("intelligence_nodes_count")
        or len([a for a in (task.active_agents or {}).values() if a not in (False, "bypass")])
        or None
    )

    # ── synthesized_tests_count ──────────────────────────────────────────────
    synthesized_tests_count = (
        mesh_analytics.get("synthesized_tests_count")
        or (len(test_cases) if test_cases else None)
        or (len(gherkin_scenarios) if gherkin_scenarios else None)
        or 0
    )

    # ── sla_confidence ───────────────────────────────────────────────────────
    sla_confidence = None
    im_sla = intelligence_metrics.get("sla_confidence")
    if im_sla and im_sla not in ("Awaiting...", "0%", ""):
        sla_confidence = im_sla
    elif sla_slo_audit.get("sla_targets"):
        targets = sla_slo_audit["sla_targets"]
        if isinstance(targets, list) and targets:
            sla_confidence = targets[0].get("target")
    if not sla_confidence:
        conf_score = reasoning_audit.get("confidence_score")
        if conf_score:
            try:
                sla_confidence = f"{float(conf_score) * 100:.0f}%"
            except (ValueError, TypeError):
                pass
    if not sla_confidence:
        mc = merged.get("mesh_confidence")
        if mc:
            try:
                sla_confidence = f"{float(mc) * 100:.1f}%"
            except (ValueError, TypeError):
                pass

    # ── risk_hotspots ────────────────────────────────────────────────────────
    if mesh_analytics.get("risk_hotspots") is not None:
        raw_hotspots = mesh_analytics["risk_hotspots"]
        # Normalize: could be int, str, or list depending on LLM output
        if isinstance(raw_hotspots, list):
            risk_hotspots = len(raw_hotspots)
        else:
            try:
                risk_hotspots = int(raw_hotspots)
            except (ValueError, TypeError):
                risk_hotspots = str(raw_hotspots)
    else:
        high_risks = sum(
            1 for r in risk_matrix
            if isinstance(r, dict) and (
                (r.get("impact") or "").upper() in ("H", "HIGH") or
                (r.get("likelihood") or "").upper() in ("H", "HIGH")
            )
        )
        quarantine_count = reliability_eng.get("quarantine_count") or 0
        risk_hotspots = high_risks + quarantine_count

    # ── requirement_coverage ─────────────────────────────────────────────────
    requirement_coverage = (
        intelligence_metrics.get("requirement_coverage")
        or mesh_analytics.get("requirement_coverage")
        or None
    )

    # ── mesh_confidence ──────────────────────────────────────────────────────
    mesh_confidence_raw = merged.get("mesh_confidence")
    mesh_confidence = None
    if mesh_confidence_raw is not None:
        try:
            mesh_confidence = f"{float(mesh_confidence_raw) * 100:.1f}%"
        except (ValueError, TypeError):
            pass
    if not mesh_confidence:
        conf_score = reasoning_audit.get("confidence_score")
        if conf_score:
            try:
                mesh_confidence = f"{float(conf_score) * 100:.0f}%"
            except (ValueError, TypeError):
                pass

    # ── execution_readiness ──────────────────────────────────────────────────
    execution_readiness = (
        intelligence_metrics.get("logic_stability")
        or mesh_analytics.get("execution_readiness")
        or None
    )

    # ── executive_summary ────────────────────────────────────────────────────
    executive_summary_text = (
        final_synthesis.get("summary", {}).get("description")
        or executive_summary.get("description")
        or analysis_payload.get("abstract_summary")
        or None
    )

    # ── mission_phase ────────────────────────────────────────────────────────
    mission_phase = task.mission_intent or "PHASE_1"

    from backend.core.phase_registry import PHASE_DEFINITIONS
    current_phase = 1 if mission_phase == "PHASE_1" else 2
    phase_def = PHASE_DEFINITIONS.get(current_phase, {})

    return {
        "task_id": task_id,
        "status": task.status,
        "mission_phase": mission_phase,
        "phase": current_phase,
        "phase_name": phase_def.get("name", "Unknown Phase"),
        "next_gate": phase_def.get("status_gate", "UNKNOWN_GATE"),
        "phase_nodes": phase_def.get("nodes", []),
        "mesh_topology": topology_nodes,
        "metrics": {
            "intelligence_nodes_count": intelligence_nodes_count,
            "synthesized_tests_count": synthesized_tests_count,
            "sla_confidence": sla_confidence,
            "risk_hotspots": risk_hotspots,
            "requirement_coverage": requirement_coverage,
            "mesh_confidence": mesh_confidence,
            "execution_readiness": execution_readiness,
            "executive_summary": executive_summary_text,
        }
    }


# --- MISSION TRACKING WRAPPERS ---
def track_agent_start(mission_id: int, agent_name: str) -> int:
    from backend.core.database import SessionLocal
    with SessionLocal() as db:
        execution = MissionService.start_execution(db, mission_id, agent_name)
        return execution.id

def track_agent_complete(mission_id: int, execution_id: int, agent_name: str, result_payload: dict, duration_ms: int):
    from backend.core.database import SessionLocal
    with SessionLocal() as db:
        MissionService.complete_execution(db, execution_id, duration_ms)
        import json
        payload_str = json.dumps(result_payload)
        import hashlib
        artifact_hash = hashlib.sha256(payload_str.encode('utf-8')).hexdigest()
        MissionService.save_artifact(
            db, 
            mission_id, 
            agent_name, 
            f"{agent_name}_output", 
            result_payload, 
            len(payload_str),
            artifact_hash
        )

def track_agent_failure(mission_id: int, execution_id: int, agent_name: str, error_message: str, duration_ms: int = 0):
    from backend.core.database import SessionLocal
    with SessionLocal() as db:
        MissionService.fail_execution(db, execution_id, error_message, duration_ms)

async def execute_phase_1_mission(task_id: str, mission_id: int, prd_input: str):
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[NEW-DISPATCHER] execute_phase_1_mission called — Phase 1 directly")
    from backend.core.database import SessionLocal
    from backend.core.database import GenerationTask
    from backend.core.mission_controller import mission_controller, MissionStatus
    from backend.agents.graphs.phase1_graph import build_phase1_graph

    str_mission_id = str(mission_id) if mission_id else task_id
    current_status = await mission_controller.get_status(str_mission_id)
    
    if current_status == MissionStatus.CREATED:
        await mission_controller.transition_status(str_mission_id, MissionStatus.PHASE1_RUNNING)
        phase1_graph = build_phase1_graph()
        
        # Mark legacy task as PROCESSING
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
            if task:
                task.status = "PROCESSING"
                db.commit()

        try:
            from backend.agents.state import write_partial_state, flush_partial_state
            
            logger.info(f"[PHASE1-LAUNCH] prd_input chars={len(prd_input or '')}")
            
            if not prd_input or not prd_input.strip():
                raise RuntimeError("Phase 1 launch aborted: empty PRD input.")
            
            final_state = {}
            # Stream graph updates to hydrate live telemetry
            async for output in phase1_graph.astream(
                {
                    "prd_input": prd_input,
                    "mission_id": str_mission_id,
                    "task_id": task_id,
                },
                config={"configurable": {
                    "thread_id": mission_controller.get_thread_id(str_mission_id, 1)
                }},
                stream_mode="updates"
            ):
                for node_name, node_output in output.items():
                    # Accumulate final state
                    for k, v in node_output.items():
                        if isinstance(v, list) and k in final_state:
                            final_state[k].extend(v)
                        elif isinstance(v, dict) and k in final_state:
                            final_state[k].update(v)
                        else:
                            final_state[k] = v
                    
                    # Map graph node names to legacy UI payload keys
                    key_map = {
                        "ingestor_node": "ingestor",
                        "repository_intelligence_node": "repository",
                        "tech_stack_analysis_node": "tech_stack",
                        "clarifier_node": "clarifier",
                        "security_intel_node": "security",
                        "governance_node": "governance",
                        "accessibility_intel_node": "accessibility",
                        "risk_advisory_node": "risk_advisory"
                    }
                    legacy_key = key_map.get(node_name, node_name)
                    
                    # Hydrate UI in real-time
                    write_partial_state(task_id, {
                        legacy_key: node_output,
                        "unified_context_contract": node_output.get("unified_context_contract") or final_state.get("unified_context_contract")
                    })
            
            flush_partial_state(task_id)
            
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "COMPLETED"
                    
                    # Generate a Markdown summary for the UI based on actual LLM outputs
                    questions = final_state.get("open_questions") or []
                    risks = final_state.get("risk_advisory_report", {})
                    security_risks = risks.get("security_advisories", [])
                    capabilities = final_state.get("capabilities", [])
                    
                    md_preview = f"### Phase 1: Strategic Blitz Analysis\n\n"
                    md_preview += f"**Discovered Capabilities**: {len(capabilities)}\n"
                    md_preview += f"**Identified Risks**: {len(security_risks)}\n"
                    md_preview += f"**Open Questions**: {len(questions)}\n\n"
                    if questions:
                        md_preview += "#### Clarifying Questions\n"
                        for q in questions[:3]:
                            md_preview += f"- {q.get('question', 'Q')}\n"
                    
                    # Hydrate legacy fields so the UI displays the generated content properly
                    task.result = {
                        "markdown_preview": md_preview,
                        "hitl_pending": True,
                        "analysis_payload": {
                            "unified_context_contract": final_state.get("unified_context_contract"),
                            "ingestor": {"repo_intelligence_context": final_state.get("repo_intelligence_context", "")},
                            "clarifier": {"open_questions": questions, "target_tech_stack": final_state.get("target_tech_stack", {})},
                            "security": {"advisories": risks.get("security_advisories", [])},
                            "governance": {"advisories": risks.get("compliance_advisories", [])},
                            "accessibility": {"advisories": risks.get("accessibility_advisories", [])},
                            "risk_advisory": risks,
                            "tech_stack": {"capabilities": capabilities}
                        },
                        "combined_data": {
                            "open_questions": questions,
                            "capabilities": capabilities,
                            "target_tech_stack": final_state.get("target_tech_stack", {})
                        }
                    }
                    db.commit()
                    
        except Exception as e:
            logger.error(f"[WORKFLOW] Phase 1 Execution failed: {e}")
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "FAILED"
                    task.error = str(e)
                    db.commit()
    else:
        logger.warning(f"Phase 1 aborted: current_status is {current_status}")

async def execute_phase_2_mission(mission_id: str):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[PHASE2] execute_phase_2_mission ENTERED for {mission_id}")
    
    from backend.core.database import SessionLocal, GenerationTask
    from backend.core.mission_controller import mission_controller, MissionStatus
    from backend.agents.graphs.phase2_graph import build_phase2_graph
    from backend.agents.state import write_partial_state, flush_partial_state
    from sqlalchemy.orm.attributes import flag_modified

    str_mission_id = str(mission_id)

    # Wrap the ENTIRE function so any failure (including PHASE2_RUNNING transition
    # or load_phase_output) cleanly transitions to FAILED instead of
    # leaving the mission stuck at PHASE1_APPROVED.
    try:
        # Step 1 — transition to RUNNING first (validates PHASE1_APPROVED → PHASE2_RUNNING)
        logger.info(f"[PHASE2] Transitioning {str_mission_id} → PHASE2_RUNNING")
        await mission_controller.transition_status(
            str_mission_id, MissionStatus.PHASE2_RUNNING
        )
        logger.info(f"[PHASE2] Status is now PHASE2_RUNNING for {str_mission_id}")

        # Step 2 — load Phase 1 output from DB; fall back to task.result if absent
        try:
            phase1_output = await mission_controller.load_phase_output(str_mission_id, phase=1)
        except RuntimeError as load_err:
            logger.warning(
                f"[PHASE2] load_phase_output failed ({load_err}). "
                f"Attempting fallback from task.result for {str_mission_id}."
            )
            phase1_output = {}
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == str_mission_id).first()
                if task and isinstance(task.result, dict):
                    analysis = task.result.get("analysis_payload", {})
                    combined = task.result.get("combined_data", {})
                    phase1_output = {
                        "unified_context_contract": analysis.get("unified_context_contract") or {},
                        "risk_advisory_report": analysis.get("risk_advisory", {}),
                        "capabilities": combined.get("capabilities", []),
                        "target_tech_stack": combined.get("target_tech_stack", {}),
                        "open_questions": combined.get("open_questions", []),
                        "missing_information": [],
                    }
            if not phase1_output.get("unified_context_contract") and not phase1_output.get("capabilities"):
                raise RuntimeError(
                    f"[PHASE2] Cannot start Phase 2 — no Phase 1 output found for {str_mission_id}. "
                    f"Ensure Phase 1 completed and persisted its output."
                )

        # Step 3 — mark legacy task as PROCESSING
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == str_mission_id).first()
            if task:
                task.status = "PROCESSING"
                db.commit()

        # Step 4 — build initial Phase 2 state from Phase 1 output
        # Resolve the original task_id (UUID) so log_step writes to the right row.
        # str_mission_id may be either the UUID (from approve_phase1) or an integer string;
        # the UUID case IS the task_id, so we first try a direct match.
        task_id_for_logs = str_mission_id  # Fallback: UUID is also the task_id
        with SessionLocal() as db:
            _task = db.query(GenerationTask).filter(GenerationTask.task_id == str_mission_id).first()
            if _task:
                task_id_for_logs = _task.task_id

        phase2_state = {
            "mission_id": str_mission_id,
            "task_id": task_id_for_logs,
            "unified_context_contract": phase1_output.get("unified_context_contract"),
            "risk_advisory_report": phase1_output.get("risk_advisory_report", {}),
            "capabilities": phase1_output.get("capabilities", []),
            "target_tech_stack": phase1_output.get("target_tech_stack", {}),
            "open_questions": phase1_output.get("open_questions", []),
            "missing_information": phase1_output.get("missing_information", []),
            # Initialize Phase 2 payload containers
            "engineering_tasks": [],
            "api_design_spec": {},
            "db_schema_design": {},
            "tdd_contracts": {}
        }

        # Step 5 — build and invoke the Phase 2 graph
        # NOTE: phase2_exit_node inside the graph handles persist + HITL2_PENDING transition.
        #       Do NOT call transition_status(HITL2_PENDING) here — that would be a duplicate.
        phase2_graph = build_phase2_graph()
        thread_id = mission_controller.get_thread_id(str_mission_id, phase=2)

        final_state = {}
        async for output in phase2_graph.astream(
            phase2_state,
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="updates"
        ):
            for node_name, node_output in output.items():
                logger.info(f"[PHASE2-NODE] {node_name} completed")
                # Accumulate final state
                for k, v in node_output.items():
                    if isinstance(v, list) and k in final_state:
                        final_state[k].extend(v)
                    elif isinstance(v, dict) and k in final_state:
                        final_state[k].update(v)
                    else:
                        final_state[k] = v
                # Write to the task_id row — that's what the frontend polls
                write_partial_state(task_id_for_logs, node_output)

        flush_partial_state(task_id_for_logs)

        # Step 6 — update legacy task result for UI (status/HITL2_PENDING set by phase2_exit_node)
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == str_mission_id).first()
            if task:
                task.status = "COMPLETED"
                old_result = task.result or {}
                if "analysis_payload" not in old_result:
                    old_result["analysis_payload"] = {}

                old_result["analysis_payload"]["api_design_spec"] = final_state.get("api_design_spec", {})
                old_result["analysis_payload"]["db_schema_design"] = final_state.get("db_schema_design", {})
                old_result["analysis_payload"]["engineering_tasks"] = final_state.get("engineering_tasks", [])
                old_result["analysis_payload"]["tdd_contracts"] = final_state.get("tdd_contracts", {})

                tdd_contracts_val = final_state.get("tdd_contracts", {})
                tdd_count = len(tdd_contracts_val) if isinstance(tdd_contracts_val, (dict, list)) else 0

                md_preview = old_result.get("markdown_preview", "### Mission Execution\n")
                md_preview += f"\n\n### Phase 2: Artifact Factory\n"
                md_preview += f"- **API Endpoints**: {len(final_state.get('api_design_spec', {}).get('endpoints', []))}\n"
                md_preview += f"- **DB Tables**: {len(final_state.get('db_schema_design', {}).get('tables', []))}\n"
                md_preview += f"- **Engineering Tasks**: {len(final_state.get('engineering_tasks', []))}\n"
                md_preview += f"- **TDD Contracts**: {tdd_count}\n"

                old_result["markdown_preview"] = md_preview
                old_result["hitl_pending"] = True
                task.result = old_result
                flag_modified(task, "result")
                db.commit()

        logger.info(f"[PHASE2] Phase 2 graph completed for {str_mission_id}. Awaiting HITL2 approval.")

    except Exception as e:
        logger.error(f"[PHASE2] execute_phase_2_mission FAILED for {str_mission_id}: {e}", exc_info=True)
        # Transition mission to FAILED so it doesn't stay stuck at PHASE1_APPROVED or PHASE2_RUNNING
        try:
            await mission_controller.transition_status(str_mission_id, MissionStatus.FAILED)
        except Exception as te:
            logger.warning(f"[PHASE2] Could not transition to FAILED: {te}")
        # Also mark the legacy DB task as FAILED
        try:
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == str_mission_id).first()
                if task:
                    task.status = "FAILED"
                    task.error = str(e)
                    db.commit()
        except Exception as dbe:
            logger.warning(f"[PHASE2] Could not update DB task status to FAILED: {dbe}")
        raise

async def execute_phase_3_mission(mission_id: str, failed_modules: list = None, approved_modules: list = None):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[PHASE3] execute_phase_3_mission ENTERED for mission {mission_id}")
    
    from backend.core.mission_controller import mission_controller, MissionStatus
    from backend.agents.graphs.phase3_graph import build_phase3_graph
    from backend.core.database import SessionLocal, GenerationTask
    from backend.agents.state import write_partial_state, flush_partial_state

    str_mission_id = str(mission_id)
    
    current_status = await mission_controller.get_status(str_mission_id)
    if current_status != MissionStatus.PHASE3_RUNNING:
        await mission_controller.transition_status(str_mission_id, MissionStatus.PHASE3_RUNNING)
    
    # Load Phase 2 outputs
    phase2_output = await mission_controller.load_phase_output(str_mission_id, phase=2)
    if not phase2_output:
        logger.warning(f"[PHASE3] No Phase 2 output found for {str_mission_id}.")
        return

    mission_runtime = await mission_controller.get_mission_runtime(str_mission_id)
    plan_json = mission_runtime.get("plan_json", {})

    phase3_state = {
        "mission_id": str_mission_id,
        "task_id": str_mission_id,
        "system_specification": phase2_output.get("system_specification", {}),
        "api_design_spec": phase2_output.get("api_design_spec", {}),
        "db_schema_design": phase2_output.get("db_schema_design", {}),
        "tasks": phase2_output.get("tasks", []),
        "tdd_contracts": phase2_output.get("tdd_contracts", {}),
        "engineering_contract": phase2_output.get("engineering_contract", {}),
        "failed_modules": failed_modules or [],
        "approved_modules": approved_modules or [],
        "plan_json": plan_json
    }
    
    phase3_graph = build_phase3_graph()
    thread_id = mission_controller.get_thread_id(str_mission_id, 3)
    
    try:
        async for output in phase3_graph.astream(
            phase3_state,
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="updates"
        ):
            for node_name, node_output in output.items():
                logger.info(f"[PHASE3-NODE] {node_name} completed.")
                write_partial_state(str_mission_id, node_output)
        
        flush_partial_state(str_mission_id)
        
        import asyncio
        logger.info(f"[PHASE3] Graph execution cycle complete for {mission_id}. (May be paused for TDD or fully complete)")
    except Exception as e:
        logger.error(f"[PHASE3] execute_phase_3_mission FAILED for {str_mission_id}: {e}", exc_info=True)
        try:
            current = await mission_controller.get_status(str_mission_id)
            _terminal = (MissionStatus.FAILED, MissionStatus.PARTIAL_FAILURE, MissionStatus.MISSION_COMPLETE)
            if current not in _terminal:
                await mission_controller.transition_status(str_mission_id, MissionStatus.FAILED)
            else:
                logger.warning(f"[PHASE3] Mission {str_mission_id} already terminal ({current}), skipping redundant transition")
        except Exception as te:
            logger.warning(f"[PHASE3] Could not transition to FAILED: {te}")
        raise

async def execute_phase_4_mission(mission_id: str):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[PHASE4] execute_phase_4_mission ENTERED for mission {mission_id}")
    
    from backend.core.mission_controller import mission_controller, MissionStatus
    from backend.agents.graphs.phase4_graph import build_phase4_graph
    from backend.agents.state import write_partial_state, flush_partial_state

    str_mission_id = str(mission_id)
    await mission_controller.transition_status(str_mission_id, MissionStatus.PHASE4_RUNNING)
    
    try:
        phase3_output = await mission_controller.load_phase_output(str_mission_id, phase=3)
    except Exception:
        phase3_output = {}
        
    try:
        phase2_output = await mission_controller.load_phase_output(str_mission_id, phase=2)
    except Exception:
        phase2_output = {}
        
    try:
        phase1_output = await mission_controller.load_phase_output(str_mission_id, phase=1)
    except Exception:
        phase1_output = {}

    phase4_state = {
        "mission_id": str_mission_id,
        "task_id": str_mission_id,
        "generated_code_paths": phase3_output.get("generated_code_paths", []),
        "tdd_execution_report": phase3_output.get("tdd_execution_report", {}),
        "all_tests_green": phase3_output.get("all_tests_green", False),
        "api_design_spec": phase2_output.get("api_design_spec", {}),
        "risk_advisory_report": phase1_output.get("risk_advisory_report", {}),
        "module_forge_code": phase3_output.get("module_forge_code", [])
    }
    
    phase4_graph = build_phase4_graph()
    thread_id = mission_controller.get_thread_id(str_mission_id, 4)
    
    try:
        async for output in phase4_graph.astream(
            phase4_state,
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="updates"
        ):
            for node_name, node_output in output.items():
                logger.info(f"[PHASE4-NODE] {node_name} completed.")
                write_partial_state(str_mission_id, node_output)
        
        flush_partial_state(str_mission_id)
        
        import asyncio
        logger.info(f"[PHASE4] Complete — auto-starting Phase 5 for {mission_id}")
        asyncio.create_task(mission_controller.start_phase5(str_mission_id))
        
    except Exception as e:
        logger.error(f"[PHASE4] execute_phase_4_mission FAILED for {str_mission_id}: {e}", exc_info=True)
        try:
            await mission_controller.transition_status(str_mission_id, MissionStatus.FAILED)
        except Exception as te:
            logger.warning(f"[PHASE4] Could not transition to FAILED: {te}")
        raise

async def run_agent_workflow_logic(task_id: str, req: "GenerateRequest", parent_task_id: str = None, mission_id: int = None):
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[LEGACY] run_agent_workflow_logic called — OLD CODE PATH")
    from backend.core.database import SessionLocal
    from backend.core.mission_controller import mission_controller, MissionStatus
    
    str_mission_id = str(mission_id) if mission_id else task_id
    current_status = await mission_controller.get_status(str_mission_id)
    
    if current_status == MissionStatus.CREATED:
        await mission_controller.transition_status(str_mission_id, MissionStatus.PHASE1_RUNNING)
        from backend.agents.graphs.phase1_graph import build_phase1_graph
        phase1_graph = build_phase1_graph()
        
        # Mark legacy task as PROCESSING
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
            if task:
                task.status = "PROCESSING"
                db.commit()

        try:
            await phase1_graph.ainvoke(
                {
                    "prd_input": req.context or "",
                    "mission_id": str_mission_id,
                },
                config={"configurable": {
                    "thread_id": mission_controller.get_thread_id(str_mission_id, 1)
                }}
            )
            
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "COMPLETED"
                    # Legacy UI expects task.result to be a dict
                    task.result = make_serializable({
                        "markdown_preview": "Phase 1 complete. Awaiting HITL approval.",
                        "hitl_pending": True,
                        "analysis_payload": {},
                        "combined_data": {}
                    })
                    db.commit()
                    
        except Exception as e:
            logger.error(f"[WORKFLOW] Phase 1 Execution failed: {e}")
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    task.status = "FAILED"
                    task.error = str(e)
                    db.commit()
    else:
        logger.error(f"[WORKFLOW] Cannot start Phase 1 — mission {str_mission_id} already in status {current_status}")
        raise RuntimeError(f"Mission {str_mission_id} already started — use phase-specific endpoints")
