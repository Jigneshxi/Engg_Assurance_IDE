from typing import Optional, List
import datetime
import os
import zipfile
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.core.database import get_db
from backend.core.mission_models import Mission, MissionArtifact, MissionEvent, MissionExecution, AuditOverride
from backend.api.routes.auth import get_current_user, verify_mission_ownership
from backend.core.auth_models import User
from pydantic import BaseModel

router = APIRouter(prefix="/api/missions", tags=["Missions"])

@router.get("")
def list_missions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    depth_filter: Optional[str] = Query(None, alias="depth"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all missions for the current user with pagination and optional filtering.
    """
    query = db.query(Mission).filter(
        Mission.created_by == current_user.id,
        Mission.is_deleted == False
    )

    if status_filter:
        query = query.filter(Mission.status == status_filter.upper())
    if depth_filter:
        query = query.filter(Mission.execution_depth == depth_filter)

    total_count = query.count()
    
    from sqlalchemy.orm import joinedload
    
    missions = query.options(joinedload(Mission.executions)).order_by(desc(Mission.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    
    from backend.core.database import GenerationTask
    mission_ids = [m.id for m in missions]
    tasks = db.query(GenerationTask).filter(GenerationTask.mission_id.in_(mission_ids)).all() if mission_ids else []
    tasks_by_mission = {}
    for t in tasks:
        tasks_by_mission.setdefault(t.mission_id, []).append(t)
        
    items = []
    for m in missions:
        m_dict = {
            "id": m.id,
            "correlation_id": m.correlation_id,
            "mission_name": m.mission_name,
            "status": m.status,
            "execution_depth": m.execution_depth,
            "created_at": m.created_at.replace(tzinfo=datetime.timezone.utc) if m.created_at else None,
            "total_agents": m.total_agents,
            "configured_agents_count": m.configured_agents_count or m.total_agents,
            "eligible_agents_count": m.eligible_agents_count or m.total_agents,
            "executed_agents_count": m.executed_agents_count or 0,
            "bypassed_agents_count": m.bypassed_agents_count or 0,
            "failed_agents_count": m.failed_agents_count or m.failed_agents,
            "completed_agents": m.completed_agents,
            "failed_agents": m.failed_agents,
            "artifact_coverage": m.artifact_coverage or {},
            "mission_manifest": m.mission_manifest or {},
            "total_executions": len(m.executions) if m.executions else 0,
            "unique_agents": len(set([e.agent_name for e in m.executions])) if m.executions else 0,
            "phase_status": {}
        }
        
        # Override counts with latest phase accurate data
        m_tasks = tasks_by_mission.get(m.id, [])
        phase_2_task = next((t for t in m_tasks if t.mission_intent == "PHASE_2"), None)
        phase_1_task = next((t for t in m_tasks if t.mission_intent == "PHASE_1"), None)
        
        target_task = phase_2_task or phase_1_task
        if target_task:
            if target_task.active_agents:
                active_count = len([v for v in target_task.active_agents.values() if v not in (False, "bypass")])
                m_dict["total_agents"] = active_count
                m_dict["configured_agents_count"] = active_count
                m_dict["eligible_agents_count"] = active_count
            else:
                m_dict["total_agents"] = 0
            
            p_execs = [e for e in m.executions if e.created_at >= target_task.created_at] if m.executions else []
            m_dict["completed_agents"] = len([e for e in p_execs if e.status == "COMPLETED"])
        
        if m.executions:
            # Build phase_status map from events or executions. 
            existing_phase_status = m.phase_status or {}
            for phase, status in existing_phase_status.items():
                m_dict["phase_status"][phase] = {"status": status, "executions": 0}
        
        items.append(m_dict)
    
    return {
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "items": items
    }

@router.get("/{mission_id}")
def get_mission(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get detailed mission summary.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    return mission

@router.get("/{mission_id}/artifacts")
def get_mission_artifacts(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get all artifacts generated by a specific mission.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    artifacts = db.query(MissionArtifact).filter(MissionArtifact.mission_id == mission_id).all()
    return artifacts

@router.get("/{mission_id}/events")
def get_mission_events(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get the event timeline for a specific mission.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    events = db.query(MissionEvent).filter(MissionEvent.mission_id == mission_id).order_by(MissionEvent.created_at).all()
    return events

@router.get("/{mission_id}/tool-executions")
def get_mission_tool_executions(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get all tool executions and their artifacts for a specific mission.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    from backend.core.mission_models import ToolExecution
    from sqlalchemy.orm import joinedload
    executions = db.query(ToolExecution).options(joinedload(ToolExecution.artifacts)).filter(ToolExecution.mission_id == mission_id).all()
    
    result = []
    for ex in executions:
        result.append({
            "id": ex.id,
            "mission_id": ex.mission_id,
            "agent_name": ex.agent_name,
            "tool_name": ex.tool_name,
            "tool_version": ex.tool_version,
            "status": ex.status,
            "duration_ms": ex.duration_ms,
            "started_at": ex.started_at.isoformat() if ex.started_at else None,
            "completed_at": ex.completed_at.isoformat() if ex.completed_at else None,
            "summary": ex.summary,
            "result_hash": ex.result_hash,
            "error_message": ex.error_message,
            "execution_context": ex.execution_context,
            "output_path": ex.output_path,
            "execution_mode_snapshot": ex.execution_mode_snapshot,
            "artifacts": [{
                "id": a.id,
                "artifact_type": a.artifact_type,
                "artifact_name": a.artifact_name,
                "path": a.path,
                "size": a.size
            } for a in ex.artifacts]
        })
    return result

@router.delete("/{mission_id}")
def delete_mission(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Soft delete a mission.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    mission.is_deleted = True
    mission.deleted_at = datetime.datetime.utcnow()
    db.commit()
    
    return {"message": "Mission soft deleted successfully"}

@router.get('/metrics/agents')
def get_agent_metrics(request: Request, db: Session = Depends(get_db)):
    """
    Get aggregate execution metrics for all agents.
    """
    from backend.core.mission_models import AgentExecutionMetrics
    metrics = db.query(AgentExecutionMetrics).all()
    if metrics:
        return [{
            'agent_name': m.agent_name,
            'missions_run': m.missions_run,
            'tools_executed': m.tools_executed,
            'success_rate': m.success_rate,
            'avg_duration_ms': m.avg_duration_ms,
            'health_score': int((100 * 0.4) + ((m.success_rate or 0) * 0.4) + (20))
        } for m in metrics]

    # Fallback: derive a minimal agent view from mission executions so the UI
    # still has something useful to render when the rollup table is empty.
    from sqlalchemy import func, Integer
    from backend.core.mission_models import MissionExecution
    query = db.query(
        MissionExecution.agent_name,
        func.count(MissionExecution.id).label('runs'),
        func.sum(func.cast(MissionExecution.status == 'COMPLETED', Integer)).label('success_count'),
        func.avg(MissionExecution.execution_time_ms).label('avg_duration_ms'),
    ).group_by(MissionExecution.agent_name).all()

    return [{
        'agent_name': row.agent_name,
        'missions_run': row.runs or 0,
        'tools_executed': 0,
        'success_rate': round(((row.success_count or 0) / row.runs) * 100, 1) if row.runs else 0.0,
        'avg_duration_ms': int(row.avg_duration_ms or 0),
        'health_score': int(
            40
            + (40 * (((row.success_count or 0) / row.runs) if row.runs else 0))
            + 20
        ),
    } for row in query]

@router.get('/metrics/tools')
def get_tool_metrics(request: Request, db: Session = Depends(get_db)):
    """
    Get aggregate execution metrics for all tools.
    """
    from sqlalchemy import func, Integer
    from backend.core.mission_models import ToolExecution
    
    # Query tool execution grouped by agent_name AND tool_name
    query = db.query(
        ToolExecution.agent_name,
        ToolExecution.tool_name,
        func.count(ToolExecution.id).label('total_runs'),
        func.sum(func.cast(ToolExecution.status == 'skipped', Integer)).label('skipped_count'),
        func.sum(func.cast(ToolExecution.status == 'success', Integer)).label('success_count'),
        func.sum(func.cast(ToolExecution.status == 'failed', Integer)).label('failed_count')
    ).group_by(ToolExecution.agent_name, ToolExecution.tool_name).all()
    
    results = []
    for row in query:
        total = row.total_runs
        skipped = row.skipped_count or 0
        success = row.success_count or 0
        failed = row.failed_count or 0
        
        availability = 100
        
        executed = success + failed
        pass_rate = int((success / executed) * 100) if executed > 0 else 0
        fail_rate = int((failed / executed) * 100) if executed > 0 else 0
        
        results.append({
            'agent_name': row.agent_name,
            'tool_name': row.tool_name,
            'runs': total,
            'availability': availability,
            'pass_rate': pass_rate,
            'fail_rate': fail_rate,
            'skipped': skipped
        })
    if results:
        return results

    # Fallback: surface execution health even when no tool rollups exist yet.
    from backend.core.mission_models import MissionExecution
    fallback = db.query(
        MissionExecution.agent_name,
        func.count(MissionExecution.id).label('runs'),
        func.sum(func.cast(MissionExecution.status == 'COMPLETED', Integer)).label('success_count'),
        func.sum(func.cast(MissionExecution.status == 'FAILED', Integer)).label('failed_count')
    ).group_by(MissionExecution.agent_name).all()

    return [{
        'agent_name': row.agent_name,
        'tool_name': 'mission_execution',
        'runs': row.runs or 0,
        'availability': 100,
        'pass_rate': int(((row.success_count or 0) / row.runs) * 100) if row.runs else 0,
        'fail_rate': int(((row.failed_count or 0) / row.runs) * 100) if row.runs else 0,
        'skipped': 0
    } for row in fallback]

@router.get('/metrics/analytics')
def get_mission_analytics(request: Request, db: Session = Depends(get_db)):
    """
    Get overarching mission analytics.
    """
    from sqlalchemy import func
    import datetime
    from backend.core.mission_models import Mission
    
    today = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    missions_today = db.query(Mission).filter(Mission.created_at >= today).count()
    completed = db.query(Mission).filter(Mission.created_at >= today, Mission.status == 'COMPLETED').count()
    failed = db.query(Mission).filter(Mission.created_at >= today, Mission.status == 'FAILED').count()
    running = db.query(Mission).filter(Mission.created_at >= today, Mission.status == 'RUNNING').count()
    
    return {
        'missions_today': missions_today,
        'completed': completed,
        'failed': failed,
        'running': running,
        'average_duration': '2m 30s' # Placeholder for actual duration calculation
    }

_missions_logger = logging.getLogger(__name__)

@router.post("/{mission_id}/upload-codebase")
async def upload_codebase(mission_id: str, file: UploadFile = File(...)):
    """
    Upload a .zip of the project codebase. Extracts it and starts
    the file-system watcher so the TDD Execution Stream goes live.
    """
    if not file.filename or not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only .zip files accepted")

    content = await file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Max 200MB")

    workspace = Path(os.environ.get("WORKSPACE_DIR", "./workspace"))
    codebase_dir = workspace / "missions" / str(mission_id) / "codebase"
    codebase_dir.mkdir(parents=True, exist_ok=True)

    temp_zip = codebase_dir.parent / "upload.zip"
    temp_zip.write_bytes(content)

    try:
        with zipfile.ZipFile(temp_zip, 'r') as zf:
            # Zip-slip protection
            for member in zf.namelist():
                target = (codebase_dir / member).resolve()
                if not str(target).startswith(str(codebase_dir.resolve())):
                    raise HTTPException(400, f"Unsafe path in zip: {member}")
            zf.extractall(codebase_dir)
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid zip file")
    finally:
        temp_zip.unlink(missing_ok=True)

    # Start the file watcher on the extracted folder
    from backend.services.codebase_watcher import start_watcher
    start_watcher(str(mission_id), str(codebase_dir))

    file_count = sum(1 for f in codebase_dir.rglob('*') if f.is_file())
    _missions_logger.info(f"[UPLOAD] Mission {mission_id}: {file_count} files extracted to {codebase_dir}")

    # Store codebase_dir in mission_runtime so NFR tools (Semgrep) can find it
    try:
        from backend.core.mission_controller import mission_controller
        await mission_controller.set_mission_runtime(mission_id, {
            "codebase_dir": str(codebase_dir.resolve()),
            "backend_url": "http://localhost:8001",   # Target app port, prevents hitting platform on 8000
            "frontend_url": "http://localhost:3000",
        })
        _missions_logger.info(f"[UPLOAD] Stored codebase_dir in mission_runtime for {mission_id}")
    except Exception as e:
        _missions_logger.warning(f"[UPLOAD] Could not store mission_runtime: {e}")

    return {
        "status": "codebase_linked",
        "path": str(codebase_dir),
        "file_count": file_count,
        "mission_id": str(mission_id)
    }


@router.post("/{mission_id}/link-codebase")
async def link_codebase_path(mission_id: str, body: dict):
    """For local dev: link by folder path instead of upload."""
    folder_path = body.get("folder_path", "")
    if not folder_path or not Path(folder_path).exists():
        raise HTTPException(400, f"Folder does not exist: {folder_path}")

    from backend.services.codebase_watcher import start_watcher
    start_watcher(str(mission_id), folder_path)

    file_count = sum(1 for f in Path(folder_path).rglob('*') if f.is_file())
    _missions_logger.info(f"[LINK] Mission {mission_id}: linked to {folder_path} ({file_count} files)")

    # Store codebase_dir in mission_runtime so NFR tools can find it
    try:
        from backend.core.mission_controller import mission_controller
        await mission_controller.set_mission_runtime(mission_id, {
            "codebase_dir": str(Path(folder_path).resolve()),
            "backend_url": "http://localhost:8000",
            "frontend_url": "http://localhost:3000",
        })
    except Exception as e:
        _missions_logger.warning(f"[LINK] Could not store mission_runtime: {e}")

    return {
        "status": "codebase_linked",
        "path": folder_path,
        "file_count": file_count,
        "mission_id": str(mission_id)
    }


@router.get("/{mission_id}/codebase-files")
async def list_codebase_files(mission_id: str):
    workspace = os.environ.get("WORKSPACE_DIR", "./workspace")
    codebase_dir = Path(workspace) / "missions" / str(mission_id) / "codebase"
    
    if not codebase_dir.exists():
        return {"files": []}
    
    files = [
        str(f.relative_to(codebase_dir)).replace('\\', '/')
        for f in codebase_dir.rglob("*")
        if f.is_file() and not f.name.startswith("_") and "node_modules" not in str(f) and "__pycache__" not in str(f)
    ]
    return {"files": sorted(files)}


@router.post("/{mission_id}/connect-server")
async def connect_server(mission_id: str, body: dict):
    """
    Developer connects their running implementation server.
    Pings backend and frontend, then stores the URLs in the task's mission_runtime
    so the TDD executor and NFR Orchestrator know where to point tests.
    """
    import httpx
    from backend.core.mission_controller import mission_controller

    # Fallback to server_url for backward compatibility
    backend_url = body.get("backend_url", body.get("server_url", "http://localhost:8000")).rstrip("/")
    frontend_url = body.get("frontend_url", "http://localhost:3000").rstrip("/")
    _missions_logger.info(f"[SERVER-CONNECT] Mission {mission_id}: attempting to reach backend {backend_url} and frontend {frontend_url}")

    async def _ping(url: str):
        for path in ["/health", "/api/health", "/docs", "/"]:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(f"{url}{path}")
                    if response.status_code < 500:
                        return True, path
            except Exception:
                continue
        return False, None

    # Try to reach the servers
    backend_reachable, backend_path = await _ping(backend_url)
    frontend_reachable, frontend_path = await _ping(frontend_url)

    if not backend_reachable:
        return {"reachable": False, "error": f"No response from backend at {backend_url}"}

    # Store the server URLs in the mission_runtime
    try:
        await mission_controller.set_mission_runtime(mission_id, {
            "backend_url": backend_url,
            "frontend_url": frontend_url,
            "test_base_url": backend_url  # Legacy compatibility
        })
        _missions_logger.info(f"[SERVER-CONNECT] Stored mission_runtime for {mission_id}: backend={backend_url}, frontend={frontend_url}")
    except Exception as e:
        _missions_logger.error(f"[SERVER-CONNECT] Failed to store mission_runtime: {e}")

    return {
        "reachable": True, 
        "backend_url": backend_url, 
        "frontend_url": frontend_url,
        "backend_path": backend_path,
        "frontend_path": frontend_path
    }


@router.get("/{mission_id}/status")
def get_mission_status(request: Request, mission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get just the mission status.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    return {"mission_status": mission.mission_status or "CREATED"}

class OverrideRequest(BaseModel):
    module_name: str
    tool_name: str
    reason: str

@router.post("/{mission_id}/nfr/override")
def override_nfr_finding(
    mission_id: int, 
    body: OverrideRequest,
    request: Request, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Manually bypass a failing NFR check for a specific module and tool.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.is_deleted == False
    ).first()
    verify_mission_ownership(request, mission, current_user)
    
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")
        
    override = AuditOverride(
        mission_id=mission_id,
        module_name=body.module_name,
        tool_name=body.tool_name,
        reason=body.reason,
        approved_by=current_user.email
    )
    db.add(override)
    db.commit()
    
    _missions_logger.info(f"[NFR-OVERRIDE] User {current_user.email} overrode {body.tool_name} for module {body.module_name} in mission {mission_id}")
    
    return {"status": "success", "message": "NFR finding overridden"}

def _format_endpoint_md(ep) -> str:
    """Format a structured endpoint dict as readable Markdown. Falls back to str() for legacy strings."""
    import json as _json
    if not isinstance(ep, dict):
        return str(ep)
    method = ep.get('method', 'GET').upper()
    path = ep.get('path', '')
    lines = [f"**{method} {path}**"]
    req = ep.get('request_schema')
    if req:
        lines.append(f"  - Request: `{_json.dumps(req, separators=(',', ':'))}`")
    resp_ok = ep.get('response_success')
    if resp_ok:
        status = resp_ok.get('status', '200')
        body = resp_ok.get('body', {})
        lines.append(f"  - Success ({status}): `{_json.dumps(body, separators=(',', ':'))}`")
    for err in ep.get('response_errors', []):
        lines.append(f"  - Error {err.get('status', '?')}: {err.get('condition', '')}")
    return "\n".join(lines)


def render_plan_as_markdown(plan: dict) -> str:
    md = "# Implementation Plan\n\n"

    summary = plan.get("generation_summary", "")
    if summary:
        md += f"{summary}\n\n"

    # --- Plan-level open questions (system flags, endpoint collisions, etc.) ---
    plan_oqs = plan.get("open_questions", [])
    if plan_oqs:
        md += "## ⚠️ Plan-Level Flags\n"
        for q in plan_oqs:
            if not isinstance(q, dict):
                md += f"- {q}\n"
                continue
            blocking = q.get('blocking', False)
            prefix = "🔴 **[BLOCKING]**" if blocking else "🟡 **[WARNING]**"
            q_text = q.get('text', q.get('question', str(q)))
            md += f"- {prefix} {q_text}\n"
            suggestion = q.get('ai_suggested_answer')
            note = q.get('ai_suggestion_note')
            if suggestion:
                md += f"  - 💡 AI Suggestion: {suggestion}\n"
            elif note:
                md += f"  - 📝 Note: {note}\n"
        md += "\n"

    modules = plan.get("modules", [])
    for idx, mod in enumerate(modules):
        md += f"## Module {idx+1}: {mod.get('name', mod.get('module_name', 'Unnamed Module'))}\n\n"
        md += f"**ID:** `{mod.get('module_id', '')}`\n\n"

        desc = mod.get("module_summary", mod.get("description", ""))
        if desc:
            md += f"{desc}\n\n"

        risk = mod.get("risk_label", mod.get("risk_level", ""))
        rationale = mod.get("risk_rationale", "")
        if risk:
            md += f"**Risk Level:** {risk}"
            if rationale:
                md += f" ({rationale})"
            md += "\n\n"

        md += "### Required Files\n"
        files_create = mod.get("files_to_create", mod.get("files_required", []))
        files_update = mod.get("files_to_update", [])
        for f in files_create:
            md += f"- [NEW] `{f}`\n"
        for f in files_update:
            md += f"- [UPDATE] `{f}`\n"
        md += "\n"

        if mod.get("api_endpoints_implemented"):
            md += "### API Endpoints\n"
            for ep in mod.get("api_endpoints_implemented", []):
                md += _format_endpoint_md(ep) + "\n\n"

        if mod.get("schema_changes"):
            md += "### Schema Changes\n"
            for sc in mod.get("schema_changes", []):
                md += f"- {sc}\n"
            md += "\n"

        if mod.get("new_dependencies"):
            md += "### New Dependencies\n"
            for dep in mod.get("new_dependencies", []):
                if isinstance(dep, dict):
                    pkg = dep.get('package', '')
                    ver = dep.get('version', '')
                    why = dep.get('justification', '')
                    md += f"- `{pkg}` {ver}" + (f" — {why}" if why else "") + "\n"
                else:
                    md += f"- {dep}\n"
            md += "\n"

        if mod.get("binding_constraints"):
            md += "### Binding Constraints\n"
            for c in mod.get("binding_constraints", []):
                md += f"- {c}\n"
            md += "\n"

        if mod.get("acceptance_criteria"):
            md += "### Acceptance Criteria\n"
            for c in mod.get("acceptance_criteria", []):
                md += f"- [ ] {c.get('description', str(c)) if isinstance(c, dict) else str(c)}\n"
            md += "\n"

        if mod.get("edge_cases"):
            md += "### Edge Cases\n"
            for c in mod.get("edge_cases", []):
                md += f"- {c.get('description', str(c)) if isinstance(c, dict) else str(c)}\n"
            md += "\n"

        if mod.get("error_handling_requirements"):
            md += "### Error Handling\n"
            for c in mod.get("error_handling_requirements", []):
                md += f"- {c.get('description', str(c)) if isinstance(c, dict) else str(c)}\n"
            md += "\n"

        if mod.get("open_questions"):
            md += "### Open Questions\n"
            for q in mod.get("open_questions", []):
                if not isinstance(q, dict):
                    md += f"- ? {q}\n"
                    continue
                blocking = q.get('blocking', False)
                prefix = "🔴 **[BLOCKING]**" if blocking else "?"
                q_text = q.get('text', q.get('question', q.get('description', str(q))))
                md += f"- {prefix} {q_text}\n"
                suggestion = q.get('ai_suggested_answer')
                note = q.get('ai_suggestion_note')
                if suggestion:
                    md += f"  - 💡 AI Suggestion: {suggestion}\n"
                elif note:
                    md += f"  - 📝 Note: {note}\n"
                if q.get('developer_answer'):
                    md += f"  - ✅ Developer Answer: {q['developer_answer']}\n"
            md += "\n"

    return md

@router.get("/{mission_id}/plan/export")
async def export_plan(mission_id: str, format: str = "markdown"):
    from backend.core.mission_controller import mission_controller
    from fastapi import Response, HTTPException
    import json
    
    state = await mission_controller.get_mission_runtime(mission_id)
    if not state or not state.get("plan_json"):
        raise HTTPException(404, "No plan found")
        
    plan = state.get("plan_json")

    if format == "json":
        return Response(
            content=json.dumps(plan, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="implementation-plan-{mission_id[:8]}.json"'}
        )

    md = render_plan_as_markdown(plan)
    return Response(
        content=md, 
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="implementation-plan-{mission_id[:8]}.md"'}
    )

