import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class RetryPolicy:
    MAX_RETRIES = 3

    @staticmethod
    def evaluate(nfr_clearance_report: Dict[str, Any], current_retry_count: int) -> Dict[str, Any]:
        """
        Evaluates the NFR report to determine if a retry is allowed.
        Returns a dict indicating if we should retry, and for which modules.
        """
        if current_retry_count >= RetryPolicy.MAX_RETRIES:
            logger.warning(f"Max retries ({RetryPolicy.MAX_RETRIES}) reached. Failing.")
            return {"should_retry": False, "failed_modules": []}

        if nfr_clearance_report.get("all_nfr_green", False):
            return {"should_retry": False, "failed_modules": []}

        # Collect modules that failed based on the tool results
        failed_modules = set()
        tool_results = nfr_clearance_report.get("tool_results", {})
        
        # We loop through all tools and all results to find modules with failing/blocking findings
        for tool_category, results in tool_results.items():
            if isinstance(results, list):
                for res in results:
                    mod = res.get("module")
                    status = res.get("status")
                    # Simplified logic: if the tool itself reported ERROR, or if there are metrics that cause failures
                    if status == "ERROR":
                        failed_modules.add(mod)
                    else:
                        metrics = res.get("metrics", {})
                        if res.get("tool") == "secret_scan" and metrics.get("secrets_found", 0) > 0:
                            failed_modules.add(mod)
                        if res.get("tool") == "security_sast" and metrics.get("critical", 0) > 0:
                            failed_modules.add(mod)
                        # Add more tool-specific logic if needed...
        
        # In this simple policy, if there are blocking_findings, we try to retry
        blocking_findings = nfr_clearance_report.get("blocking_findings", [])
        
        # If we couldn't isolate the module but we have blocking findings, we might just retry 'global'
        if blocking_findings and not failed_modules:
            failed_modules.add("global")

        if failed_modules:
            return {"should_retry": True, "failed_modules": list(failed_modules)}

        return {"should_retry": False, "failed_modules": []}
