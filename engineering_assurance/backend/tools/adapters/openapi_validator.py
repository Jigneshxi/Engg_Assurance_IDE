import time
import requests
import json
import yaml
from backend.tools.base import BaseToolAdapter
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult
from backend.tools.registry import ToolRegistry
from typing import Dict, Any

try:
    from openapi_spec_validator import validate_spec
    import jsonschema
except ImportError:
    validate_spec = None

@ToolRegistry.register
class OpenApiValidatorAdapter(BaseToolAdapter):
    name = "openapi_validator"
    category = "api_validation"

    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        # We can validate if there is a URL or if content is directly passed.
        # Allow it as long as validate_spec is installed.
        return validate_spec is not None

    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        start_time = time.time()
        payload = request.payload
        
        openapi_url = request.execution_context.get("openapi_url")
        openapi_content = payload.get("openapi_content")
        
        if not openapi_url and not openapi_content:
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=0,
                error="No openapi_url provided in execution context and no openapi_content in payload."
            )

        try:
            spec_dict = None
            if openapi_content:
                if isinstance(openapi_content, str):
                    try:
                        spec_dict = json.loads(openapi_content)
                    except json.JSONDecodeError:
                        # Fallback to YAML
                        spec_dict = yaml.safe_load(openapi_content)
                elif isinstance(openapi_content, dict):
                    spec_dict = openapi_content
                else:
                    raise ValueError("openapi_content must be a JSON/YAML string or a dict.")
            else:
                # Fetch spec
                resp = requests.get(openapi_url, timeout=10)
                resp.raise_for_status()
                try:
                    spec_dict = resp.json()
                except ValueError:
                    spec_dict = yaml.safe_load(resp.text)
            
            # Validate spec
            validate_spec(spec_dict)
            
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=True,
                duration_ms=duration_ms,
                summary={
                    "status": "Valid Spec",
                    "paths_count": len(spec_dict.get("paths", {})),
                    "openapi_version": spec_dict.get("openapi", "unknown")
                }
            )
        except jsonschema.exceptions.ValidationError as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return ToolExecutionResult(
                tool_name=self.name,
                success=False,
                duration_ms=duration_ms,
                summary={"status": "Invalid Spec"},
                error=f"Schema Validation Error: {e.message} at path {list(e.path)}"
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
