import datetime
import enum
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey, BigInteger, Enum, Float
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import relationship
from backend.core.database import Base
class MissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PLAN_GENERATION_RUNNING = "PLAN_GENERATION_RUNNING"
    PLAN_PENDING = "PLAN_PENDING"
    PLAN_APPROVED = "PLAN_APPROVED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class AgentStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class EventSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"

class EventType(str, enum.Enum):
    MISSION_CREATED = "MISSION_CREATED"
    MISSION_STARTED = "MISSION_STARTED"
    MISSION_COMPLETED = "MISSION_COMPLETED"
    MISSION_FAILED = "MISSION_FAILED"
    MISSION_PHASE_STARTED = "MISSION_PHASE_STARTED"
    MISSION_PHASE_COMPLETED = "MISSION_PHASE_COMPLETED"
    USER_CANCELLED = "USER_CANCELLED"
    AGENT_STARTED = "AGENT_STARTED"
    AGENT_COMPLETED = "AGENT_COMPLETED"
    AGENT_FAILED = "AGENT_FAILED"
    ARTIFACT_SAVED = "ARTIFACT_SAVED"

class ArtifactStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    VALIDATED = "VALIDATED"
    APPROVED = "APPROVED"
    SUPERSEDED = "SUPERSEDED"
    FAILED = "FAILED"

class Mission(Base):
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    correlation_id = Column(String(100), unique=True, index=True, nullable=False)
    program_id = Column(String(100), index=True, nullable=True)
    mission_name = Column(String(255), nullable=False)
    mission_type = Column(String(100), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(MissionStatus), default=MissionStatus.PENDING, nullable=False)
    execution_depth = Column(String(50))
    current_phase = Column(String(50))
    requirement_hash = Column(String(255), nullable=True)
    phase_status = Column(JSON, default=dict)
    input_payload = Column(JSON)
    mission_manifest = Column(JSON, nullable=True)
    
    mission_status = Column(String(50), default="CREATED")
    phase_outputs = Column(JSON, default=dict)
    
    execution_mode = Column(String(50), default="analysis")
    created_from_context = Column(Boolean, default=False)
    risk_level_snapshot = Column(String(20), default="low")
    execution_context = Column(JSON, nullable=True)
    execution_readiness = Column(JSON, nullable=True)
    execution_targets = Column(JSON, nullable=True)
    
    total_agents = Column(Integer, default=0)
    configured_agents_count = Column(Integer, default=0)
    eligible_agents_count = Column(Integer, default=0)
    executed_agents_count = Column(Integer, default=0)
    bypassed_agents_count = Column(Integer, default=0)
    failed_agents_count = Column(Integer, default=0)
    completed_agents = Column(Integer, default=0)
    failed_agents = Column(Integer, default=0)
    artifact_coverage = Column(JSON, nullable=True)

    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    artifacts = relationship("MissionArtifact", back_populates="mission", cascade="all, delete-orphan")
    executions = relationship("MissionExecution", back_populates="mission", cascade="all, delete-orphan")
    events = relationship("MissionEvent", back_populates="mission", cascade="all, delete-orphan")


class MissionArtifact(Base):
    __tablename__ = "mission_artifacts"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(255), nullable=False)
    artifact_type = Column(String(100), nullable=False)
    artifact_version = Column(Integer, default=1)
    artifact_status = Column(Enum(ArtifactStatus), default=ArtifactStatus.DRAFT)
    artifact_json = Column(JSON)
    artifact_content = Column(Text().with_variant(mysql.LONGTEXT(), "mysql"), nullable=True)
    artifact_size = Column(BigInteger, default=0)
    artifact_hash = Column(String(128), nullable=True)
    producer_version = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

    mission = relationship("Mission", back_populates="artifacts")

class MissionPhase(Base):
    __tablename__ = "mission_phases"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    phase_id = Column(Integer, nullable=False)
    status = Column(String(50), default="NOT_STARTED") # NOT_STARTED, IN_PROGRESS, COMPLETED
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    output_artifact_count = Column(Integer, default=0)

    mission = relationship("Mission", backref="phases")


class MissionExecution(Base):
    __tablename__ = "mission_executions"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(255), nullable=False)
    status = Column(Enum(AgentStatus), default=AgentStatus.PENDING, nullable=False)
    execution_time_ms = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    mission = relationship("Mission", back_populates="executions")


class MissionEvent(Base):
    __tablename__ = "mission_events"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(255), nullable=True)
    event_type = Column(Enum(EventType), nullable=False)
    phase_name = Column(String(50), nullable=True)
    severity = Column(Enum(EventSeverity), default=EventSeverity.INFO, nullable=False)
    message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    mission = relationship("Mission", back_populates="events")

class BaselineRun(Base):
    __tablename__ = "baseline_runs"
    id = Column(Integer, primary_key=True, index=True)
    requirement_hash = Column(String(255), index=True, nullable=False)
    agent_name = Column(String(255), nullable=False)
    baseline_artifact_id = Column(Integer, nullable=True)
    baseline_metrics = Column(JSON, nullable=True)
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class AIRegression(Base):
    __tablename__ = "ai_regressions"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(255), nullable=False)
    drift_score = Column(Float, default=0.0)
    regression_type = Column(String(100), nullable=True)
    regression_details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    mission = relationship("Mission", backref="regressions")

class ToolExecution(Base):
    __tablename__ = "tool_executions"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(255), nullable=False)
    tool_name = Column(String(255), nullable=False)
    tool_version = Column(String(50), nullable=True)
    status = Column(String(50), nullable=False)
    duration_ms = Column(Integer, default=0)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    summary = Column(JSON, nullable=True)
    result_hash = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    execution_context = Column(JSON, nullable=True)
    output_path = Column(String(1024), nullable=True)
    execution_mode_snapshot = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    mission = relationship("Mission", backref="tool_executions")
    artifacts = relationship("ToolExecutionArtifact", back_populates="tool_execution", cascade="all, delete-orphan")

class ToolExecutionArtifact(Base):
    __tablename__ = "tool_execution_artifacts"
    id = Column(Integer, primary_key=True, index=True)
    tool_execution_id = Column(Integer, ForeignKey("tool_executions.id", ondelete="CASCADE"), nullable=False)
    artifact_type = Column(String(100), nullable=False)
    artifact_name = Column(String(255), nullable=False)
    path = Column(String(1024), nullable=False)
    size = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    tool_execution = relationship("ToolExecution", back_populates="artifacts")

class ToolApproval(Base):
    __tablename__ = "tool_approvals"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    tool_name = Column(String(255), nullable=False)
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    status = Column(String(50), default="PENDING")
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    mission = relationship("Mission", backref="tool_approvals")

class AuditOverride(Base):
    __tablename__ = "audit_overrides"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    module_name = Column(String(255), nullable=False)
    tool_name = Column(String(255), nullable=False)
    reason = Column(Text, nullable=False)
    approved_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    mission = relationship("Mission", backref="audit_overrides")

class RecallAudit(Base):
    __tablename__ = "recall_audits"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="CASCADE"), nullable=True, index=True)
    query = Column(Text, nullable=False)
    candidate_source = Column(String(255), nullable=True, index=True)
    memory_key = Column(String(255), nullable=True, index=True)
    memory_type = Column(String(100), nullable=True, index=True)
    domain = Column(String(100), nullable=True, index=True)
    score = Column(Float, default=0.0)
    confidence_band = Column(String(50), nullable=True)
    decision = Column(String(50), nullable=False)
    reason = Column(Text, nullable=True)
    domain_match = Column(Boolean, default=False)
    recency_score = Column(Float, default=0.0)
    capability_overlap_score = Column(Float, default=0.0)
    injected = Column(Boolean, default=False)
    accepted_context = Column(JSON, nullable=True)
    rejected_context = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    mission = relationship("Mission", backref="recall_audits")

class MemoryCatalogEntry(Base):
    __tablename__ = "memory_catalog_entries"

    id = Column(Integer, primary_key=True, index=True)
    memory_key = Column(String(255), unique=True, nullable=False, index=True)
    source = Column(String(255), nullable=False, index=True)
    memory_type = Column(String(100), nullable=False, index=True)
    domain = Column(String(100), nullable=True, index=True)
    capability_tags = Column(JSON, nullable=True)
    version = Column(Integer, default=1)
    source_created_at = Column(DateTime, nullable=True)
    governed = Column(Boolean, default=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

class AgentExecutionMetrics(Base):
    __tablename__ = 'agent_execution_metrics'

    agent_name = Column(String(100), primary_key=True)
    missions_run = Column(Integer, default=0)
    tools_executed = Column(Integer, default=0)
    success_rate = Column(Float, default=0.0)
    avg_duration_ms = Column(Integer, default=0)
