from enum import Enum
from typing import Dict, Any, List
import datetime
import logging
from backend.core.phase_contracts import validate_phase_output

logger = logging.getLogger(__name__)

class MissionStatus(str, Enum):
    CREATED = "CREATED"
    PHASE1_RUNNING = "PHASE1_RUNNING"
    HITL1_PENDING = "HITL1_PENDING"
    PHASE1_APPROVED = "PHASE1_APPROVED"
    PHASE2_RUNNING = "PHASE2_RUNNING"
    HITL2_PENDING = "HITL2_PENDING"
    PHASE2_APPROVED = "PHASE2_APPROVED"
    PLAN_GENERATION_RUNNING = "PLAN_GENERATION_RUNNING"
    PLAN_PENDING = "PLAN_PENDING"
    PLAN_APPROVED = "PLAN_APPROVED"
    PHASE3_RUNNING = "PHASE3_RUNNING"
    TDD_GREEN = "TDD_GREEN"
    PHASE4_RUNNING = "PHASE4_RUNNING"
    NFR_GREEN = "NFR_GREEN"
    PHASE5_RUNNING = "PHASE5_RUNNING"
    MISSION_COMPLETE = "MISSION_COMPLETE"
    PARTIAL_FAILURE = "PARTIAL_FAILURE"  # Some modules succeeded, at least one failed (e.g. git push 403)
    FAILED = "FAILED"

VALID_TRANSITIONS = {
    MissionStatus.CREATED:          [MissionStatus.PHASE1_RUNNING, MissionStatus.FAILED],
    MissionStatus.PHASE1_RUNNING:   [MissionStatus.HITL1_PENDING, MissionStatus.FAILED],
    MissionStatus.HITL1_PENDING:    [MissionStatus.PHASE1_APPROVED, MissionStatus.FAILED],
    MissionStatus.PHASE1_APPROVED:  [MissionStatus.PHASE2_RUNNING, MissionStatus.FAILED],
    MissionStatus.PHASE2_RUNNING:   [MissionStatus.HITL2_PENDING, MissionStatus.FAILED],
    MissionStatus.HITL2_PENDING:    [MissionStatus.PHASE2_APPROVED, MissionStatus.FAILED],
    MissionStatus.PHASE2_APPROVED:  [MissionStatus.PLAN_GENERATION_RUNNING, MissionStatus.FAILED],
    MissionStatus.PLAN_GENERATION_RUNNING: [MissionStatus.PLAN_PENDING, MissionStatus.FAILED],
    MissionStatus.PLAN_PENDING:    [MissionStatus.PLAN_APPROVED, MissionStatus.FAILED],
    MissionStatus.PLAN_APPROVED:    [MissionStatus.PHASE3_RUNNING, MissionStatus.FAILED],
    MissionStatus.PHASE3_RUNNING:   [MissionStatus.TDD_GREEN, MissionStatus.PARTIAL_FAILURE, MissionStatus.FAILED],
    MissionStatus.TDD_GREEN:        [MissionStatus.PHASE4_RUNNING, MissionStatus.FAILED],
    MissionStatus.PHASE4_RUNNING:   [MissionStatus.NFR_GREEN, MissionStatus.PHASE3_RUNNING, MissionStatus.FAILED],
    MissionStatus.NFR_GREEN:        [MissionStatus.PHASE5_RUNNING, MissionStatus.FAILED],
    MissionStatus.PHASE5_RUNNING:   [MissionStatus.MISSION_COMPLETE, MissionStatus.FAILED],
    MissionStatus.PARTIAL_FAILURE:  [MissionStatus.PLAN_APPROVED, MissionStatus.PHASE4_RUNNING, MissionStatus.FAILED],  # Retryable
    MissionStatus.FAILED:   [],  # Terminal — no outbound transitions
}


class MissionController:
    
    def _get_mission(self, db, mission_id: str):
        from backend.core.mission_models import Mission
        import uuid
        
        # 1. Try parsing as direct Mission.id
        try:
            return db.query(Mission).filter(Mission.id == int(mission_id), Mission.is_deleted == False).first()
        except ValueError:
            pass # It's a string (e.g. task_id UUID)
            
        # 2. Try parsing as UUID
        try:
            uuid.UUID(str(mission_id))
            
            # 2a. Try correlation_id
            mission = db.query(Mission).filter(Mission.correlation_id == str(mission_id), Mission.is_deleted == False).first()
            if mission:
                return mission
                
            # 2b. Try GenerationTask mapping (Legacy / drift fallback)
            from backend.core.database import GenerationTask
            gt = db.query(GenerationTask).filter(GenerationTask.task_id == str(mission_id)).first()
            if gt and gt.mission_id:
                return db.query(Mission).filter(Mission.id == gt.mission_id, Mission.is_deleted == False).first()
                
            return None
        except ValueError:
            return None

    async def get_status(self, mission_id: str) -> MissionStatus:
        from backend.core.database import SessionLocal
        from backend.core.mission_models import Mission
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            if not task:
                raise RuntimeError(f"Mission {mission_id} not found")
            return MissionStatus(task.mission_status or "CREATED")
        finally:
            db.close()

    async def set_status(self, mission_id: str, status: MissionStatus):
        from backend.core.database import SessionLocal
        from backend.core.mission_models import Mission
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            task.mission_status = status.value
            db.commit()
        finally:
            db.close()

    async def transition_status(self, mission_id: str, new_status: MissionStatus):
        current = await self.get_status(mission_id)
        if not current:
            current = MissionStatus.CREATED
            
        allowed = VALID_TRANSITIONS.get(current, [])
        if new_status not in allowed:
            raise RuntimeError(
                f"Invalid transition: {current} → {new_status}. "
                f"Allowed: {allowed}"
            )
        await self.set_status(mission_id, new_status)
        
    async def approve_phase1(self, mission_id: str):
        await self.transition_status(mission_id, MissionStatus.PHASE1_APPROVED)
        await self.transition_status(mission_id, MissionStatus.PHASE2_RUNNING)

    async def approve_phase2(self, mission_id: str):
        await self.transition_status(mission_id, MissionStatus.PHASE2_APPROVED)
        await self.transition_status(mission_id, MissionStatus.PLAN_GENERATION_RUNNING)

    async def approve_phase3_plan(self, mission_id: str):
        await self.transition_status(mission_id, MissionStatus.PLAN_APPROVED)
        await self.transition_status(mission_id, MissionStatus.PHASE3_RUNNING)

    async def fail_mission(self, mission_id: str):
        await self.transition_status(mission_id, MissionStatus.FAILED)
        
    async def soft_delete_mission(self, mission_id: str):
        from backend.core.database import SessionLocal
        db = SessionLocal()
        try:
            # Bypass the _get_mission filter to ensure we can find it even if it's already deleted
            from backend.core.mission_models import Mission
            import uuid
            
            mission = None
            try:
                mission = db.query(Mission).filter(Mission.id == int(mission_id)).first()
            except ValueError:
                try:
                    uuid.UUID(str(mission_id))
                    mission = db.query(Mission).filter(Mission.correlation_id == str(mission_id)).first()
                    if not mission:
                        from backend.core.database import GenerationTask
                        gt = db.query(GenerationTask).filter(GenerationTask.task_id == str(mission_id)).first()
                        if gt and gt.mission_id:
                            mission = db.query(Mission).filter(Mission.id == gt.mission_id).first()
                except ValueError:
                    pass

            if mission:
                mission.is_deleted = True
                mission.deleted_at = datetime.datetime.now(datetime.timezone.utc)
                db.commit()
                logger.info(f"Soft deleted mission: {mission_id}")
            else:
                logger.warning(f"Attempted to soft delete unknown mission: {mission_id}")
        finally:
            db.close()
        
    def get_thread_id(self, mission_id: str, phase: int) -> str:
        return f"{mission_id}-phase{phase}"
        
    async def get_phase_output(self, mission_id: str, phase: int) -> dict:
        from backend.core.database import SessionLocal
        from backend.core.mission_models import Mission
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            if not task or not task.phase_outputs:
                return {}
            return task.phase_outputs.get(str(phase), {})
        finally:
            db.close()
        
    async def save_phase_output(self, mission_id: str, phase: int, output: dict):
        from backend.core.database import SessionLocal
        from backend.core.mission_models import Mission
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            if not task.phase_outputs:
                task.phase_outputs = {}
            
            # Create a new dict to ensure SQLAlchemy detects the change
            new_outputs = dict(task.phase_outputs)
            new_outputs[str(phase)] = output
            task.phase_outputs = new_outputs
            
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(task, "phase_outputs")
            db.commit()
        finally:
            db.close()
        
    async def persist_phase_output(self, mission_id: str, phase: int, output: dict):
        existing = await self.get_phase_output(mission_id, phase)
        current_status = await self.get_status(mission_id)
        
        # Allow re-persist if mission is retrying after a failed run
        if existing and not existing.get("reset_allowed"):
            if current_status not in [MissionStatus.HITL2_PENDING, MissionStatus.FAILED, MissionStatus.PARTIAL_FAILURE]:
                raise RuntimeError(
                    f"Phase {phase} output already persisted for mission {mission_id}. "
                    f"Use mission reset to overwrite."
                )
            # Allow overwrite on retry
            logger.info(f"[PERSIST] Overwriting Phase {phase} output for mission {mission_id} (retry)")
            
        validate_phase_output(phase, output)
        
        output_copy = dict(output)
        output_copy["persisted_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        await self.save_phase_output(mission_id, phase, output_copy)

    async def load_phase_output(self, mission_id: str, phase: int) -> dict:
        output = await self.get_phase_output(mission_id, phase)
        if not output:
            raise RuntimeError(f"No persisted output found for mission {mission_id} phase {phase}")
        return output

    async def get_mission_runtime(self, mission_id: str) -> dict:
        from backend.core.database import SessionLocal
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            if not task:
                return {}
            return task.execution_context or {}
        finally:
            db.close()

    async def set_mission_runtime(self, mission_id: str, updates: dict):
        from backend.core.database import SessionLocal
        db = SessionLocal()
        try:
            task = self._get_mission(db, mission_id)
            if not task:
                raise RuntimeError(f"Mission {mission_id} not found")
            
            current_context = task.execution_context or {}
            
            # Create new dict so SQLAlchemy detects the change
            new_context = dict(current_context)
            new_context.update(updates)
            
            task.execution_context = new_context
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(task, "execution_context")
            db.commit()
        finally:
            db.close()

    async def start_phase5(self, mission_id: str):
        from backend.agents.graphs.phase5_graph import build_phase5_graph
        from backend.agents.state import write_partial_state, flush_partial_state

        try:
            phase1 = await self.load_phase_output(mission_id, 1)
        except Exception:
            phase1 = {}
        try:
            phase2 = await self.load_phase_output(mission_id, 2)
        except Exception:
            phase2 = {}
        try:
            phase3 = await self.load_phase_output(mission_id, 3)
        except Exception:
            phase3 = {}
        try:
            phase4 = await self.load_phase_output(mission_id, 4)
        except Exception:
            phase4 = {}
        
        initial_state = {**phase1, **phase2, **phase3, **phase4}
        initial_state["mission_id"] = mission_id
        initial_state["task_id"] = mission_id
        
        await self.transition_status(mission_id, MissionStatus.PHASE5_RUNNING)
        phase5_graph = build_phase5_graph()

        try:
            async for output in phase5_graph.astream(
                initial_state,
                config={"configurable": {
                    "thread_id": self.get_thread_id(mission_id, 5)
                }},
                stream_mode="updates"
            ):
                for node_name, node_output in output.items():
                    logger.info(f"[PHASE5-NODE] {node_name} completed.")
                    write_partial_state(mission_id, node_output)

            flush_partial_state(mission_id)
            logger.info(f"[PHASE5] Mission {mission_id} complete.")

        except Exception as e:
            logger.error(f"[PHASE5] start_phase5 FAILED for {mission_id}: {e}", exc_info=True)
            try:
                await self.transition_status(mission_id, MissionStatus.FAILED)
            except Exception as te:
                logger.warning(f"[PHASE5] Could not transition to FAILED: {te}")

mission_controller = MissionController()
