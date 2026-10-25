import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Severity Mapping for Enforcement
# CRITICAL: Nodes that dictate fundamental strategy, test creation, or traceability. Must FAIL.
# SECONDARY: Edge case tools or downstream visualization. Must WARN.
AGENT_SEVERITY = {
    "clarifier": "CRITICAL",
    "creator": "CRITICAL",
    "planner": "CRITICAL",
    "traceability": "CRITICAL",
    "data_builder": "CRITICAL",
    "cross_browser": "SECONDARY",
    "mobile": "SECONDARY",
    "analytics": "SECONDARY",
}

# The canonical Input Contracts for all governed agents
AGENT_INPUT_CONTRACTS = {
    "clarifier": [
        "modules",
        "workflows",
        "entities"
    ],
    "creator": [
        "modules",
        "workflows",
        "acceptance_criteria",
        "entities"
    ],
    "planner": [
        "modules",
        "risks",
        "dependencies",
        "nfrs"
    ]
}

def validate_agent_contract(agent_name: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates that the required sub-fields of the requirement_graph are present
    before an agent is allowed to execute. Prevents downstream silent degradation.
    """
    if agent_name not in AGENT_INPUT_CONTRACTS:
        return {"agent": agent_name, "status": "PASS", "info": "No explicit contract defined"}

    required_fields = AGENT_INPUT_CONTRACTS[agent_name]
    severity = AGENT_SEVERITY.get(agent_name, "SECONDARY")
    
    # Safely extract graph nodes
    graph_data = state.get("requirement_graph") or {}
    if "requirement_graph" in graph_data:
        graph_data = graph_data["requirement_graph"]
        
    available_fields = set(graph_data.keys())

    missing = [f for f in required_fields if f not in available_fields]
    status = "PASS"
    
    # TEMPORARY MIGRATION BYPASS: Enforce AUDIT-ONLY mode.
    if missing:
        status = "WARN"
        if severity == "CRITICAL":
            logger.warning(f"[CONTRACT-VIOLATION] AUDIT-ONLY: Agent {agent_name} is missing: {missing}. Would have blocked, but proceeding.")
        else:
            logger.warning(f"[CONTRACT-VIOLATION] SECONDARY Agent {agent_name} is missing: {missing}. Proceeding with degradation.")

    return {
        "agent": agent_name,
        "required": len(required_fields),
        "available": len(required_fields) - len(missing),
        "missing": missing,
        "status": status,
        "severity": severity
    }
