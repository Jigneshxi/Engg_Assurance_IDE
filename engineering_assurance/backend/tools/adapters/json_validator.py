import time
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

try:
    import jsonschema
except ImportError:
    jsonschema = None

@ToolRegistry.register
class JsonValidatorAdapter(BaseToolAdapter):
    name = "json_validator"
    category = "general"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        return jsonschema is not None

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload
        
        schema = payload.get("schema")
        instance = payload.get("instance")
        
        if not schema or instance is None:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error="Payload must contain 'schema' and 'instance'."
            )
            
        try:
            jsonschema.validate(instance=instance, schema=schema)
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=True,
                duration_ms=duration_ms,
                summary={"status": "Valid"},
                artifacts=[]
            )
        except jsonschema.exceptions.ValidationError as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                summary={"status": "Invalid"},
                error=f"Validation Error: {e.message} at path {list(e.path)}"
            )
        except jsonschema.exceptions.SchemaError as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                summary={"status": "Schema Error"},
                error=f"Invalid JSON Schema: {e.message}"
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                summary={"status": "Error"},
                error=str(e)
            )
