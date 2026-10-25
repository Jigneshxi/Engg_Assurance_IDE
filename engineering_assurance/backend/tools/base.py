from backend.api.models import AdapterExecutionMode
from backend.api.models import AdapterCapability
from abc import ABC, abstractmethod
from typing import Dict, Any
from backend.api.models import ExecutionContext, ToolExecutionRequest, ToolExecutionResult

class BaseToolAdapter(ABC):
    """Abstract base class for all specialist tools."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """The unique name of the tool (e.g., 'zap_scanner')."""
        pass

    @property
    @abstractmethod
    def category(self) -> str:
        """The category of the tool (e.g., 'security', 'performance')."""
        pass

    @property
    def execution_mode(self) -> AdapterExecutionMode:
        """Determines if this tool requires LLM augmentation or is standalone."""
        from backend.api.models import AdapterExecutionMode
        return AdapterExecutionMode.TOOL_ONLY

    @property
    def capability(self) -> AdapterCapability:
        """Determines if the tool is SAFE or EXECUTION."""
        from backend.api.models import AdapterCapability
        return AdapterCapability.EXECUTION

    @abstractmethod
    def is_available(self, context: ExecutionContext, readiness_snapshot: Dict[str, Any]) -> bool:
        """Determines if the tool is capable of running given the current context."""
        pass

    @abstractmethod
    def execute(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        """Executes the tool synchronously and returns the standardized result."""
        pass

    @classmethod
    def get_version(cls) -> str:
        """Returns the version of the underlying tool, if applicable."""
        return "unknown"
