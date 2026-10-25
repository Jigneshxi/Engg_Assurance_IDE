"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - DATABASE LAYER (SQLAlchemy)
================================================================================
Architecture: Relational Persistence — MySQL (primary) with SQLite fallback.

ENGINES:
- MySQL  (default): Set DB_ENGINE=mysql + MYSQL_URL in .env (already configured).
- SQLite (fallback): Set DB_ENGINE=sqlite in .env for zero-dependency local dev.

SWITCHING:
  .env:  DB_ENGINE=sqlite          ← local dev fallback
         DB_ENGINE=mysql           ← production (default)
"""

import os
import datetime
import logging
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, JSON, Float, ForeignKey, Index, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from backend.core.config import settings

logger = logging.getLogger(__name__)

# --- DATABASE URL RESOLUTION ---
# Priority: MySQL (if DB_ENGINE=mysql and MYSQL_URL is set) → SQLite fallback
_SQLITE_PATH = os.path.join(settings.BASE_DIR, "test_planning_stable.db")
_SQLITE_URL  = f"sqlite:///{_SQLITE_PATH}"

if settings.DB_ENGINE.lower() == "mysql" and settings.MYSQL_URL:
    DATABASE_URL = settings.MYSQL_URL
    logger.info("[DATABASE] Engine: MySQL (production mode)")
else:
    DATABASE_URL = _SQLITE_URL
    logger.info("[DATABASE] Engine: SQLite (local fallback)")

print("DATABASE_URL =", DATABASE_URL)

# --- ENGINE CREATION ---
if "sqlite" in DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30}
    )
    # WAL mode: allows concurrent reads during agent writes
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    # MySQL: connection pool tuned for FastAPI async workload
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,   # Recycle connections every hour (avoids MySQL 8h timeout)
        pool_pre_ping=True,  # Verify connection health before use
        echo=False
    )

# Session Factory: Shared across the entire backend application context.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base: All ORM models inherit from this.
Base = declarative_base()

# --- ORM MODEL DEFINITIONS ---

class ConsentRecord(Base):
    """
    PURPOSE: GIT INTEGRATION - USER CONSENT
    Logic: Tracks the exact scopes and timestamp of user consent for Git access.
    """
    __tablename__ = "consent_records"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    version = Column(Integer, default=1)
    scopes = Column(JSON, nullable=False)  # e.g., ["repo", "read:org", "workflow"]
    scope_hash = Column(String(64), nullable=False) # SHA-256 of sorted scopes to detect changes
    granted_at = Column(DateTime, default=datetime.datetime.utcnow)

class GitIntegration(Base):
    """
    PURPOSE: GIT INTEGRATION - REPO CONNECTION
    Logic: Stores repo details and (encrypted) PAT/OAuth tokens.
    """
    __tablename__ = "git_integrations"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(String(255), unique=True, index=True, nullable=False)
    repo_url = Column(String(512), nullable=False)
    platform = Column(String(50), nullable=False) # github, gitlab, bitbucket
    status = Column(String(50), default="connected") # connected, disconnected, expired
    encrypted_token = Column(String(1024), nullable=False)
    installation_id = Column(String(100), nullable=True) # For future GitHub App support
    consent_version_id = Column(Integer, ForeignKey("consent_records.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class RepoProfile(Base):
    """
    PURPOSE: GIT INTEGRATION - REPO CONVENTIONS
    Logic: Cached output of the Repo Profiler (languages, frameworks, lint config).
    """
    __tablename__ = "repo_profiles"
    id = Column(Integer, primary_key=True, index=True)
    git_integration_id = Column(Integer, ForeignKey("git_integrations.id"), unique=True, nullable=False)
    profile_data = Column(JSON, nullable=False)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class ProjectHistory(Base):
    """
    PURPOSE: LONG-TERM ARCHIVE MESH
    Logic: Persists finalized test plans for traceability and human reference.
    Usage: Feeds the 'Gen History' tab in the UI and provides 'Golden Samples' for RAG.
    """
    __tablename__ = "project_history"
    id = Column(Integer, primary_key=True, index=True)
    summary = Column(String(255), nullable=False)
    raw_requirement_data = Column(JSON, nullable=True) # Normalized source data
    generated_plan_payload = Column(JSON, nullable=True) # CrewAI Structured Inference
    markdown_result = Column(Text, nullable=True) # Browser-ready preview
    download_url = Column(String(512), nullable=True) # Local path to .docx artifact
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    platform = Column(String(50), nullable=True) # Jira, ADO, etc.
    ticket_id = Column(String(50), nullable=True)

class GenerationTask(Base):
    """
    PURPOSE: EPHEMERAL STATE MACHINE
    Logic: Tracks 'In-Flight' agent workflows.
    Usage: The UI polls this record to visualize the 'Agent Thinking' logs.
    State Transition: PENDING -> PROCESSING -> COMPLETED | FAILED.
    """
    __tablename__ = "generation_tasks"
    __table_args__ = (
        Index("ix_generation_tasks_created_at", "created_at"),
        Index("ix_generation_tasks_status_created_at", "status", "created_at"),
    )
    task_id = Column(String(255), primary_key=True, index=True)
    status = Column(String(50), default="PENDING")
    # 'logs' uses 'flag_modified' in state.py to ensure real-time WAL flushes.
    logs = Column(JSON, default=list) 
    active_agents = Column(JSON, default=dict) # Persisted Mesh Configuration
    mission_intent = Column(String(50), nullable=True) # PHASE_1, PHASE_2, or None
    min_log_level = Column(Integer, default=3) # V4.0 Intelligence Threshold
    result = Column(JSON, nullable=True)
    # LIVE TELEMETRY: Incremental node outputs written during execution.
    # Polled by the frontend to populate Agent Workspace panels in real-time.
    partial_state = Column(JSON, nullable=True, default=dict)
    error = Column(Text, nullable=True)
    mission_id = Column(Integer, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, index=True)

class ConnectedPlatform(Base):
    """
    PURPOSE: EXTERNAL ALM VAULT
    Logic: Stores credentials for ALM integrations (PAT tokens, API emails).
    Security: Tokens here are explicitly encrypted via SecretVault (Fernet).
    """
    __tablename__ = "connected_platforms"
    id = Column(Integer, primary_key=True, index=True)
    platform_name = Column(String(100), unique=True, index=True)
    url = Column(String(512), nullable=False)
    email = Column(String(255), nullable=True)
    encrypted_token = Column(String(1024), nullable=False)
    consent_record = Column(JSON, nullable=True) # Explicit scope statement & timestamp
    last_validated = Column(DateTime, default=datetime.datetime.utcnow)

class LLMConfiguration(Base):
    """
    [LEGACY] DEPRECATED IN V3.8
    Architecture: Plain-text identity storage.
    Note: Still used by some Phase-1 utility functions and Migration script.
    """
    __tablename__ = "llm_configurations"
    id = Column(Integer, primary_key=True, index=True)
    tier = Column(String(50), nullable=False) # 'primary', 'economy', 'local'
    provider = Column(String(50), nullable=False) # 'Groq' or 'Ollama'
    model_name = Column(String(100), nullable=False)
    api_key = Column(String(512), nullable=True) # RAW KEY (Migrate to Vault!)
    base_url = Column(String(512), nullable=True)
    is_active = Column(Integer, default=1)

class LLMKeyPool(Base):
    """
    PURPOSE: RESILIENT MESH - TIER DEFINITIONS
    Logic: Groups AI identities into logical failover pools.
    """
    __tablename__ = "llm_key_pools"
    id = Column(Integer, primary_key=True, index=True)
    tier = Column(String(20), nullable=False, unique=True) # strategic, primary, economy, local
    rotation_policy = Column(JSON, default={"mode": "auto", "token_threshold": 500000})
    is_active = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class LLMKeyIdentity(Base):
    """
    PURPOSE: RESILIENT MESH - SECURE IDENTITIES
    Logic: Stores the encrypted API keys and passive usage counters.
    Rotation: 'usage_tokens' triggers the MaintenanceEngine rotation swap.
    """
    __tablename__ = "llm_key_identities"
    id = Column(Integer, primary_key=True, index=True)
    pool_id = Column(Integer, ForeignKey("llm_key_pools.id"))
    provider = Column(String(50), nullable=False) # Groq, OpenAI, Ollama
    model_name = Column(String(100), nullable=False)
    encrypted_key = Column(Text, nullable=False) # Symmetric AES-128
    base_url = Column(String(512), nullable=True)
    
    usage_tokens = Column(Integer, default=0)
    usage_requests = Column(Integer, default=0)
    
    status = Column(String(20), default="active") # active, standby, rotated, revoked
    cooldown_until = Column(DateTime, nullable=True) # Circuit Breaking
    last_used = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class InferenceAudit(Base):
    """
    PURPOSE: METRIC & HEALTH MESH
    Logic: Records a snapshot of every LLM interaction for cost/failure analysis.
    """
    __tablename__ = "inference_audits"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(255), index=True)
    tier = Column(String(20))
    provider = Column(String(50))
    model = Column(String(100))
    tokens_used = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    status = Column(String(20)) # success, fail
    error_msg = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class TaskEconomics(Base):
    """
    PURPOSE: ENGINEERING ECONOMICS TRACKING (Phase 1.1 - CFO View)
    Logic: Aggregates financial metrics per generation task for ROI analysis.
    Usage: Powers the Engineering Economics Dashboard in Module 4.
    """
    __tablename__ = "task_economics"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(255), unique=True, index=True, nullable=False)
    
    # Cost Metrics
    total_token_cost_usd = Column(Float, default=0.0)
    total_compute_cost_usd = Column(Float, default=0.0)
    total_cost_usd = Column(Float, default=0.0)
    
    # Test Metrics
    test_count = Column(Integer, default=0)
    automation_count = Column(Integer, default=0)
    manual_test_hours_saved = Column(Float, default=0.0)
    
    # ROI Calculations
    cost_per_test = Column(Float, default=0.0)
    automation_roi_percentage = Column(Float, default=0.0)
    payback_period_days = Column(Float, default=0.0)
    estimated_savings_usd = Column(Float, default=0.0)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class SystemConfig(Base):
    """
    PURPOSE: PLATFORM GOVERNANCE
    Logic: Stores global settings (Logging Level, RAG depth, UI preferences).
    Usage: Allows the UI to modify backend behavior in real-time.
    """
    __tablename__ = "system_configs"
    key = Column(String(100), primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class ExistingCodeAudit(Base):
    """
    PURPOSE: BROWNFIELD AUDIT — AUDIT SESSION HEADER
    Logic: Created (status=QUEUED) synchronously in /api/git/connect before the
    background scan task fires, so the first UI poll never sees a 404 race window.
    """
    __tablename__ = "existing_code_audits"
    id                  = Column(Integer, primary_key=True)
    mission_id          = Column(String(255), index=True, nullable=False)
    git_integration_id  = Column(Integer, ForeignKey("git_integrations.id"), nullable=False)
    status              = Column(String(50), default="QUEUED")  # QUEUED | RUNNING | COMPLETE | FAILED
    total_files_scanned = Column(Integer, default=0)
    total_findings      = Column(Integer, default=0)
    tools_run           = Column(JSON, default=list)
    tools_unavailable   = Column(JSON, default=list)
    tools_not_configured = Column(JSON, default=list)  # tool works, project not set up for it
    tools_not_applicable = Column(JSON, default=list)  # tool doesn't apply to this repo's stack
    created_at          = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at        = Column(DateTime, nullable=True)

class CodeFinding(Base):
    """
    PURPOSE: BROWNFIELD AUDIT — PER-LINE FINDINGS
    Logic: Populated by parse_findings() on each NFR runner after a full-repo scan.
    status lifecycle: open → fix_suggested → fix_applied | fix_verified | fix_failed | wont_fix
    """
    __tablename__ = "code_findings"
    id              = Column(Integer, primary_key=True)
    audit_id        = Column(Integer, ForeignKey("existing_code_audits.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path       = Column(String(1024), nullable=False, index=True)
    line            = Column(Integer, nullable=False)
    col             = Column(Integer, nullable=True)
    severity        = Column(String(20))   # critical | high | medium | low
    category        = Column(String(50))   # security | lint | secret | performance
    tool            = Column(String(50))   # semgrep | flake8 | gitleaks
    rule_id         = Column(String(255))
    message         = Column(Text)
    code_snippet    = Column(Text, nullable=True)
    status          = Column(String(30), default="open")
    suggested_fix   = Column(Text, nullable=True)
    fix_commit_sha  = Column(String(64), nullable=True)
    dismissed_reason = Column(Text, nullable=True)

# --- SYSTEM UTILITIES ---

def init_db():
    """
    ACTION: Bootstrap the SQLite database.
    LOGIC: Safe idempotent call. Reconciles existing tables with ORM definitions.
    """
    logger.info("[DATABASE] Synchronizing SQLite Schema with ORM Registry.")
    Base.metadata.create_all(bind=engine)
    _reconcile_generation_tasks_schema()
    _reconcile_generation_tasks_indexes()
    _reconcile_missions_schema()
    _reconcile_mission_artifacts_schema()
    _reconcile_task_economics_schema()
    _reconcile_git_integration_schema()
    _reconcile_existing_code_audit_schema()

def _reconcile_git_integration_schema():
    """Ensure Git integration tables are created if missing."""
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        
        # We rely on Base.metadata.create_all() for new tables, but this is a 
        # safeguard for explicit logging or future column additions.
        if "git_integrations" not in table_names:
            logger.info("[DATABASE] Git Integration tables created via create_all()")
    except Exception as e:
        logger.error(f"[DATABASE] Git integration schema reconciliation failed (non-critical): {e}")

def _reconcile_existing_code_audit_schema():
    """Ensure brownfield audit tables exist; safe no-op if already present. Adds new columns if missing."""
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "existing_code_audits" not in table_names or "code_findings" not in table_names:
            logger.info("[DATABASE] Brownfield audit tables created via create_all()")
        else:
            existing_cols = {c["name"] for c in inspector.get_columns("existing_code_audits")}
            dialect = engine.dialect.name
            with engine.begin() as conn:
                if "tools_run" not in existing_cols:
                    col_type = "JSON NULL" if dialect == "mysql" else "JSON"
                    conn.execute(text(f"ALTER TABLE existing_code_audits ADD COLUMN tools_run {col_type}"))
                    logger.warning("[DATABASE] Applied schema patch: added existing_code_audits.tools_run")
                if "tools_unavailable" not in existing_cols:
                    col_type = "JSON NULL" if dialect == "mysql" else "JSON"
                    conn.execute(text(f"ALTER TABLE existing_code_audits ADD COLUMN tools_unavailable {col_type}"))
                    logger.warning("[DATABASE] Applied schema patch: added existing_code_audits.tools_unavailable")
                if "tools_not_configured" not in existing_cols:
                    col_type = "JSON NULL" if dialect == "mysql" else "JSON"
                    conn.execute(text(f"ALTER TABLE existing_code_audits ADD COLUMN tools_not_configured {col_type}"))
                    logger.warning("[DATABASE] Applied schema patch: added existing_code_audits.tools_not_configured")
                if "tools_not_applicable" not in existing_cols:
                    col_type = "JSON NULL" if dialect == "mysql" else "JSON"
                    conn.execute(text(f"ALTER TABLE existing_code_audits ADD COLUMN tools_not_applicable {col_type}"))
                    logger.warning("[DATABASE] Applied schema patch: added existing_code_audits.tools_not_applicable")
    except Exception as e:
        logger.error(f"[DATABASE] Existing code audit schema reconciliation failed (non-critical): {e}")


def _reconcile_generation_tasks_schema():
    """
    Heal legacy `generation_tasks` schemas created before newer columns existed.
    `create_all()` does not add columns to existing tables, so we apply targeted
    ALTER TABLE updates for known drift fields.
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "generation_tasks" not in table_names:
            return

        existing_cols = {c["name"] for c in inspector.get_columns("generation_tasks")}
        dialect = engine.dialect.name

        if "partial_state" not in existing_cols:
            with engine.begin() as conn:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE generation_tasks ADD COLUMN partial_state JSON"))
                elif dialect == "mysql":
                    conn.execute(text("ALTER TABLE generation_tasks ADD COLUMN partial_state JSON NULL"))
                else:
                    conn.execute(text("ALTER TABLE generation_tasks ADD COLUMN partial_state TEXT"))
            logger.warning("[DATABASE] Applied schema patch: added generation_tasks.partial_state")

        if "created_by" not in existing_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE generation_tasks ADD COLUMN created_by INTEGER"))
            logger.warning("[DATABASE] Applied schema patch: added generation_tasks.created_by")

    except Exception as e:
        logger.error(f"[DATABASE] Schema reconciliation failed (non-critical): {e}")

def _reconcile_generation_tasks_indexes():
    """
    Ensure the `generation_tasks` table has supporting indexes for latest-task
    and status-filtered polling queries. These indexes prevent MySQL from
    performing expensive filesorts over large JSON-heavy rows.
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "generation_tasks" not in table_names:
            return

        existing_indexes = {idx["name"] for idx in inspector.get_indexes("generation_tasks")}
        desired_indexes = {
            "ix_generation_tasks_created_at": "created_at",
            "ix_generation_tasks_status_created_at": "status, created_at",
        }

        with engine.begin() as conn:
            for index_name, columns in desired_indexes.items():
                if index_name in existing_indexes:
                    continue
                conn.execute(text(f"CREATE INDEX {index_name} ON generation_tasks ({columns})"))
                logger.warning(f"[DATABASE] Applied schema patch: created index {index_name}")
    except Exception as e:
        logger.error(f"[DATABASE] Generation task index reconciliation failed (non-critical): {e}")

def _reconcile_missions_schema():
    """
    Heal legacy `missions` schemas created before the stabilization sprint
    introduced manifest and metric columns.
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "missions" not in table_names:
            return

        existing_cols = {c["name"] for c in inspector.get_columns("missions")}
        column_defs = {
            "mission_manifest": "JSON NULL" if engine.dialect.name == "mysql" else "JSON",
            "configured_agents_count": "INTEGER",
            "eligible_agents_count": "INTEGER",
            "executed_agents_count": "INTEGER",
            "bypassed_agents_count": "INTEGER",
            "failed_agents_count": "INTEGER",
            "artifact_coverage": "JSON NULL" if engine.dialect.name == "mysql" else "JSON",
            "mission_status": "VARCHAR(50) DEFAULT 'CREATED'",
            "phase_outputs": "JSON NULL" if engine.dialect.name == "mysql" else "JSON",
        }

        with engine.begin() as conn:
            for col_name, ddl_type in column_defs.items():
                if col_name in existing_cols:
                    continue
                if engine.dialect.name == "sqlite":
                    conn.execute(text(f"ALTER TABLE missions ADD COLUMN {col_name} {ddl_type}"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE missions ADD COLUMN {col_name} {ddl_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE missions ADD COLUMN {col_name} {ddl_type}"))
                logger.warning(f"[DATABASE] Applied schema patch: added missions.{col_name}")
    except Exception as e:
        logger.error(f"[DATABASE] Missions schema reconciliation failed (non-critical): {e}")

def _reconcile_mission_artifacts_schema():
    """
    Heal legacy `mission_artifacts` schemas to support producer versioning and
    large artifact payloads.
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "mission_artifacts" not in table_names:
            return

        existing_cols = {c["name"] for c in inspector.get_columns("mission_artifacts")}
        artifact_column = next(
            (c for c in inspector.get_columns("mission_artifacts") if c["name"] == "artifact_content"),
            None,
        )
        with engine.begin() as conn:
            if artifact_column and engine.dialect.name == "mysql":
                column_type = artifact_column.get("type")
                if column_type is not None and column_type.__class__.__name__.lower() != "longtext":
                    conn.execute(text("ALTER TABLE mission_artifacts MODIFY COLUMN artifact_content LONGTEXT NULL"))
                    logger.warning("[DATABASE] Applied schema patch: widened mission_artifacts.artifact_content to LONGTEXT")

            if "producer_version" in existing_cols:
                return

            if engine.dialect.name == "sqlite":
                conn.execute(text("ALTER TABLE mission_artifacts ADD COLUMN producer_version VARCHAR(50)"))
            elif engine.dialect.name == "mysql":
                conn.execute(text("ALTER TABLE mission_artifacts ADD COLUMN producer_version VARCHAR(50) NULL"))
            else:
                conn.execute(text("ALTER TABLE mission_artifacts ADD COLUMN producer_version VARCHAR(50)"))
        logger.warning("[DATABASE] Applied schema patch: added mission_artifacts.producer_version")
    except Exception as e:
        logger.error(f"[DATABASE] Mission artifacts schema reconciliation failed (non-critical): {e}")

def _reconcile_task_economics_schema():
    """
    Ensure task_economics table exists for Phase 1.1 Engineering Economics.
    This is a no-op if the table already exists (handled by create_all).
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "task_economics" not in table_names:
            logger.info("[DATABASE] Creating task_economics table for CFO View...")
            Base.metadata.tables["task_economics"].create(bind=engine)
            logger.info("[DATABASE] task_economics table created successfully.")
    except Exception as e:
        logger.error(f"[DATABASE] task_economics reconciliation failed (non-critical): {e}")

def get_db():
    """
    PURPOSE: DEPENDENCY INJECTION (FastAPI)
    Logic: Instantiates a generator-managed session. 
    Guarantees: 'finally' block ensures database handles are released post-HTTP response.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Import auth models to register with Base
from backend.core.auth_models import User
# Import mission models to register with Base
from backend.core.mission_models import Mission, MissionArtifact, MissionExecution, MissionEvent, RecallAudit, MemoryCatalogEntry
