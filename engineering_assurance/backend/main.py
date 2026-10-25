"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - BACKEND ENTRY POINT
================================================================================
Architecture: FastAPI Multi-Agent Gateway.

This module coordinates the system lifecycle:
1. Environment Synchronization (Cloud/Local redirection)
2. Security Enforcement (CORS / Audit Middlewares)
3. Direct Memory-to-Disk routing (Static artifacts)
4. Database Orchestration
"""

import os
import sys
import logging

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "/api/health" in msg or "/status/" in msg or "/health" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

from backend.core.runtime_patch import apply_production_hardening
apply_production_hardening()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.background import BackgroundScheduler
import datetime
from sqlalchemy import text

# --- CORE SYSTEM COMPONENTS ---
from backend.core.config import settings
from backend.core.database import init_db, SessionLocal
from backend.api.router import router
from backend.core.runtime_state import bootstrap_runtime_session, clear_stale_runtime_state
from backend.api.middleware import CorrelationIdMiddleware, SecurityHeadersMiddleware
from backend.core.rate_limit import limiter

# --- ARCHITECTURE: CROSS-FRAMEWORK COMPATIBILITY BRIDGE ---
# CONTEXT: 
# Many foundational AI libraries (CrewAI, LangChain) are hard-coded to expect 
# OpenAI infrastructure. 
# We NO LONGER force a global redirect to Groq here as it breaks other providers 
# like Gemini. Instead, we rely on InferenceCoordinator to explicitly route 
# calls via litellm prefixes.

# DEFAULT FALLBACK: 
# Setting a default model ensures that system-level tokens (e.g. state management) 
# don't trigger 'Model Not Found' errors if a specific tier isn't provided.
os.environ["OPENAI_MODEL_NAME"] = "llama-3.3-70b-versatile"

# RESILIENCE: Force internal HTTP clients (httpx/requests) to wait for 
# orchestration. Prevents the '12.0s' timeout crash during high concurrency.
os.environ["HTTPX_TIMEOUT"] = "600.0"
os.environ["LITELLM_REQUEST_TIMEOUT"] = "600"

# --- TELEMETRY & OBSERVABILITY ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def cleanup_audit_logs():
    """Background task to delete security audit logs older than 90 days."""
    try:
        with SessionLocal() as db:
            db.execute(text("DELETE FROM security_audit_logs WHERE timestamp < datetime('now', '-90 days')"))
            db.commit()
            logger.info("[MAINTENANCE] Cleaned up security audit logs older than 90 days.")
    except Exception as e:
        logger.error(f"[MAINTENANCE] Failed to cleanup audit logs: {e}")

def validate_registry_contracts():
    """Validates that all output keys declared in the AGENT_REGISTRY exist in AgentState."""
    try:
        from backend.core.agent_registry import AGENT_REGISTRY
        from backend.agents.state import AgentState
        
        # TypedDicts expose their defined keys via __annotations__
        state_keys = set(AgentState.__annotations__.keys())
        
        missing_keys = set()
        for agent_id, config in AGENT_REGISTRY.items():
            for product in config.get("produces", []):
                if isinstance(product, dict) and "state_key" in product:
                    key = product["state_key"]
                    if key not in state_keys:
                        missing_keys.add(key)
        
        if missing_keys:
            logger.error(f"[STARTUP-FAIL] AgentState is missing contract keys: {missing_keys}")
            raise RuntimeError(f"Contract Schema Drift Detected! Missing keys in AgentState: {missing_keys}")
        logger.info("[LIFESPAN] Registry Contract Validation Passed. No schema drift detected.")
    except Exception as e:
        logger.error(f"[LIFESPAN] Registry validation error: {e}")
        raise e

# --- SYSTEM LIFESPAN (OPERATIONAL HOOKS) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PURPOSE: MANAGE AGENTIC INFRASTRUCTURE INITIALIZATION.
    
    ACTION:
    1. BOOTSTRAP: Synchronizes the SQLite schema with current ORM models.
    2. DIRECTORY CHECK: Ensures 'outputs' exists to prevent DOCX generation crashes.
    """
    try:
        # Step 0: Contract Validation
        validate_registry_contracts()
        
        # Step 0.5: NFR Tools Health Check
        import shutil
        for tool in ["semgrep", "flake8", "gitleaks"]:
            if shutil.which(tool) is None:
                logger.warning(f"[STARTUP] {tool} not found on PATH — NFR audits will report incomplete coverage")

        # Step 1: Initialize Database Tables (Idempotent)
        init_db()
        logger.info("[LIFESPAN] Relational Persistence initialized. WAL mode enabled for concurrent agent logs.")

        # Step 1a: Establish a fresh runtime fingerprint before any mission
        # can reuse buffers, queue-like state, or restored context from a prior run.
        runtime_session_id = bootstrap_runtime_session()
        app.state.runtime_session_id = runtime_session_id
        setattr(settings, "RUNTIME_SESSION_ID", runtime_session_id)
        clear_stale_runtime_state(mark_orphans_failed=True)

        # Step 1b: SEED TIER POOLS — ensure all 4 LLMKeyPool tiers exist.
        # This is idempotent: existing pools are never modified.
        # Without this, get_identity() returns None for any tier whose pool row
        # doesn't exist, causing the entire cloud mesh to appear "depleted" even
        # when identities have been added via the UI.
        try:
            from backend.core.database import SessionLocal, LLMKeyPool
            REQUIRED_TIERS = ["strategic", "primary", "economy", "local"]
            with SessionLocal() as db:
                seeded = []
                for tier_name in REQUIRED_TIERS:
                    existing = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier_name).first()
                    if not existing:
                        db.add(LLMKeyPool(tier=tier_name, is_active=1))
                        seeded.append(tier_name)
                if seeded:
                    db.commit()
                    logger.info(f"[LIFESPAN] Seeded missing LLM tier pools: {seeded}")
                else:
                    logger.info("[LIFESPAN] All 4 LLM tier pools present.")
        except Exception as pool_err:
            logger.error(f"[LIFESPAN] Tier pool seeding failed (non-critical): {pool_err}")

        # Step 1c: VAULT SEEDER — Deprecated
        # Auto-population of LLM identities to the DB is disabled. The system now uses 
        # the deterministic PROVIDER_CHAIN fallback sequence directly from .env variables.
        
        # Step 2: Ensure artifact persistence directory exists.
        if not os.path.exists(settings.OUTPUTS_DIR):
            os.makedirs(settings.OUTPUTS_DIR)
            logger.info(f"[LIFESPAN] Artifact vault created at: {settings.OUTPUTS_DIR}")
        
        # Step 3: Knowledge Bootstrap (Auto-Vectorize Enterprise Template)
        from backend.core.vector_db import vector_store
        template_name = "Test_Plan_Template_VVNT.docx"
        template_path = os.path.join(settings.BASE_DIR, "templates", template_name)
        
        # Check if indexed (avoid duplicate expensive embeddings)
        existing_ids = vector_store.collection.get().get("ids", [])
        if template_name not in existing_ids and os.path.exists(template_path):
            logger.info(f"[LIFESPAN] Vectorizing enterprise template: {template_name}")
            vector_store.ingest_document(template_path, metadata={"type": "enterprise_template", "source": template_name})
        else:
            logger.info(f"[LIFESPAN] Knowledge Base ready. '{template_name}' is already in the semantic index.")

        try:
            from backend.rag.bootstrap import bootstrap_governed_memory
            bootstrap_summary = bootstrap_governed_memory()
            logger.info(
                "[LIFESPAN] Governed memory bootstrap complete. policy_ok=%s governed=%s non_governed=%s",
                bootstrap_summary.get("policy_ok"),
                bootstrap_summary.get("catalog", {}).get("governed", 0),
                bootstrap_summary.get("catalog", {}).get("non_governed", 0),
            )
        except Exception as rag_bootstrap_err:
            logger.error(f"[LIFESPAN] Governed memory bootstrap failed (non-critical): {rag_bootstrap_err}")
            
    except Exception as e:
        logger.error(f"[LIFESPAN] BOOT FAILURE: {e}")
    
    scheduler = BackgroundScheduler()
    scheduler.add_job(cleanup_audit_logs, 'interval', days=1)
    scheduler.start()
    
    yield
    
    scheduler.shutdown()
    try:
        from backend.services.codebase_watcher import stop_all_watchers
        stop_all_watchers()
        logger.info("[LIFESPAN] Stopped all codebase watchers.")
    except Exception as e:
        logger.error(f"[LIFESPAN] Error stopping watchers: {e}")
        
    logger.info("[LIFESPAN] Gracefully de-registering agent services.")

# --- APPLICATION ENGINE CONFIGURATION ---
app = FastAPI(
    title=settings.APP_NAME, 
    version=settings.VERSION, 
    debug=settings.DEBUG,
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CorrelationIdMiddleware)

app.add_middleware(SecurityHeadersMiddleware)

# --- SECURITY: CORS ORCHESTRATION ---
# PURPOSE: 
# Enables the Vite/React frontend (dev or build) to securely bridge its REST 
# requests to this local API handler.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_allowed_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MIDDLEWARE: THE AUDIT TRAIL ---
# PURPOSE:
# Records every HTTP interaction for high-fidelity debugging of the agent logic.
@app.middleware("http")
async def audit_middleware(request, call_next):
    path = request.url.path
    # Silence continuous background health check and status polling logs
    if not path.startswith("/api/health") and "/status/" not in path and not path.startswith("/health"):
        logger.info(f"AUDIT -> [{request.method}] {path}")
    return await call_next(request)

# --- ROUTE REGISTRY ---
# Logic: Mounts standardized modules (Health, Planning, History, Vault).
app.include_router(router)

# --- ARTIFACT DISCOVERY ---
# Action: Serves the /outputs/ directory as a direct download attachment.
# Logic: Using FileResponse instead of StaticFiles guarantees the browser gets the 
# Content-Disposition limit, ensuring it downloads the .docx instead of rendering it.
from fastapi.responses import FileResponse
from fastapi import HTTPException

@app.get("/outputs/{filename}")
async def download_output_file(filename: str):
    file_path = os.path.join(settings.OUTPUTS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(
        path=file_path, 
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# --- SERVER EXECUTOR ---
if __name__ == "__main__":
    import uvicorn
    """
    CRITICAL OPERATIONAL NOTE: reload=False
    
    WHY? The Agentic Workflow generates physical files (.docx) in the /outputs dir.
    If 'reload' is True, Uvicorn detects the NEW file creation as a source code 
    change and restarts the server mid-inference. This creates a recursive 
    death-loop for the agent. 
    
    ALWAYS DISABLE RELOAD FOR PRODUCTION-READY AGENT NODES.
    """
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
