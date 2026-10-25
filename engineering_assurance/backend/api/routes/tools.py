from backend.agents.graphs.phase3_graph import logger
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import subprocess
import asyncio
import os
from backend.api.models import ExecutionContext, ExecutionMode, EnvironmentType

router = APIRouter(prefix="/api/tools", tags=["Tools"])

def evaluate_readiness(ctx: ExecutionContext, mode: str):
    if not ctx:
        return {
            "risk_level_snapshot": "low",
            "readiness": {
                "security": {"ready": False, "reason": "No execution context", "tools": []},
                "performance": {"ready": False, "reason": "No execution context", "tools": []},
                "automation": {"ready": False, "reason": "No execution context", "tools": []},
                "api_validation": {"ready": False, "reason": "No execution context", "tools": []}
            }
        }
        
    readiness = {}
    
    # Security: Requires a target (app url, api url, or repo)
    if ctx.application_url or ctx.api_base_url or ctx.repository_url:
        tools = ["npm_audit", "trivy"] if ctx.repository_url else []
        if ctx.allow_active_scanning:
            tools.append("zap")
        readiness["security"] = {
            "ready": len(tools) > 0,
            "reason": None if len(tools) > 0 else "No applicable targets for security tools",
            "tools": tools
        }
    else:
        readiness["security"] = {"ready": False, "reason": "No target URL or repository provided", "tools": []}
        
    # Performance: Requires load testing permission and a target URL
    if ctx.allow_load_testing and (ctx.application_url or ctx.api_base_url):
        readiness["performance"] = {
            "ready": True,
            "reason": None,
            "tools": ["k6"]
        }
    else:
        reason = "Load testing not allowed" if not ctx.allow_load_testing else "No target URL provided"
        readiness["performance"] = {"ready": False, "reason": reason, "tools": []}
        
    # Automation: Requires a repository
    if ctx.repository_url:
        readiness["automation"] = {
            "ready": True,
            "reason": None,
            "tools": ["eslint", "tsc", "pytest"]
        }
    else:
        readiness["automation"] = {"ready": False, "reason": "Repository URL missing", "tools": []}
        
    # API Validation: Requires OpenAPI URL
    if ctx.openapi_url:
        readiness["api_validation"] = {
            "ready": True,
            "reason": None,
            "tools": ["openapi-validator", "prism", "newman"]
        }
    else:
        readiness["api_validation"] = {"ready": False, "reason": "OpenAPI Spec missing", "tools": []}

    # Calculate Risk Level
    risk_level = "low"
    if mode == "validation":
        risk_level = "medium"
    elif mode == "full_execution":
        if ctx.allow_load_testing:
            risk_level = "critical"
        elif ctx.allow_active_scanning:
            risk_level = "high"
        else:
            risk_level = "medium"
            
    return {
        "risk_level_snapshot": risk_level,
        "readiness": readiness
    }

class ReadinessRequest(BaseModel):
    execution_context: ExecutionContext
    execution_mode: str = "analysis"

@router.post("/readiness")
async def get_tool_readiness(req: ReadinessRequest):
    return evaluate_readiness(req.execution_context, req.execution_mode)

@router.get("/health")
async def get_tool_health():
    from backend.tools.registry import ToolRegistry
    import backend.tools.adapters.mock
    import backend.tools.adapters
    
    health_status = {}
    for tool_name, adapter_cls in ToolRegistry._adapters.items():
        try:
            version = adapter_cls.get_version()
        except Exception:
            version = "unknown"
            
        health_status[tool_name] = {
            "available": True,
            "version": version
        }
    return health_status

class ExecuteSandboxRequest(BaseModel):
    command_key: str
    test_paths: Optional[List[str]] = None
    mission_id: Optional[str] = None

ALLOWED_COMMANDS = {
    "npm_test": ["npm", "test"],
    "pytest": ["pytest", "-v", "--tb=short"],
    "playwright": ["npx", "playwright", "test"],
    "k6": ["k6", "run", "load_test.js"]
}

@router.post("/execute-sandbox")
async def execute_sandbox(req: ExecuteSandboxRequest):
    if req.command_key not in ALLOWED_COMMANDS:
        raise HTTPException(status_code=400, detail="Command not allowed")
        
    cmd = ALLOWED_COMMANDS[req.command_key].copy()
    
    workspace_dir = os.environ.get("WORKSPACE_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
    
    # Resolve test paths — if mission_id provided, target mission's handoff bundle
    if req.test_paths:
        cmd.extend(req.test_paths)
    elif req.mission_id:
        mission_test_dir = os.path.join(workspace_dir, "workspace", "missions", req.mission_id, "handoff-bundle", "tests")
        if os.path.exists(mission_test_dir):
            cmd.append(mission_test_dir)
        else:
            # Fallback: try codebase/tests
            codebase_test_dir = os.path.join(workspace_dir, "workspace", "missions", req.mission_id, "codebase", "tests")
            if os.path.exists(codebase_test_dir):
                cmd.append(codebase_test_dir)
            else:
                return StreamingResponse(
                    _error_stream(f"No test directory found for mission {req.mission_id}"),
                    media_type="text/event-stream"
                )
    
    # Sanitize env variables
    safe_env = os.environ.copy()
    for key in list(safe_env.keys()):
        if "TOKEN" in key.upper() or "SECRET" in key.upper() or "KEY" in key.upper() or "PASSWORD" in key.upper():
            del safe_env[key]
    safe_env["PYTHONPATH"] = workspace_dir
    safe_env["TEST_BASE_URL"] = req.base_url if hasattr(req, 'base_url') and req.base_url else "http://localhost:8000"
            
    async def event_generator():
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=workspace_dir,
                env=safe_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            
            try:
                while True:
                    line = await asyncio.wait_for(process.stdout.readline(), timeout=120)
                    if not line:
                        break
                    yield f"data: {line.decode('utf-8').rstrip()}\n\n"
                    
                await asyncio.wait_for(process.wait(), timeout=30)
                yield f"data: [PROCESS_EXIT_CODE] {process.returncode}\n\n"
                
            except asyncio.TimeoutError:
                process.terminate()
                yield "data: [ERROR] Execution timed out.\n\n"
                
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def _error_stream(msg: str):
    yield f"data: [ERROR] {msg}\n\n"

@router.post("/mission/{mission_id}/nfr-resume")
async def resume_nfr_audit(mission_id: str):
    # pyrefly: ignore [missing-import]
    from backend.agents.workflow import get_planning_graph
    graph = get_planning_graph()
    thread_config = {"configurable": {"thread_id": mission_id}}
    
    try:
        # Resuming the graph will re-trigger the edge from nfr_blocked_node to nfr_fan_out_node
        await graph.ainvoke(None, thread_config)
        return {"status": "resumed"}
    except Exception as e:
        logger.error(f"Failed to resume NFR audits for {mission_id}: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/mission/{mission_id}/test-stream")
async def get_test_stream(mission_id: str):
    from backend.services.test_broadcaster import broadcaster
    import asyncio
    
    async def event_generator():
        q = await broadcaster.subscribe(mission_id)
        try:
            while True:
                message = await q.get()
                yield f"data: {message}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(mission_id, q)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
