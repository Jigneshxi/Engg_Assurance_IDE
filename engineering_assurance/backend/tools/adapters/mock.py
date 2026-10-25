from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

@ToolRegistry.register
class EchoAdapter(BaseToolAdapter):
    name = "echo_adapter"
    category = "security" # Use security so we can test it in security_intel_node

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return True

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        return ToolExecutionResult(
            tool_name=self.name,
            success=True,
            duration_ms=5,
            summary={"message": "Echo successful", "received_payload": request.payload},
            artifacts=[]
        )

@ToolRegistry.register
class HealthCheckAdapter(BaseToolAdapter):
    name = "health_check"
    category = "security"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return True

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        return ToolExecutionResult(
            tool_name=self.name,
            success=True,
            duration_ms=2,
            summary={"message": "Health check passed"},
            artifacts=[]
        )
