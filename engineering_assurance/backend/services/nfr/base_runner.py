import abc
import asyncio
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ToolRunner(abc.ABC):
    """
    Base interface for NFR tool execution.
    Provides standard lifecycle: validate -> execute -> parse -> cleanup.
    Includes built-in retry and timeout handling.
    """
    
    def __init__(self, mission_id: str, runtime_config: Dict[str, Any], timeout_seconds: int = 120, max_retries: int = 2):
        self.mission_id = mission_id
        self.runtime_config = runtime_config
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.tool_name = self.__class__.__name__.replace("Runner", "")
        self._raw_output = None
        self._parsed_output = None
        
    @abc.abstractmethod
    async def validate(self) -> Dict[str, Any]:
        """
        Validate if the tool is available and the environment is ready.
        Must return: {"tool": str, "available": bool, "reason": str}
        """
        pass

    @abc.abstractmethod
    async def _run_command(self) -> Any:
        """
        Internal method to actually execute the tool.
        Should raise exceptions on failure so the retry wrapper can catch them.
        """
        pass

    async def execute(self) -> Dict[str, Any]:
        """
        Public execution wrapper with retry and timeout logic.
        """
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(f"[{self.tool_name}] Execution attempt {attempt}/{self.max_retries}")
                self._raw_output = await asyncio.wait_for(self._run_command(), timeout=self.timeout_seconds)
                return {"status": "SUCCESS", "raw_output": self._raw_output}
            except asyncio.TimeoutError:
                logger.warning(f"[{self.tool_name}] Attempt {attempt} timed out after {self.timeout_seconds}s")
                if attempt == self.max_retries:
                    return {"status": "TIMEOUT", "error": f"Execution timed out after {self.timeout_seconds}s"}
            except Exception as e:
                logger.warning(f"[{self.tool_name}] Attempt {attempt} failed: {e}")
                if attempt == self.max_retries:
                    return {"status": "ERROR", "error": str(e)}
            
            # Brief backoff before retry
            await asyncio.sleep(2)
            
        return {"status": "ERROR", "error": "Max retries exceeded"}

    @abc.abstractmethod
    async def parse(self) -> Dict[str, Any]:
        """
        Parse the raw output into the standardized audit schema.
        Must return a structured dictionary.
        """
        pass

    async def cleanup(self) -> None:
        """
        Cleanup temporary files, Locust files, or spawned processes.
        """
        pass
        
    async def run_lifecycle(self) -> Dict[str, Any]:
        """
        Orchestrates the entire tool lifecycle.
        """
        # 1. Validate
        validation = await self.validate()
        if not validation.get("available", False):
            return {
                "tool": self.tool_name,
                "status": "UNAVAILABLE",
                "error": validation.get("reason", "Unknown validation failure"),
                "metrics": {}
            }
            
        # 2. Execute
        exec_result = await self.execute()
        if exec_result.get("status") != "SUCCESS":
            return {
                "tool": self.tool_name,
                "status": exec_result.get("status"),
                "error": exec_result.get("error"),
                "metrics": {}
            }
            
        # 3. Parse
        try:
            self._parsed_output = await self.parse()
        except Exception as e:
            logger.error(f"[{self.tool_name}] Parse failed: {e}", exc_info=True)
            return {
                "tool": self.tool_name,
                "status": "ERROR",
                "error": f"Parse failed: {e}",
                "metrics": {}
            }
            
        # 4. Cleanup
        try:
            await self.cleanup()
        except Exception as e:
            logger.warning(f"[{self.tool_name}] Cleanup failed: {e}")
            
        return self._parsed_output
