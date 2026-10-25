"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - HEALTH & AUDIT
================================================================================
Architecture: Deep Infrastructure Monitoring.

This module provides high-fidelity heartbeats for the agent's ecosystem. 
It performs active health checks on persistence and security layers.
"""

import logging
import time
import os
import datetime
from fastapi import APIRouter
from backend.core.database import SessionLocal
from backend.core.vault import SecretVault
from backend.core.config import settings

router = APIRouter(tags=["System Reliability"])
logger = logging.getLogger(__name__)

@router.get("/health")
def root_health_ping():
    """Action: Root-level health check for reachability."""
    return {"status": "online", "message": "VVNT Agent Mesh is active."}

@router.get("/api/status")
def quick_status():
    """LIGHTWEIGHT PULSE: Zero-I/O check for Sidebar resilience."""
    return {"status": "healthy", "engine": "V3-BLITZ", "mesh_nodes": 59}

@router.get("/api/health")
def health_audit():
    """
    ARCHITECTURE: DEEP DIAGNOSTIC AUDIT
    
    ACTION:
    Checks the integrity of the three core pillars:
    1. PERSISTENCE: Verifies SQLite WAL handle and logic execution.
    2. SECURITY: Verifies Fernet Encryption Bridge (Vault) throughput.
    3. INFRASTRUCTURE: Validates runtime versioning.
    """
    health_results = {
        "status": "online",
        "engine_version": "V3.0-PHASE-AWARE",
        "active_directory": os.path.abspath(__file__),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "mesh_status": "READY",
        "llm_mode": "local-only" if settings.LOCAL_ONLY_MESH else "vault-mesh",
        "local_models": {
            "primary": settings.LOCAL_ONLY_PRIMARY_MODEL,
            "fallback": settings.LOCAL_ONLY_FALLBACK_MODEL,
        },
        "services": {
            "database": "untested",
            "vault": "untested"
        }
    }

    # 1. Database Connectivity Probe
    try:
        db = SessionLocal()
        # Simple 'SELECT 1' equivalent logic via SQLAlchemy count
        from backend.core.database import GenerationTask
        db.query(GenerationTask).limit(1).all()
        health_results["services"]["database"] = "connected"
        db.close()
    except Exception as e:
        logger.error(f"[HEALTH-DB] SQLite failure: {e}")
        health_results["services"]["database"] = f"error: {str(e)}"
        health_results["status"] = "degraded"

    # 2. Vault Security Integrity Probe
    try:
        test_val = "HealthCheckSignature"
        enc = SecretVault.encrypt(test_val)
        dec = SecretVault.decrypt(enc)
        if dec == test_val:
            health_results["services"]["vault"] = "secure"
        else:
            raise ValueError("Integrity Mismatch")
    except Exception as e:
        logger.error(f"[HEALTH-VAULT] Encryption bridge failure: {e}")
        health_results["services"]["vault"] = "breached/faulty"
        health_results["status"] = "degraded"

    return health_results
