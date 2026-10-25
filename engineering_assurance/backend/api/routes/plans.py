"""
================================================================================
PLANS ROUTER — API Endpoints (Milestone 4)
================================================================================
Handles:
- /api/plans/{mission_id}/generate (Trigger Phase 3 Plan Generation)
- /api/plans/{mission_id} (Get the current plan)
- /api/plans/{mission_id}/approve (Approve the plan and proceed to Code Gen)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any

from backend.core.database import get_db, Mission
from backend.core.mission_models import MissionStatus
from backend.api.routes.auth import get_current_user
from backend.core.auth_models import User
from backend.agents.graphs.plan_graph import build_plan_graph
from backend.core.mission_controller import mission_controller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plans", tags=["Implementation Plans"])

class PlanApprovalRequest(BaseModel):
    notes: str = ""
    override_questions: bool = False

@router.post("/{mission_id}/generate")
async def generate_plan(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Trigger the Plan Generation graph.
    """
    mission = db.query(Mission).filter(Mission.correlation_id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    mission.status = MissionStatus.PLAN_GENERATION_RUNNING
    db.commit()
    
    state = await mission_controller.get_mission_runtime(mission_id)
    if not state:
        state = {"mission_id": mission.id, "task_id": mission_id}
        
    graph = build_plan_graph()
    
    try:
        final_state = graph.invoke(state)
        await mission_controller.set_mission_runtime(mission_id, final_state)
        
        if final_state.get("status") == "FAILED":
            mission.status = MissionStatus.FAILED
            db.commit()
            raise HTTPException(status_code=500, detail=final_state.get("error", "Plan generation failed"))
            
        mission.status = MissionStatus.PLAN_PENDING
        db.commit()
        
        return {"status": "success", "plan": final_state.get("plan_json")}
        
    except Exception as e:
        logger.error(f"[PLAN-API] Generation failed: {e}")
        mission.status = MissionStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{mission_id}")
async def get_plan(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the current implementation plan."""
    mission = db.query(Mission).filter(Mission.correlation_id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    state = await mission_controller.get_mission_runtime(mission_id)
    if not state or not state.get("plan_json"):
        raise HTTPException(status_code=404, detail="Plan not generated yet")
        
    return {
        "status": mission.status,
        "plan": state.get("plan_json"),
        "open_questions": state.get("open_questions", []),
        "approval": state.get("approval", {})
    }

@router.post("/{mission_id}/approve")
async def approve_plan(
    mission_id: str,
    request: PlanApprovalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve the plan. Block if there are unresolved blocking questions,
    unless explicitly overridden.
    """
    mission = db.query(Mission).filter(Mission.correlation_id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    state = await mission_controller.get_mission_runtime(mission_id)
    if not state or not state.get("plan_json"):
        raise HTTPException(status_code=400, detail="No plan to approve")
        
    open_questions = state.get("open_questions", [])
    has_blocking = any(q.get("blocking", False) for q in open_questions)
    
    if has_blocking and not request.override_questions:
        raise HTTPException(
            status_code=400, 
            detail="Cannot approve plan with unresolved blocking questions. Resolve them or use override."
        )
        
    state["plan_approved"] = True
    state["approval"] = {
        "status": "APPROVED",
        "approved_by": current_user.id,
        "notes": request.notes
    }
    
    await mission_controller.set_mission_runtime(mission_id, state)
    
    mission.status = MissionStatus.PLAN_APPROVED
    db.commit()
    
    return {"status": "success", "message": "Plan approved, ready for code generation."}
