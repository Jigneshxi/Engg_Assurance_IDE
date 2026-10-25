import time
from datetime import datetime, timezone
from typing import List, Dict, Any
from backend.tools.registry import ToolRegistry
from backend.api.models import ToolExecutionRequest, ExecutionContext

class ToolOrchestrator:
    AGENT_TOOL_PROFILES = {
        "test_data_builder": ["schema_generator", "faker", "json_validator"],
        "automation_forge": ["ast_parser", "eslint", "tsc", "pytest"],
        "governance": ["governance_rules"],
        "regression": ["git_diff"],
        "requirement_clarifier": ["markdown_quality", "json_validator"],
        "security": ["npm_audit", "pip_audit"]
    }

    @classmethod
    def execute_profile(cls, profile_name: str, state: dict, custom_payloads: dict = None) -> List[Dict[str, Any]]:
        """
        Executes a predefined sequence of tools for a specific agent profile.
        custom_payloads maps tool_name -> payload dict.
        """
        import backend.tools.adapters.mock
        import backend.tools.adapters
        
        tool_names = cls.AGENT_TOOL_PROFILES.get(profile_name, [])
        if not tool_names:
            return []

        raw_ctx = state.get("execution_context") or {}
        readiness = state.get("execution_readiness") or {}
        custom_payloads = custom_payloads or {}
        
        try:
            context = ExecutionContext(**raw_ctx)
        except Exception:
            context = ExecutionContext()

        mission_id = int(state.get("Sovereign_Mission_ID") or 0)
        results = []

        for tool_name in tool_names:
            adapter = ToolRegistry.get_adapter(tool_name)
            if not adapter:
                continue

            # NEW: Guardrails based on AdapterCapability and execution_mode
            mission_execution_mode = state.get("execution_mode", "analysis")
            if mission_execution_mode in ("analysis", "planning"):
                from backend.api.models import AdapterCapability
                if getattr(adapter, "capability", AdapterCapability.EXECUTION) == AdapterCapability.EXECUTION:
                    results.append({
                        "tool_name": adapter.name,
                        "success": False,
                        "duration_ms": 0,
                        "summary": {"message": f"Skipped in {mission_execution_mode} mode"},
                        "status": "skipped",
                        "execution_mode": adapter.execution_mode
                    })
                    continue

            if not adapter.is_available(context, readiness):
                results.append({
                    "tool_name": adapter.name,
                    "success": False,
                    "duration_ms": 0,
                    "summary": {"message": "Not available in context."},
                    "status": "skipped",
                    "execution_mode": adapter.execution_mode
                })
                continue

            request = ToolExecutionRequest(
                mission_id=mission_id,
                correlation_id=str(state.get("task_id", "")),
                agent_name=profile_name,
                tool_name=adapter.name,
                execution_context=raw_ctx,
                readiness_snapshot=readiness,
                payload=custom_payloads.get(tool_name, {}),
                approved=True
            )
            
            start_time = time.time()
            started_at = datetime.now(timezone.utc).isoformat()
            try:
                result = adapter.execute(request)
                if not result.started_at:
                    result.started_at = started_at
                if not result.completed_at:
                    result.completed_at = datetime.now(timezone.utc).isoformat()
                
                # Tag the execution mode for the node's LLM routing logic
                res_dict = result.model_dump()
                res_dict["execution_mode"] = adapter.execution_mode
                results.append(res_dict)
            except Exception as e:
                duration_ms = int((time.time() - start_time) * 1000)
                from backend.api.models import ToolExecutionResult
                err_res = ToolExecutionResult(
                    tool_name=adapter.name,
                    success=False,
                    duration_ms=duration_ms,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary={"message": "Execution failed"},
                    error=str(e)
                )
                err_dict = err_res.model_dump()
                err_dict["execution_mode"] = adapter.execution_mode
                results.append(err_dict)

        return results

    @classmethod
    def execute(cls, category: str, state: dict) -> List[Dict[str, Any]]:
        """
        Executes all available tools in the given category sequentially.
        """
        
        raw_ctx = state.get("execution_context") or {}
        readiness = state.get("execution_readiness") or {}
        
        try:
            context = ExecutionContext(**raw_ctx)
        except Exception:
            context = ExecutionContext()

        mission_id = int(state.get("Sovereign_Mission_ID") or 0)
        
        adapters = ToolRegistry.get_adapters_by_category(category)
        results = []

        for adapter in adapters:
            if not adapter.is_available(context, readiness):
                results.append({
                    "tool": adapter.name,
                    "status": "skipped",
                    "reason": "Not available or missing permissions in context."
                })
                continue
            
            request = ToolExecutionRequest(
                mission_id=mission_id,
                correlation_id=str(state.get("task_id", "")),
                agent_name=category,
                tool_name=adapter.name,
                execution_context=raw_ctx,
                readiness_snapshot=readiness,
                payload={"orchestrator_invoked": True},
                approved=True
            )
            
            start_time = time.time()
            started_at = datetime.now(timezone.utc).isoformat()
            try:
                result = adapter.execute(request)
                if not result.started_at:
                    result.started_at = started_at
                if not result.completed_at:
                    result.completed_at = datetime.now(timezone.utc).isoformat()
                results.append(result.model_dump())
            except Exception as e:
                duration_ms = int((time.time() - start_time) * 1000)
                from backend.api.models import ToolExecutionResult
                err_res = ToolExecutionResult(
                    tool_name=adapter.name,
                    success=False,
                    duration_ms=duration_ms,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary={"message": "Execution failed"},
                    error=str(e)
                )
                results.append(err_res.model_dump())

        return results
