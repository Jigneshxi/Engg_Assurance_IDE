"""
Phase Registry for A.N.T Agentic Mesh

Defines the topology and metadata for each execution phase of the system.
This serves as the source of truth for UI visualization, dashboard metrics,
and orchestrator topology mapping.
"""

PHASE_DEFINITIONS = {
    1: {
        "name": "Command Mesh",
        "status_gate": "HITL1_PENDING",
        "next_phase": 2,
        "ui_nodes": [
            "ingestor",
            "repository_intelligence",
            "tech_stack_analysis",
            "clarifier"
        ],
        "nodes": [
            "ingestor",
            "validate_ingestion",
            "repository_intelligence",
            "tech_stack_analysis",
            "clarifier"
        ]
    },
    2: {
        "name": "Artifact Factory",
        "status_gate": "HITL2_PENDING",
        "next_phase": 3,
        "ui_nodes": [
            "architect",
            "logician",
            "governor",
            "planning_agent",
            "api_design",
            "db_schema",
            "engineering_contract",
            "tdd_contract",
            "requirement_clarifier_p2",
            "synthesis_optimizer_p2",
            "traceability_auditor_p2",
            "api_dependency_mapper",
            "performance_architect_p2",
            "security_intelligence_p2",
            "compliance_governor_p2"
        ],
        "nodes": [
            "architect",
            "logician",
            "governor",
            "api_design",
            "db_schema",
            "engineering_contract",
            "tdd_contract",
            "requirement_clarifier_p2",
            "synthesis_optimizer_p2",
            "traceability_auditor_p2",
            "api_dependency_mapper",
            "performance_architect_p2",
            "security_intelligence_p2",
            "compliance_governor_p2"
        ]
    }
}

def validate_phase_registry():
    import logging
    from backend.core.agent_registry import AGENT_REGISTRY
    logger = logging.getLogger(__name__)
    
    for phase_id, phase in PHASE_DEFINITIONS.items():
        for node in phase.get("nodes", []):
            if node not in AGENT_REGISTRY:
                raise RuntimeError(
                    f"Topology Error: '{node}' exists in PHASE_DEFINITIONS[{phase_id}]['nodes'] "
                    f"but not in AGENT_REGISTRY."
                )
        for node in phase.get("ui_nodes", []):
            if node not in AGENT_REGISTRY:
                raise RuntimeError(
                    f"Topology Error: '{node}' exists in PHASE_DEFINITIONS[{phase_id}]['ui_nodes'] "
                    f"but not in AGENT_REGISTRY."
                )

validate_phase_registry()
