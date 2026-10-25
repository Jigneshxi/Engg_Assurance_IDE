"""
================================================================================
CONVERGE PHASE 2.1 - MULTI-SOURCE CONFLICT STUDIO API
================================================================================
Endpoints for detecting and resolving contradictory requirements across sources.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.core.database import get_db, GenerationTask
from backend.core.conflict_detector import detect_conflicts, apply_resolution

router = APIRouter(prefix="/api/conflict", tags=["Conflict Resolution Studio"])
logger = logging.getLogger(__name__)


class ConflictDetectRequest(BaseModel):
    source_blocks: List[Dict[str, Any]]   # [{ref_id, platform, source_id, summary, content}]
    task_id: Optional[str] = None


class ConflictResolveRequest(BaseModel):
    conflict_id: str
    resolution: str
    conflicts: List[Dict[str, Any]]
    source_blocks: Optional[List[Dict[str, Any]]] = []


@router.post("/detect")
def detect_requirement_conflicts(req: ConflictDetectRequest):
    """
    CONFLICT DETECTION — Analyze ingested sources for contradictions.

    Accepts the same source_blocks produced by the /api/fetch/requirements
    pipeline and returns a list of detected conflicts with severity scores,
    side-by-side claims, and AI-recommended resolutions.

    Used by the Conflict Studio UI before Forge initiation.
    """
    try:
        if len(req.source_blocks) < 2:
            return {
                "conflicts": [],
                "conflict_count": 0,
                "has_critical": False,
                "message": "At least 2 sources required for conflict detection."
            }

        conflicts = detect_conflicts(req.source_blocks)
        conflict_dicts = [c.to_dict() for c in conflicts]

        has_critical = any(c.get("severity") == "CRITICAL" for c in conflict_dicts)
        has_high = any(c.get("severity") == "HIGH" for c in conflict_dicts)

        logger.info(f"[CONFLICT-DETECT] Found {len(conflicts)} conflicts. Critical: {has_critical}")

        return {
            "conflicts": conflict_dicts,
            "conflict_count": len(conflicts),
            "has_critical": has_critical,
            "has_high": has_high,
            "forge_blocked": has_critical,  # Block Forge if critical conflicts exist
            "message": (
                f"⚠️ {len(conflicts)} conflict(s) detected. "
                f"{'Forge is BLOCKED until critical conflicts are resolved.' if has_critical else 'Review before proceeding.'}"
                if conflicts else "✅ No conflicts detected. Sources are consistent."
            )
        }

    except Exception as e:
        logger.error(f"[CONFLICT-DETECT] Detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Conflict detection failed: {str(e)}")


@router.post("/resolve")
def resolve_conflict(req: ConflictResolveRequest):
    """
    CONFLICT RESOLUTION — Apply a user-selected resolution to a conflict.

    Called when the user clicks Accept/Reject in the Conflict Studio.
    Returns the updated conflict state and whether Forge is now unblocked.
    """
    try:
        result = apply_resolution(
            req.source_blocks or [],
            req.conflict_id,
            req.resolution,
            req.conflicts
        )

        # Check if all critical conflicts are now resolved
        remaining_critical = [
            c for c in req.conflicts
            if c.get("severity") == "CRITICAL"
            and c.get("conflict_id") != req.conflict_id
            and not c.get("resolved")
        ]

        return {
            **result,
            "remaining_critical": len(remaining_critical),
            "forge_unblocked": len(remaining_critical) == 0
        }

    except Exception as e:
        logger.error(f"[CONFLICT-RESOLVE] Resolution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Conflict resolution failed: {str(e)}")


@router.get("/status/{task_id}")
def get_conflict_status(task_id: str, db: Session = Depends(get_db)):
    """
    CONFLICT STATUS — Get conflict detection results for a completed task.
    Reads from the task's partial_state if conflict data was stored during ingestion.
    """
    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    merged = {**(task.result or {}), **(task.partial_state or {})}
    conflicts = merged.get("conflict_analysis") or []

    return {
        "task_id": task_id,
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
        "has_critical": any(c.get("severity") == "CRITICAL" for c in conflicts)
    }
