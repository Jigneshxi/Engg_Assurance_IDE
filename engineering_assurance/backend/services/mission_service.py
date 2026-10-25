import datetime
import uuid
import logging
import json
from sqlalchemy.orm import Session
from backend.core.config import settings
from backend.services.storage_provider import DatabaseStorageProvider
from backend.core.mission_models import (
    Mission, MissionArtifact, MissionExecution, MissionEvent,
    MissionStatus, AgentStatus, EventSeverity, EventType,
    BaselineRun, AIRegression
)

logger = logging.getLogger(__name__)

class MissionService:
    @staticmethod
    def create_mission(
        db: Session,
        user_id: int,
        mission_name: str,
        mission_type: str,
        execution_depth: str,
        input_payload: dict,
        total_agents: int = 0,
        requirement_hash: str = None,
        correlation_id: str = None,
        execution_mode: str = "analysis",
        created_from_context: bool = False,
        execution_context: dict = None,
        execution_readiness: dict = None,
        risk_level_snapshot: str = "low",
        mission_manifest: dict = None,
        artifact_coverage: dict = None,
        configured_agents_count: int = None,
        eligible_agents_count: int = None,
        executed_agents_count: int = 0,
        bypassed_agents_count: int = 0,
        failed_agents_count: int = 0,
    ) -> Mission:
        if not correlation_id:
            correlation_id = f"MIS-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

        configured_agents_count = total_agents if configured_agents_count is None else configured_agents_count
        eligible_agents_count = configured_agents_count if eligible_agents_count is None else eligible_agents_count
        
        mission = Mission(
            correlation_id=correlation_id,
            mission_name=mission_name,
            mission_type=mission_type,
            created_by=user_id,
            status=MissionStatus.RUNNING,
            execution_depth=execution_depth,
            input_payload=input_payload,
            total_agents=total_agents,
            current_phase="PHASE_1",
            phase_status={"PHASE_1": "RUNNING"},
            requirement_hash=requirement_hash,
            execution_mode=execution_mode,
            created_from_context=created_from_context,
            execution_context=execution_context,
            execution_readiness=execution_readiness,
            risk_level_snapshot=risk_level_snapshot,
            mission_manifest=mission_manifest,
            artifact_coverage=artifact_coverage,
            configured_agents_count=configured_agents_count,
            eligible_agents_count=eligible_agents_count,
            executed_agents_count=executed_agents_count,
            bypassed_agents_count=bypassed_agents_count,
            failed_agents_count=failed_agents_count,
            failed_agents=failed_agents_count,
        )
        db.add(mission)
        db.commit()
        db.refresh(mission)
        
        MissionService.log_event(
            db, mission.id, EventType.MISSION_CREATED, EventSeverity.INFO, 
            message=f"Mission '{mission_name}' initialized with {configured_agents_count} configured agents."
        )
        MissionService.log_event(
            db, mission.id, EventType.MISSION_PHASE_STARTED, EventSeverity.INFO, 
            message="PHASE_1 started.", phase_name="PHASE_1"
        )
        return mission

    @staticmethod
    def attach_phase_to_mission(db: Session, mission_id: int, phase: str, additional_agents: int = 0) -> Mission:
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            return None
            
        # Update previous phase status
        if mission.current_phase:
            status_dict = mission.phase_status.copy() if mission.phase_status else {}
            status_dict[mission.current_phase] = "COMPLETED"
            mission.phase_status = status_dict
            
            MissionService.log_event(
                db, mission_id, EventType.MISSION_PHASE_COMPLETED, EventSeverity.INFO, 
                message=f"{mission.current_phase} completed.", phase_name=mission.current_phase
            )
            
        mission.current_phase = phase
        status_dict = mission.phase_status.copy() if mission.phase_status else {}
        status_dict[phase] = "RUNNING"
        mission.phase_status = status_dict
        
        mission.total_agents += additional_agents
        mission.configured_agents_count = (mission.configured_agents_count or 0) + additional_agents
        mission.eligible_agents_count = (mission.eligible_agents_count or 0) + additional_agents
        db.commit()
        db.refresh(mission)
        
        MissionService.log_event(
            db, mission.id, EventType.MISSION_PHASE_STARTED, EventSeverity.INFO, 
            message=f"{phase} started. Added {additional_agents} expected agents.", phase_name=phase
        )
        return mission

    @staticmethod
    def update_mission_manifest(db: Session, mission_id: int, manifest: dict):
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            return None
        mission.mission_manifest = manifest
        if isinstance(manifest, dict):
            metrics = manifest.get("metrics") or {}
            mission.total_agents = metrics.get("configured", mission.total_agents or 0)
            mission.configured_agents_count = metrics.get("configured", mission.configured_agents_count or 0)
            mission.eligible_agents_count = metrics.get("eligible", mission.eligible_agents_count or 0)
            mission.executed_agents_count = metrics.get("executed", mission.executed_agents_count or 0)
            mission.bypassed_agents_count = metrics.get("bypassed", mission.bypassed_agents_count or 0)
            mission.failed_agents_count = metrics.get("failed", mission.failed_agents_count or 0)
            mission.failed_agents = metrics.get("failed", mission.failed_agents or 0)
            mission.artifact_coverage = manifest.get("artifact_coverage") or mission.artifact_coverage
        db.commit()
        db.refresh(mission)
        return mission

    @staticmethod
    def log_event(db: Session, mission_id: int, event_type: EventType, severity: EventSeverity, message: str = None, agent_name: str = None, phase_name: str = None):
        # Allow looking up current phase if not provided
        if not phase_name:
            mission = db.query(Mission).filter(Mission.id == mission_id).first()
            if mission:
                phase_name = mission.current_phase

        event = MissionEvent(
            mission_id=mission_id,
            agent_name=agent_name,
            event_type=event_type,
            severity=severity,
            message=message,
            phase_name=phase_name
        )
        db.add(event)
        db.commit()

    @staticmethod
    def start_execution(db: Session, mission_id: int, agent_name: str) -> MissionExecution:
        # Update mission status if this is the first execution
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if mission and mission.status == MissionStatus.PENDING:
            mission.status = MissionStatus.RUNNING
            MissionService.log_event(db, mission_id, EventType.MISSION_STARTED, EventSeverity.INFO, message="Mission execution started.")

        execution = MissionExecution(
            mission_id=mission_id,
            agent_name=agent_name,
            status=AgentStatus.RUNNING,
            started_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(execution)
        db.commit()
        db.refresh(execution)
        
        MissionService.log_event(db, mission_id, EventType.AGENT_STARTED, EventSeverity.INFO, agent_name=agent_name, message=f"{agent_name} processing started.")
        return execution

    @staticmethod
    def complete_execution(db: Session, execution_id: int, execution_time_ms: int):
        execution = db.query(MissionExecution).filter(MissionExecution.id == execution_id).first()
        if execution:
            execution.status = AgentStatus.COMPLETED
            execution.completed_at = datetime.datetime.now(datetime.timezone.utc)
            execution.execution_time_ms = execution_time_ms
            
            # Increment mission completed agents count
            mission = execution.mission
            mission.completed_agents += 1
            mission.executed_agents_count = (mission.executed_agents_count or 0) + 1
            
            db.commit()
            
            MissionService.log_event(db, execution.mission_id, EventType.AGENT_COMPLETED, EventSeverity.INFO, agent_name=execution.agent_name, message=f"{execution.agent_name} completed successfully in {execution_time_ms}ms.")
            
    @staticmethod
    def fail_execution(db: Session, execution_id: int, error_message: str, execution_time_ms: int = 0):
        execution = db.query(MissionExecution).filter(MissionExecution.id == execution_id).first()
        if execution:
            execution.status = AgentStatus.FAILED
            execution.completed_at = datetime.datetime.now(datetime.timezone.utc)
            execution.execution_time_ms = execution_time_ms
            execution.error_message = error_message
            
            # Increment mission failed agents count
            mission = execution.mission
            mission.failed_agents += 1
            mission.failed_agents_count = (mission.failed_agents_count or 0) + 1
            mission.executed_agents_count = (mission.executed_agents_count or 0) + 1
            
            db.commit()
            
            MissionService.log_event(db, execution.mission_id, EventType.AGENT_FAILED, EventSeverity.ERROR, agent_name=execution.agent_name, message=f"{execution.agent_name} failed: {error_message}")

    @staticmethod
    def save_artifact(db: Session, mission_id: int, agent_name: str, artifact_type: str, artifact_json: dict, artifact_size: int = 0, artifact_hash: str = None, dependency_snapshot: dict = None, producer_version: str = None) -> MissionArtifact:
        storage_provider = DatabaseStorageProvider()
        
        # Inject dependency_snapshot for hash verification later
        if isinstance(artifact_json, dict) and dependency_snapshot:
            artifact_json["_dependency_snapshot"] = dependency_snapshot
        if isinstance(artifact_json, dict):
            artifact_json.setdefault("producer_version", producer_version or settings.VERSION)
            
        artifact_content = json.dumps(artifact_json) if isinstance(artifact_json, (dict, list)) else str(artifact_json)
        
        if artifact_size == 0 and artifact_content:
            try:
                artifact_size = len(json.dumps(artifact_json if isinstance(artifact_json, (dict, list)) else artifact_content, ensure_ascii=False).encode('utf-8'))
            except Exception:
                artifact_size = len(artifact_content.encode('utf-8'))
                
        artifact = storage_provider.save_artifact(
            db=db, 
            mission_id=mission_id, 
            agent_name=agent_name, 
            artifact_type=artifact_type, 
            artifact_content=artifact_content, 
            artifact_size=artifact_size, 
            artifact_hash=artifact_hash,
            producer_version=producer_version or settings.VERSION,
            artifact_json=artifact_json if isinstance(artifact_json, (dict, list)) else None,
        )
        
        if not artifact:
            class ArtifactPersistenceError(Exception): pass
            raise ArtifactPersistenceError(f"Failed to persist artifact {artifact_type} for mission {mission_id}.")
            
        # Invalidate related node caches to prevent stale QA-domain cache hits (Task 0.1)
        ARTIFACT_NODE_MAP = {
            "UI_MOCKUP": ["visual_intel", "cross_browser", "ux_intelligence"],
            "SECURITY_SPEC": ["security", "compliance_remediation"],
            "PERF_PROFILE": ["performance", "perf_intel"],
            "API_SPEC": ["api_coder", "api_validation", "service_architecture_mesh"],
            "TEST_CASES": ["suite_optimization", "run_orchestrator", "automation_forge"],
            "ARCHITECTURE": ["microservices", "env_consistency"]
        }
        
        if artifact_type in ARTIFACT_NODE_MAP:
            try:
                from backend.core.node_cache import node_cache
                for node_key in ARTIFACT_NODE_MAP[artifact_type]:
                    node_cache.invalidate(node_key)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to invalidate cache for artifact type {artifact_type}: {e}")

        MissionService.log_event(db, mission_id, EventType.ARTIFACT_SAVED, EventSeverity.INFO, agent_name=agent_name, message=f"Artifact of type '{artifact_type}' saved.")
        return artifact

    @staticmethod
    def resolve_artifact(db: Session, mission_id: int, artifact_type: str):
        """
        Resolves the latest approved artifact of the given type for the mission.
        Returns a dictionary with freshness payload (Sprint 3B).
        """
        artifact = db.query(MissionArtifact).filter(
            MissionArtifact.mission_id == mission_id,
            MissionArtifact.artifact_type == artifact_type
        ).order_by(MissionArtifact.created_at.desc()).first()
        
        if not artifact:
            return None
            
        payload = artifact.artifact_json if artifact.artifact_json else artifact.artifact_content
        if isinstance(payload, str):
            try:
                import json
                payload = json.loads(payload)
            except Exception:
                pass
        
        dependency_snapshot = None
        if isinstance(payload, dict) and "_dependency_snapshot" in payload:
            dependency_snapshot = payload.pop("_dependency_snapshot")
            
        return {
            "payload": payload,
            "version": artifact.artifact_version,
            "hash": artifact.artifact_hash,
            "producer_version": artifact.producer_version or settings.VERSION,
            "status": artifact.artifact_status.name if artifact.artifact_status else "UNKNOWN",
            "updated_at": artifact.created_at.isoformat() if artifact.created_at else None,
            "dependency_snapshot": dependency_snapshot
        }

    @staticmethod
    def record_bypass(db: Session, mission_id: int, agent_name: str, reason: str = None):
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if mission:
            mission.bypassed_agents_count = (mission.bypassed_agents_count or 0) + 1
            db.commit()
            MissionService.log_event(
                db,
                mission_id,
                EventType.AGENT_COMPLETED,
                EventSeverity.INFO,
                agent_name=agent_name,
                message=f"{agent_name} bypassed via artifact reuse{': ' + reason if reason else ''}."
            )
        return mission

    @staticmethod
    def complete_mission(db: Session, mission_id: int):
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if mission:
            failure_total = mission.failed_agents_count if mission.failed_agents_count is not None else mission.failed_agents
            mission.status = MissionStatus.COMPLETED if (failure_total or 0) == 0 else MissionStatus.FAILED
            mission.completed_at = datetime.datetime.now(datetime.timezone.utc)
            
            MissionService.detect_regression(db, mission_id)
            
            if mission.current_phase:
                status_dict = mission.phase_status.copy() if mission.phase_status else {}
                status_dict[mission.current_phase] = "COMPLETED"
                mission.phase_status = status_dict
                MissionService.log_event(
                    db, mission_id, EventType.MISSION_PHASE_COMPLETED, EventSeverity.INFO, 
                    message=f"{mission.current_phase} completed.", phase_name=mission.current_phase
                )
                
            db.commit()
            
            event_type = EventType.MISSION_COMPLETED if mission.status == MissionStatus.COMPLETED else EventType.MISSION_FAILED
            severity = EventSeverity.INFO if mission.status == MissionStatus.COMPLETED else EventSeverity.ERROR
            
            MissionService.log_event(db, mission_id, event_type, severity, message=f"Mission finished. Completed: {mission.completed_agents}, Failed: {mission.failed_agents_count or mission.failed_agents}.")
            
            # Stop the codebase watcher if it is running
            try:
                from backend.services.codebase_watcher import stop_watcher
                stop_watcher(str(mission_id))
            except Exception as e:
                logger.error(f"Failed to stop watcher on mission complete: {e}")


    @staticmethod
    def cancel_mission(db: Session, mission_id: int):
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if mission:
            mission.status = MissionStatus.CANCELLED
            mission.completed_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
            
            MissionService.log_event(db, mission_id, EventType.USER_CANCELLED, EventSeverity.WARNING, message="Mission execution was cancelled by the user.")
            
            # Stop the codebase watcher if it is running
            try:
                from backend.services.codebase_watcher import stop_watcher
                stop_watcher(str(mission_id))
            except Exception as e:
                logger.error(f"Failed to stop watcher on mission cancel: {e}")

    @staticmethod
    def detect_regression(db: Session, mission_id: int):
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission or not mission.requirement_hash:
            return
            
        # Find only approved baselines
        baseline = db.query(BaselineRun).filter(
            BaselineRun.requirement_hash == mission.requirement_hash,
            BaselineRun.approved_by.isnot(None) # Use only explicitly approved runs
        ).order_by(BaselineRun.created_at.desc()).first()
        
        if not baseline:
            # First run or no approved baselines exist
            return
            
        # Simplistic approach for now until semantic metrics mature
        regression_detected = False
        drift_score = 0.0
        
        if (mission.failed_agents_count or mission.failed_agents or 0) > 0:
            regression_detected = True
            regression_type = "Regression Detected"
            drift_score = 100.0 # Binary for now
        else:
            regression_type = "No Regression"
            
        if regression_detected:
            regression = AIRegression(
                mission_id=mission_id,
                agent_name="Orchestrator",
                drift_score=drift_score,
                regression_type=regression_type,
                regression_details={"error": "Regression Detected: Semantic failure state shifted."}
            )
            db.add(regression)
            db.commit()
            MissionService.log_event(db, mission_id, EventType.AGENT_FAILED, EventSeverity.WARNING, message="Regression Detected")

    @staticmethod
    def save_tool_executions(db: Session, mission_id: int, agent_name: str, results: list, execution_context: dict = None):
        from backend.core.mission_models import ToolExecution, ToolExecutionArtifact, Mission
        import hashlib
        
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        mission_execution_mode = mission.execution_mode if mission else "unknown"
        
        for res in results:
            tool_name = res.get("tool_name", "unknown")
            status = res.get("status")
            if not status:
                status = "success" if res.get("success") else "failed"
            duration_ms = res.get("duration_ms", 0)
            
            started_at_str = res.get("started_at")
            completed_at_str = res.get("completed_at")
            started_at = datetime.datetime.fromisoformat(started_at_str) if started_at_str else None
            completed_at = datetime.datetime.fromisoformat(completed_at_str) if completed_at_str else None
            
            summary = res.get("summary", {})
            error_message = res.get("error")
            artifacts_data = res.get("artifacts", [])
            
            hash_payload = json.dumps({"status": status, "summary": summary, "error": error_message}, sort_keys=True)
            result_hash = hashlib.sha256(hash_payload.encode()).hexdigest()
            
            output_path = None
            if artifacts_data and isinstance(artifacts_data[0], dict):
                output_path = artifacts_data[0].get("path")
                
            tool_version = "1.0"
            
            execution = ToolExecution(
                mission_id=mission_id,
                agent_name=agent_name,
                tool_name=tool_name,
                tool_version=tool_version,
                status=status,
                duration_ms=duration_ms,
                started_at=started_at,
                completed_at=completed_at,
                summary=summary,
                result_hash=result_hash,
                error_message=error_message,
                execution_context=execution_context,
                output_path=output_path,
                execution_mode_snapshot=mission_execution_mode
            )
            db.add(execution)
            db.flush()
            
            for art in artifacts_data:
                if isinstance(art, dict):
                    artifact = ToolExecutionArtifact(
                        tool_execution_id=execution.id,
                        artifact_type=art.get("artifact_type", "unknown"),
                        artifact_name=art.get("artifact_name", "unknown"),
                        path=art.get("path", ""),
                        size=art.get("size", 0)
                    )
                    db.add(artifact)
                    
        # Update AgentExecutionMetrics
        from backend.core.mission_models import AgentExecutionMetrics
        metrics = db.query(AgentExecutionMetrics).filter(AgentExecutionMetrics.agent_name == agent_name).first()
        if not metrics:
            metrics = AgentExecutionMetrics(
                agent_name=agent_name,
                missions_run=0,
                tools_executed=0,
                success_rate=0.0,
                avg_duration_ms=0
            )
            db.add(metrics)
            
        metrics.missions_run += 1
        metrics.tools_executed += len(results)
        
        # Calculate running averages
        total_duration = sum([r.get("duration_ms", 0) for r in results])
        success_count = sum([1 for r in results if r.get("success")])
        
        # Rough running average for simplicity
        if len(results) > 0:
            current_batch_avg_duration = total_duration / len(results)
            current_batch_success_rate = success_count / len(results)
            
            # Blend with historical (simple 10% moving average)
            metrics.avg_duration_ms = int((metrics.avg_duration_ms * 0.9) + (current_batch_avg_duration * 0.1))
            metrics.success_rate = (metrics.success_rate * 0.9) + (current_batch_success_rate * 0.1)

        db.commit()
