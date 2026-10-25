"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - API AGGREGATION HUB
================================================================================
This module serves as the central router for the backend services. 
It aggregates domain-specific sub-routers (Fetching, Tasks, Knowledge, etc.) 
into a unified API tree.
"""
from fastapi import APIRouter

# Import modular subdomain routers.
from backend.api.routes import health
from backend.api.routes import llm
from backend.api.routes import integrations
from backend.api.routes import fetch
from backend.api.routes import tasks
from backend.api.routes import knowledge
from backend.api.routes import history
from backend.api.routes import publish
from backend.api.routes import agents
from backend.api.routes import converge
from backend.api.routes import conflict

# Instantiate the primary router.
router = APIRouter()

# --- MOUNT SUBDOMAINS ---
# Logic: Centralized registration of all application features.
router.include_router(health.router)
router.include_router(llm.router)
router.include_router(integrations.router)
router.include_router(fetch.router)
router.include_router(tasks.router)
router.include_router(knowledge.router)
router.include_router(history.router)
router.include_router(publish.router)
router.include_router(agents.router)
router.include_router(converge.router)
router.include_router(conflict.router)

from backend.api.routes import auth
router.include_router(auth.router)

from backend.api.routes import missions
router.include_router(missions.router)

from backend.api.routes import tools
router.include_router(tools.router)

from backend.api.routes import git
router.include_router(git.router)

from backend.api.routes import plans
router.include_router(plans.router)
