"""
Reset the latest Phase 1 mission back to HITL1_PENDING so the user can
approve Phase 1 again after the flag_modified fix is applied.

Usage:
  python reset_for_phase2_retry.py [mission_id]
  
  If no mission_id given, resets the most recent MISSION_FAILED or PHASE1_APPROVED mission.
"""
import sys
sys.path.insert(0, '.')
from backend.core.database import SessionLocal, GenerationTask
from backend.core.mission_models import Mission
from sqlalchemy.orm.attributes import flag_modified

def reset_mission(mission_id: int = None):
    with SessionLocal() as db:
        if mission_id:
            mission = db.query(Mission).filter(Mission.id == mission_id).first()
        else:
            # Find most recent mission in a broken state
            mission = (
                db.query(Mission)
                .filter(Mission.mission_status.in_(["MISSION_FAILED", "PHASE1_APPROVED", "PHASE2_RUNNING"]))
                .order_by(Mission.id.desc())
                .first()
            )
        
        if not mission:
            print("No mission found to reset.")
            return
        
        print(f"Resetting Mission {mission.id} (current status: {mission.mission_status})")
        
        # Reset mission status to HITL1_PENDING so approve button works again
        mission.mission_status = "HITL1_PENDING"
        
        # Also reset associated task(s)
        tasks = db.query(GenerationTask).filter(GenerationTask.mission_id == mission.id).all()
        for task in tasks:
            if task.status in ("FAILED", "PROCESSING"):
                print(f"  Resetting task {task.task_id[:8]} from {task.status} -> COMPLETED (HITL pending)")
                task.status = "COMPLETED"
                task.error = None
                # Keep result so HITL panel shows content
                flag_modified(task, "result")
        
        db.commit()
        print(f"Mission {mission.id} reset to HITL1_PENDING. Task(s) reset to COMPLETED.")
        print(f"You can now click 'Approve Phase 1' to re-trigger Phase 2.")

if __name__ == "__main__":
    mid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    reset_mission(mid)
