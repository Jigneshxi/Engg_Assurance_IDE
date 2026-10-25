"""
Mission policy helpers for CONVERGE launch orchestration.

The policy keeps a single source of truth for:
- role -> module access
- module -> core agent pipeline
- depth -> expansion tiers
- dependency -> automatic linked-agent inclusion
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any, Dict, Iterable, List, Sequence, Tuple
import logging

logger = logging.getLogger(__name__)


ROLE_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "qa": {
        "modules": ["ingest", "forge"],
        "depth": "standard",
        "description": "Ingest requirements and generate a complete test suite.",
        "recommended_views": ["mesh_observatory", "test_case_factory"],
    },
    "swe": {
        "modules": ["forge"],
        "depth": "standard",
        "description": "Generate automation from an existing specification.",
        "recommended_views": ["crew_code_generators", "crew_scenario_data"],
        "requires_context": True,
    },
    "architect": {
        "modules": ["ingest", "forge", "certify"],
        "depth": "standard",
        "description": "Ingest, generate, and certify quality outputs.",
        "recommended_views": ["mesh_observatory", "release_command"],
    },
    "pm": {
        "modules": ["decide"],
        "depth": "rapid",
        "description": "Release decision and engineering economics from a prior run.",
        "recommended_views": ["release_command", "history_trends"],
        "requires_parent_task": True,
    },
    "sre": {
        "modules": ["certify"],
        "depth": "standard",
        "description": "Compliance audit and evidence package generation.",
        "recommended_views": ["crew_security_aspm", "release_command"],
        "requires_context": True,
    },
    "leader": {
        "modules": ["decide"],
        "depth": "rapid",
        "description": "Executive release signal with financial justification.",
        "recommended_views": ["release_command"],
        "requires_parent_task": True,
    },
}

CORE_AGENTS: List[str] = [
    "ingestor",
    "clarifier",
    "synthesis_initial",
    "governor",
    "planning_agent",
    "logician",
]

EXECUTION_GROUPS: Dict[str, List[str]] = {
    "core_foundation": list(CORE_AGENTS),
    "test_generation": [
        "creator",
        "data_builder",
        "api_mock",
        "automation_forge",
        "api_coder",
        "api_validation",
        "regression",
        "cross_browser",
    ],
    "certify_quality": [
        "security",
        "performance",
        "chaos",
    ],
    "delivery_chain": [
        "delivery",
        "lifecycle",
        "run_orchestrator",
    ],
}

DEPTH_BUDGETS: Dict[str, int] = {
    "rapid": 20,
    "standard": 40,
    "full": 999,
}

AGENT_GROUP_INDEX: Dict[str, str] = {}
for _group_name, _members in EXECUTION_GROUPS.items():
    for _agent in _members:
        AGENT_GROUP_INDEX[_agent] = _group_name

AGENT_PRIORITY_OVERRIDES: Dict[str, int] = {
    "ingestor": 110,
    "clarifier": 110,
    "synthesis_initial": 105,
    "governor": 105,
    "planning_agent": 105,
    "logician": 105,
    "creator": 100,
    "data_builder": 95,
    "api_mock": 94,
    "automation_forge": 94,
    "api_coder": 94,
    "api_validation": 92,
    "regression": 90,
    "cross_browser": 88,
    "security": 86,
    "performance": 86,
    "chaos": 84,
    "delivery": 82,
    "lifecycle": 80,
    "run_orchestrator": 80,
    "synthesis_final": 100,
    "compose": 100,
}

# ─────────────────────────────────────────────────────────────────────
# CAPABILITY_PACKS → ARTIFACT_PACKS → MODULE_DELIVERABLES
# The flow is: Module + Depth → Capabilities → Artifact Packs → Artifacts → Producer Agents
# Every produced artifact in AGENT_REGISTRY MUST appear in exactly one ARTIFACT_PACK.
# ─────────────────────────────────────────────────────────────────────

CAPABILITY_PACKS = {
    # ── Ingest capabilities ──
    "core_analysis": [
        "CORE_REQUIREMENTS"
    ],
    "ingest_governance": [
        "INGEST_TRACEABILITY"
    ],
    "ingest_advanced": [
        "INGEST_INTELLIGENCE"
    ],

    # ── Forge capabilities ──
    "quality_engineering": [
        "QUALITY_ASSURANCE"
    ],
    "forge_validation": [
        "FORGE_EXTENDED_VALIDATION"
    ],
    "forge_advanced": [
        "FORGE_ENTERPRISE"
    ],

    # ── Certify capabilities ──
    "compliance_core": [
        "CERTIFY_CORE"
    ],
    "compliance_extended": [
        "CERTIFY_MONITORING"
    ],
    "compliance_advanced": [
        "CERTIFY_ADVANCED"
    ],

    # ── Decide capabilities ──
    "release_core": [
        "DECIDE_CORE"
    ],
    "release_extended": [
        "DECIDE_GOVERNANCE"
    ],
    "release_advanced": [
        "DECIDE_ANALYTICS"
    ],
}

ARTIFACT_PACKS = {
    # ── Ingest Packs ──
    "CORE_REQUIREMENTS": [
        "REQUIREMENTS", "RAW_REQUIREMENTS", "API_SPEC",         # ingestor
        "INGESTION_VALIDATION",                                   # validate_ingestion
        "REPO_INTELLIGENCE",                                      # repository_intelligence
        "TECH_STACK_REPORT",                                      # tech_stack_analysis
        "REFINED_REQUIREMENTS",                                   # clarifier
        "UCC",                                                    # synthesis_initial
        "TEST_PLAN",                                              # planning_agent
    ],
    "INGEST_TRACEABILITY": [
        "LOGIC_MODEL",                                            # logician
        "TRACEABILITY_MATRIX",                                    # auditor
        "GOVERNANCE_REPORT",                                      # governor
        "LIFECYCLE_REPORT",                                       # lifecycle
    ],
    "INGEST_INTELLIGENCE": [
        "KNOWLEDGE_GRAPH",                                        # knowledge_graph
        "META_INTEL_REPORT",                                      # meta_intel
    ],

    # ── Forge Packs ──
    "QUALITY_ASSURANCE": [
        "TEST_CASES",                                             # creator
        "TEST_DATA",                                              # data_builder
        "API_MOCKS",                                              # api_mock
        "AUTOMATION_SCRIPTS",                                     # automation_forge
        "API_AUTOMATION",                                         # api_coder
        "API_DESIGN_SPEC",                                        # architect
        "DB_SCHEMA_DESIGN",                                       # db_architect
        "ENGINEERING_CONTRACT",                                   # engineering_contract
        "FRONTEND_CODE",                                          # frontend_forge
        "BACKEND_CODE",                                           # backend_forge
        "DATABASE_PIPELINE",                                      # database_forge
        "SERVICE_MESH",                                           # service_mesh
        "TDD_CONTRACTS",                                          # tdd_contract
        # NEW: Phase 2 architecture-gate artifacts
        "REQUIREMENT_CLARITY_REPORT",                             # requirement_clarifier_p2
        "MODULE_BOUNDARY_MAP",                                    # synthesis_optimizer_p2
        "TRACEABILITY_MATRIX_P2",                                 # traceability_auditor_p2
        "INTEGRATION_DEPENDENCY_MAP",                             # api_dependency_mapper
        "PERFORMANCE_BUDGET",                                     # performance_architect_p2
        "SECURITY_CONSTRAINTS",                                   # security_intelligence_p2
        "COMPLIANCE_REQUIREMENTS",                                # compliance_governor_p2
        "MCP_RECOMMENDATIONS",                                    # mcp_advisor
        "HOOK_GUARDRAIL_RECOMMENDATIONS",                         # hook_guardrails_advisor
    ],
    "FORGE_EXTENDED_VALIDATION": [
        "REGRESSION_SUITE",                                       # regression
        "TEST_STRATEGY",                                          # agent_2
        "CROSS_BROWSER_CONFIG",                                   # cross_browser
        "MOBILE_CONFIG",                                          # mobile_testing
        "GRAPHQL_REPORT",                                         # graphql_validator
        "API_VALIDATION_REPORT",                                  # api_validation
        "VISUAL_BASELINES",                                       # visual_intel
        "MICROSERVICES_REPORT",                                   # microservices
    ],
    "FORGE_ENTERPRISE": [
        "MUTATION_REPORT",                                        # mutation
        "MIGRATION_REPORT",                                       # migration
        "LOCATOR_STRATEGY",                                       # locator
        "HEALING_CONFIG",                                         # self_healing
    ],

    # ── Certify Packs ──
    "CERTIFY_CORE": [
        "PERFORMANCE_REPORT",                                     # performance
        "SECURITY_REPORT",                                        # security
        "CHAOS_REPORT",                                           # chaos
        "DELIVERY_REPORT",                                        # delivery
        "RELIABILITY_REPORT",                                     # reliability_engineering
        "SLO_REPORT",                                             # slo
        "TRACING_REPORT",                                         # tracing
        "ENV_REPORT",                                             # env_consistency
    ],
    "CERTIFY_MONITORING": [
        "MONITOR_REPORT",                                         # monitor
        "COMPLIANCE_REMEDIATION",                                 # compliance_remediation
    ],
    "CERTIFY_ADVANCED": [
        "RCA_REPORT",                                             # rca_intel
        "INCIDENT_REPORT",                                        # inc_remed
        "OBSERVABILITY_REPORT",                                   # obs_intel
        "PERF_INTEL",                                             # perf_intel
        "RESILIENCE_REPORT",                                      # sys_resil
    ],

    # ── Decide Packs ──
    "DECIDE_CORE": [
        "EXECUTION_REPORT",                                       # run_orchestrator
        "PIPELINE_REPORT",                                        # data_pipeline
        "PROVISION_REPORT",                                       # env_provisioner
        "TWIN_REPORT",                                            # digital_twin
        "OPTIMIZED_SUITE",                                        # suite_optimization
        "FEATURE_FLAG_REPORT",                                    # feature_flag
        "EVENT_REPORT",                                           # event_driven
        "EXPLORATORY_REPORT",                                     # exploratory
        "UX_REPORT",                                              # ux_intelligence
    ],
    "DECIDE_GOVERNANCE": [
        "RELEASE_DECISION",                                       # rel_risk
        "RELEASE_PACKAGE",                                        # release_commander
        "IMPACT_REPORT",                                          # test_impact
        "BUSINESS_IMPACT",                                        # biz_impact
        "ROI_REPORT",                                             # roi_intel
        "TREND_REPORT",                                           # trend_analyst
    ],
    "DECIDE_ANALYTICS": [
        "CRITIC_REPORT",                                          # critic
        "I18N_REPORT",                                            # i18n_testing
    ],
}

MODULE_DELIVERABLES = {
    "ingest": {
        "rapid":    ["core_analysis"],
        "standard": ["core_analysis", "ingest_governance"],
        "full":     ["core_analysis", "ingest_governance", "ingest_advanced"],
    },
    "forge": {
        "rapid":    ["quality_engineering"],
        "standard": ["quality_engineering", "forge_validation"],
        "full":     ["quality_engineering", "forge_validation", "forge_advanced"],
    },
    "certify": {
        "rapid":    ["compliance_core"],
        "standard": ["compliance_core", "compliance_extended"],
        "full":     ["compliance_core", "compliance_extended", "compliance_advanced"],
    },
    "decide": {
        "rapid":    ["release_core"],
        "standard": ["release_core", "release_extended"],
        "full":     ["release_core", "release_extended", "release_advanced"],
    },
}

# ─────────────────────────────────────────────────────────────────────
# ARTIFACT_CRITICALITY
# Determines mission behavior when an artifact is missing:
#   required    → Mission fails if this artifact is not produced
#   recommended → Warning logged, mission continues
#   optional    → No warning, mission continues
# ─────────────────────────────────────────────────────────────────────
ARTIFACT_CRITICALITY = {
    # Ingest - Core (required)
    "REQUIREMENTS": "required",
    "RAW_REQUIREMENTS": "required",
    "INGESTION_VALIDATION": "recommended",
    "REPO_INTELLIGENCE": "recommended",
    "TECH_STACK_REPORT": "recommended",
    "API_SPEC": "recommended",
    "REFINED_REQUIREMENTS": "required",
    "UCC": "required",
    "TEST_PLAN": "required",
    # Ingest - Traceability (recommended)
    "LOGIC_MODEL": "recommended",
    "TRACEABILITY_MATRIX": "recommended",
    "GOVERNANCE_REPORT": "recommended",
    "LIFECYCLE_REPORT": "optional",
    # Ingest - Intelligence (optional)
    "KNOWLEDGE_GRAPH": "optional",
    "META_INTEL_REPORT": "optional",

    # Forge - Core (required)
    "TEST_CASES": "required",
    "TEST_DATA": "required",
    "API_MOCKS": "recommended",
    "AUTOMATION_SCRIPTS": "required",
    "API_AUTOMATION": "recommended",
    "API_DESIGN_SPEC": "recommended",
    "DB_SCHEMA_DESIGN": "recommended",
    "ENGINEERING_CONTRACT": "recommended",
    "FRONTEND_CODE": "recommended",
    "BACKEND_CODE": "recommended",
    "DATABASE_PIPELINE": "recommended",
    "SERVICE_MESH": "recommended",
    "TDD_CONTRACTS": "recommended",
    # Forge - Extended (recommended)
    "REGRESSION_SUITE": "recommended",
    "TEST_STRATEGY": "recommended",
    "CROSS_BROWSER_CONFIG": "optional",
    "MOBILE_CONFIG": "optional",
    "GRAPHQL_REPORT": "optional",
    "API_VALIDATION_REPORT": "recommended",
    "VISUAL_BASELINES": "optional",
    "MICROSERVICES_REPORT": "optional",
    # Forge - Enterprise (optional)
    "MUTATION_REPORT": "optional",
    "MIGRATION_REPORT": "optional",
    "LOCATOR_STRATEGY": "optional",
    "HEALING_CONFIG": "optional",

    # Certify - Core (required/recommended)
    "PERFORMANCE_REPORT": "required",
    "SECURITY_REPORT": "required",
    "CHAOS_REPORT": "recommended",
    "DELIVERY_REPORT": "recommended",
    "RELIABILITY_REPORT": "recommended",
    "SLO_REPORT": "recommended",
    "TRACING_REPORT": "recommended",
    "ENV_REPORT": "optional",
    # Certify - Monitoring (recommended)
    "MONITOR_REPORT": "recommended",
    "COMPLIANCE_REMEDIATION": "recommended",
    # Certify - Advanced (optional)
    "RCA_REPORT": "optional",
    "INCIDENT_REPORT": "optional",
    "OBSERVABILITY_REPORT": "optional",
    "PERF_INTEL": "optional",
    "RESILIENCE_REPORT": "optional",

    # Decide - Core (recommended)
    "EXECUTION_REPORT": "recommended",
    "PIPELINE_REPORT": "optional",
    "PROVISION_REPORT": "optional",
    "TWIN_REPORT": "optional",
    "OPTIMIZED_SUITE": "optional",
    "FEATURE_FLAG_REPORT": "optional",
    "EVENT_REPORT": "optional",
    "EXPLORATORY_REPORT": "optional",
    "UX_REPORT": "optional",
    # Decide - Governance (required)
    "RELEASE_DECISION": "required",
    "RELEASE_PACKAGE": "required",
    "IMPACT_REPORT": "recommended",
    "BUSINESS_IMPACT": "recommended",
    "ROI_REPORT": "recommended",
    "TREND_REPORT": "recommended",
    # Decide - Analytics (optional)
    "CRITIC_REPORT": "optional",
    "I18N_REPORT": "optional",

    # System (always present)
    "FINAL_REPORT": "required",
    "FINAL_DOCUMENT": "required",
    "FACTORY_OUTPUT": "optional",
    "SYNTHESIS_REPORT": "optional",
}

# System artifacts (FINAL_REPORT, FINAL_DOCUMENT, FACTORY_OUTPUT, SYNTHESIS_REPORT)
# are produced by 'system' tier agents which are always included regardless of depth.


def _resolve_artifacts_for_depth(module: str, depth: str) -> set:
    """Resolve the full set of artifacts for a module+depth combination."""
    caps = MODULE_DELIVERABLES.get(module, {}).get(depth, [])
    arts = set()
    for cap in caps:
        for pack in CAPABILITY_PACKS.get(cap, []):
            arts.update(ARTIFACT_PACKS.get(pack, []))
    return arts


def validate_depth_matrix():
    """Startup validation: Rapid artifacts must be a subset of Standard, which must be a subset of Full."""
    errors = []
    for module in MODULE_DELIVERABLES:
        rapid = _resolve_artifacts_for_depth(module, "rapid")
        standard = _resolve_artifacts_for_depth(module, "standard")
        full = _resolve_artifacts_for_depth(module, "full")

        if not rapid.issubset(standard):
            extras = rapid - standard
            errors.append(f"[{module}] Rapid artifacts not subset of Standard. Extra: {extras}")
        if not standard.issubset(full):
            extras = standard - full
            errors.append(f"[{module}] Standard artifacts not subset of Full. Extra: {extras}")

    if errors:
        raise RuntimeError("Depth matrix validation failed:\n" + "\n".join(errors))

validate_depth_matrix()


from backend.core.agent_registry import AGENT_REGISTRY

# To keep backward compatibility with ALL_MISSION_AGENT_KEYS
ALL_MISSION_AGENT_KEYS = sorted(list(AGENT_REGISTRY.keys()))

def _normalize_key(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_depth(depth: str | None) -> str:
    value = _normalize_key(depth)
    if value == "full_mesh":
        return "full"
    if value not in {"rapid", "standard", "full"}:
        return "standard"
    return value


def normalize_role(role: str | None) -> str:
    value = _normalize_key(role)
    if value not in ROLE_DEFAULTS:
        logger.warning(f"[MISSION-POLICY] Unrecognized role '{role}' — falling back to 'qa' defaults")
        return "qa"
    return value


VALID_MODULES = ["ingest", "forge", "certify", "decide"]
SYSTEM_MODULES = {"system"}

DELIVERABLE_LABELS: Dict[str, List[str]] = {
    "core_analysis": ["Requirements", "Unified Context Contract", "Test Plan"],
    "ingest_governance": ["Logic Model", "Traceability Matrix", "Governance Report", "Lifecycle Report"],
    "ingest_advanced": ["Knowledge Graph", "Meta Intelligence"],
    "quality_engineering": ["Test Cases", "Test Data", "API Mocks", "Automation", "API Automation"],
    "forge_validation": ["Regression Suite", "Test Strategy", "Cross Browser", "Mobile", "GraphQL", "API Validation", "Visual Baselines", "Microservices"],
    "forge_advanced": ["Mutation", "Migration", "Locator Strategy", "Healing Config"],
    "compliance_core": ["Performance", "Security", "Chaos", "Delivery", "Reliability", "SLO", "Tracing", "Environment"],
    "compliance_extended": ["Monitoring", "Compliance Remediation"],
    "compliance_advanced": ["RCA", "Incident Remediation", "Observability", "Performance Intelligence", "Resilience"],
    "release_core": ["Execution Report", "Pipeline", "Provisioning", "Digital Twin", "Optimized Suite", "Feature Flags", "Event Driven", "Exploratory", "UX"],
    "release_extended": ["Release Decision", "Release Package", "Impact", "Business Impact", "ROI", "Trend"],
    "release_advanced": ["Critic Report", "I18N"],
}

def normalize_module(module: str | None) -> str:
    value = _normalize_key(module)
    if value == "all":
        return "all"
    if value in VALID_MODULES:
        return value
    return "all"


def normalize_modules(modules: Sequence[str] | None, fallback_role: str | None = None) -> List[str]:
    role = normalize_role(fallback_role)
    candidate_modules = [normalize_module(m) for m in (modules or [])]
    
    if "all" in candidate_modules:
        return list(VALID_MODULES)
        
    selected = [m for m in candidate_modules if m in VALID_MODULES]
    
    if selected:
        return list(OrderedDict.fromkeys(selected))
        
    return list(ROLE_DEFAULTS[role]["modules"])


def dedupe_preserve_order(items: Iterable[str]) -> List[str]:
    return list(OrderedDict.fromkeys(i for i in items if i))


MODULE_PHASES = {
    "ingest": 1,
    "forge": 2,
    "certify": 3,
    "decide": 4
}

def get_module_phase(module: str | None) -> int:
    normalized = normalize_module(module)
    if normalized == "all":
        return 1
    return MODULE_PHASES.get(normalized, 1)

def _humanize_artifact_name(artifact_name: str) -> str:
    return str(artifact_name or "").replace("_", " ").strip().title()

def _collect_module_deliverables(module: str, depth: str) -> Dict[str, Any]:
    module_deliverables = MODULE_DELIVERABLES.get(module, {})
    depth_name = normalize_depth(depth)
    capability_names = list(module_deliverables.get(depth_name, module_deliverables.get("standard", [])))
    deliverables = []
    artifacts = []
    for capability in capability_names:
        deliverables.extend(DELIVERABLE_LABELS.get(capability, [_humanize_artifact_name(capability)]))
        for pack in CAPABILITY_PACKS.get(capability, []):
            artifacts.extend(ARTIFACT_PACKS.get(pack, []))
    return {
        "module": module,
        "depth": depth_name,
        "capabilities": capability_names,
        "deliverables": list(OrderedDict.fromkeys(deliverables)),
        "artifacts": list(OrderedDict.fromkeys(artifacts)),
    }

def _collect_required_deliverables(modules: Sequence[str], depth: str) -> Dict[str, Any]:
    ordered_modules = list(OrderedDict.fromkeys(modules or []))
    module_breakdown = []
    deliverables = []
    artifacts = []
    capabilities = []
    for module in ordered_modules:
        breakdown = _collect_module_deliverables(module, depth)
        module_breakdown.append(breakdown)
        capabilities.extend(breakdown["capabilities"])
        deliverables.extend(breakdown["deliverables"])
        artifacts.extend(breakdown["artifacts"])
    return {
        "modules": ordered_modules,
        "module_breakdown": module_breakdown,
        "capabilities": list(OrderedDict.fromkeys(capabilities)),
        "deliverables": list(OrderedDict.fromkeys(deliverables)),
        "artifacts": list(OrderedDict.fromkeys(artifacts)),
    }

def _eligible_agents_for_artifacts(required_artifacts: Sequence[str], selected_modules: Sequence[str], depth: str) -> List[str]:
    min_phase = min([get_module_phase(m) for m in selected_modules]) if selected_modules else 1
    agents = []
    required_set = set(required_artifacts or [])
    for key, config in AGENT_REGISTRY.items():
        if config.get("tier") == "system":
            continue
        agent_phase = config.get("phase", 0)
        if agent_phase > 0 and agent_phase < min_phase and not config.get("cross_phase_allowed", False):
            continue
        agent_module = config.get("module")
        if agent_module not in selected_modules:
            continue
        for p in config.get("produces", []):
            artifact = p.get("artifact") if isinstance(p, dict) else p
            if artifact in required_set:
                agents.append(key)
                break
    return dedupe_preserve_order(agents)

def validate_phase_boundaries():
    """
    Startup validation to ensure each module's expansion surface never pulls
    in lower-phase producers unless explicitly cross-phase enabled.
    """
    errors = []
    for module, module_phase in MODULE_PHASES.items():
        for depth in ("rapid", "standard", "full"):
            agents = build_depth_expansion(depth, [module], module)
            for agent_key in agents:
                config = AGENT_REGISTRY.get(agent_key, {})
                agent_phase = config.get("phase", 0)
                if agent_phase > 0 and agent_phase < module_phase and not config.get("cross_phase_allowed", False):
                    errors.append(
                        f"[{module}:{depth}] Agent '{agent_key}' is phase {agent_phase} but module phase is {module_phase}."
                    )
    if errors:
        raise RuntimeError("Phase boundary validation failed:\n" + "\n".join(errors))

def build_depth_expansion(depth: str, modules: Sequence[str] | None, role: str) -> List[str]:
    if not modules: return []
    depth = depth.lower()
    
    # 1. Resolve capabilities needed for the requested modules and depth
    required_capabilities = set()
    for mod in modules:
        mod_deliverables = MODULE_DELIVERABLES.get(mod, {})
        caps = mod_deliverables.get(depth, mod_deliverables.get("standard", []))
        required_capabilities.update(caps)
        
    # 2. Resolve required artifact packs from capabilities
    required_artifact_packs = set()
    for cap in required_capabilities:
        packs = CAPABILITY_PACKS.get(cap, [])
        required_artifact_packs.update(packs)
        
    # 3. Resolve required artifacts from artifact packs
    required_artifacts = set()
    for pack in required_artifact_packs:
        artifacts = ARTIFACT_PACKS.get(pack, [])
        required_artifacts.update(artifacts)
        
    # 4. Resolve producer agents that produce the required artifacts and enforce Phase Isolation
    min_phase = min([MODULE_PHASES.get(m, 1) for m in modules]) if modules else 1
    
    agents = []
    for key, config in AGENT_REGISTRY.items():
        # Phase Isolation Rule: Phase 2 should never execute Phase 1 producers.
        agent_phase = config.get('phase', 0)
        if agent_phase > 0 and agent_phase < min_phase:
            continue
            
        produces = config.get('produces', [])
        for p in produces:
            artifact = p.get('artifact') if isinstance(p, dict) else p
            if artifact in required_artifacts:
                agents.append(key)
                break
                
    return agents

validate_phase_boundaries()

def _resolve_manifest_coverage(db, source_mission_id: int | None, required_artifacts: Sequence[str]) -> Dict[str, Any]:
    if not db or not source_mission_id:
        return {
            "required_artifacts": list(OrderedDict.fromkeys(required_artifacts or [])),
            "existing_artifacts": [],
            "missing_artifacts": list(OrderedDict.fromkeys(required_artifacts or [])),
            "existing": {},
        }

    from backend.services.mission_service import MissionService

    existing_artifacts = {}
    missing_artifacts = []
    for artifact_type in list(OrderedDict.fromkeys(required_artifacts or [])):
        resolved = MissionService.resolve_artifact(db, source_mission_id, artifact_type)
        if resolved and resolved.get("status") in {"APPROVED", "VALIDATED"}:
            existing_artifacts[artifact_type] = resolved
        else:
            missing_artifacts.append(artifact_type)

    return {
        "required_artifacts": list(OrderedDict.fromkeys(required_artifacts or [])),
        "existing_artifacts": list(existing_artifacts.keys()),
        "missing_artifacts": missing_artifacts,
        "existing": existing_artifacts,
    }

def _resolve_bypass_candidates(db, source_mission_id: int | None, agents: Sequence[str]) -> List[str]:
    if not db or not source_mission_id:
        return []

    from backend.core.artifact_resolver import BypassEvaluator

    bypass_candidates = []
    for agent_key in agents:
        registry = AGENT_REGISTRY.get(agent_key, {})
        try:
            decision = BypassEvaluator.evaluate(db, source_mission_id, agent_key, registry)
            if decision.can_bypass:
                bypass_candidates.append(agent_key)
        except Exception:
            continue
    return dedupe_preserve_order(bypass_candidates)


def _agent_priority(agent_key: str, config: Dict[str, Any]) -> int:
    if agent_key in AGENT_PRIORITY_OVERRIDES:
        return AGENT_PRIORITY_OVERRIDES[agent_key]
    tier = str(config.get("tier") or "").lower()
    phase = int(config.get("phase") or 0)
    priority = {
        "system": 120,
        "rapid": 95,
        "standard": 80,
        "full": 70,
    }.get(tier, 75)
    if phase == 1:
        priority += 5
    elif phase == 2:
        priority += 3
    return priority


def _execution_group_for_agent(agent_key: str) -> str:
    return AGENT_GROUP_INDEX.get(agent_key, agent_key)


def _agent_category(config: Dict[str, Any]) -> str:
    module = str(config.get("module") or "").lower().strip()
    if module == "ingest":
        return "core_foundation"
    if module == "forge":
        return "test_generation"
    if module == "certify":
        return "certify_quality"
    if module == "decide":
        return "delivery_chain"
    if module == "system":
        return "system"
    return "supporting"


def _build_agent_definition(
    agent_key: str,
    config: Dict[str, Any],
    selected_modules: Sequence[str],
    role: str | None,
    depth: str,
    dependency_level: str = "none",
    mandatory: bool = False,
) -> Dict[str, Any]:
    return {
        "id": config.get("id") or agent_key,
        "key": agent_key,
        "label": config.get("label") or agent_key,
        "module": config.get("module"),
        "modules": [config.get("module")] if config.get("module") else [],
        "category": _agent_category(config),
        "priority": _agent_priority(agent_key, config),
        "mandatory": mandatory,
        "dependency_level": dependency_level,
        "execution_group": _execution_group_for_agent(agent_key),
        "phase": config.get("phase", 0),
        "tier": config.get("tier"),
        "selected_modules": list(OrderedDict.fromkeys(selected_modules or [])),
        "role": normalize_role(role),
        "depth": normalize_depth(depth),
    }


def _dependency_producers_index() -> Dict[str, List[str]]:
    index: Dict[str, List[str]] = {}
    for agent_key, config in AGENT_REGISTRY.items():
        for produced in config.get("produces", []):
            artifact = produced.get("artifact") if isinstance(produced, dict) else produced
            if not artifact:
                continue
            index.setdefault(str(artifact), []).append(agent_key)
    return index


def _expand_dependency_closure(seed_agents: Sequence[str]) -> List[str]:
    producers_by_artifact = _dependency_producers_index()
    closure = list(OrderedDict.fromkeys(seed_agents or []))
    queued = list(closure)
    seen = set(closure)

    while queued:
        agent_key = queued.pop(0)
        config = AGENT_REGISTRY.get(agent_key, {})
        for consumed in config.get("consumes", []):
            for producer in producers_by_artifact.get(str(consumed), []):
                if producer in seen:
                    continue
                seen.add(producer)
                closure.append(producer)
                queued.append(producer)
    return closure


def _expand_groups(seed_agents: Sequence[str]) -> tuple[List[str], Dict[str, List[str]]]:
    grouped: Dict[str, List[str]] = {}
    seed_set = set(seed_agents or [])

    for agent_key in seed_set:
        group_name = _execution_group_for_agent(agent_key)
        grouped.setdefault(group_name, [])
        if agent_key not in grouped[group_name]:
            grouped[group_name].append(agent_key)

    for group_name, members in EXECUTION_GROUPS.items():
        if any(member in seed_set for member in members):
            grouped.setdefault(group_name, [])
            for member in members:
                if member not in grouped[group_name]:
                    grouped[group_name].append(member)

    expanded = []
    for group_name, members in grouped.items():
        ordered_members = dedupe_preserve_order([*members, *EXECUTION_GROUPS.get(group_name, [])])
        expanded.extend(ordered_members)
    return dedupe_preserve_order(expanded), grouped


def _score_agent(
    agent_key: str,
    config: Dict[str, Any],
    selected_modules: Sequence[str],
    dependency_set: Sequence[str],
    group_set: Sequence[str],
    seed_set: Sequence[str],
) -> int:
    score = _agent_priority(agent_key, config)
    if agent_key in seed_set:
        score += 20
    if agent_key in dependency_set:
        score += 25
    if agent_key in group_set:
        score += 10
    module = str(config.get("module") or "").lower().strip()
    if module and module in set(selected_modules or []):
        score += 15
    if agent_key in CORE_AGENTS:
        score += 30
    return score


def resolve_execution_surface(
    role: str | None,
    modules: Sequence[str] | None,
    depth: str | None,
    db=None,
    source_mission_id: int | None = None,
    restored_surface: Dict[str, Any] | None = None,
    include_system_agents: bool = True,
) -> Dict[str, Any]:
    normalized_role = normalize_role(role)
    selected_modules = normalize_modules(modules, fallback_role=normalized_role)
    allowed_modules = list(VALID_MODULES)
    depth_name = normalize_depth(depth)
    budget = DEPTH_BUDGETS.get(depth_name, DEPTH_BUDGETS["standard"])

    if isinstance(restored_surface, dict) and restored_surface.get("final_agents"):
        restored = dict(restored_surface)
        restored_modules = restored.get("selected_modules", [])
        
        # If the modules, depth, or role have changed (e.g., advancing from Phase 1 'ingest' to Phase 2 'forge'),
        # we MUST compute a new surface so the new agents (and their linked dependencies) are added.
        if set(restored_modules) == set(selected_modules) and restored.get("depth") == depth_name and restored.get("role") == normalized_role:
            final_agents = dedupe_preserve_order(restored.get("final_agents", []))
            configured_agents = dedupe_preserve_order(restored.get("configured_agents", final_agents))
            dependency_expansion = dedupe_preserve_order(restored.get("dependency_expansion", []))
            execution_groups = restored.get("execution_groups", [])
            active_agent_map = restored.get("active_agents", {
                key: ("auto" if key in final_agents else "bypass")
                for key in ALL_MISSION_AGENT_KEYS
            })
            telemetry = dict(restored.get("telemetry", {}))
            telemetry.setdefault("budget", budget)
            telemetry.setdefault("selected", len(final_agents))
            telemetry.setdefault("dependency_added", len(dependency_expansion))
            telemetry.setdefault("group_added", 0)
            telemetry.setdefault("bypassed", max(len(configured_agents) - len(final_agents), 0))
            return {
                **restored,
                "role": normalized_role,
                "allowed_modules": allowed_modules,
                "selected_modules": selected_modules,
                "depth": depth_name,
                "budget": budget,
                "configured_agents": configured_agents,
                "eligible_agents": final_agents,
                "final_agents": final_agents,
                "active_agents": active_agent_map,
                "dependency_expansion": dependency_expansion,
                "execution_groups": execution_groups,
                "bypass_candidates": dedupe_preserve_order(restored.get("bypass_candidates", [])),
                "telemetry": telemetry,
            }

    deliverable_plan = _collect_required_deliverables(selected_modules, depth_name)
    required_artifacts = deliverable_plan["artifacts"]

    system_agents = []
    if include_system_agents:
        for key, config in AGENT_REGISTRY.items():
            if config.get("tier") == "system":
                system_agents.append(key)

    module_agents = build_depth_expansion(depth_name, selected_modules, normalized_role)
    core_agents = list(CORE_AGENTS)
    seed_agents = dedupe_preserve_order([*core_agents, *module_agents, *system_agents])
    dependency_expansion = _expand_dependency_closure(seed_agents)
    group_expansion, grouped_candidates = _expand_groups([*seed_agents, *dependency_expansion])
    combined_agents = dedupe_preserve_order([*seed_agents, *dependency_expansion, *group_expansion])

    mandatory_agents = set(core_agents) | set(system_agents)
    dependency_set = set(dependency_expansion)
    group_set = set(group_expansion)

    group_members: Dict[str, List[str]] = {}
    for agent_key in combined_agents:
        group_name = _execution_group_for_agent(agent_key)
        group_members.setdefault(group_name, [])
        if agent_key not in group_members[group_name]:
            group_members[group_name].append(agent_key)

    group_scores = {}
    for group_name, members in group_members.items():
        member_scores = [
            _score_agent(
                member,
                AGENT_REGISTRY.get(member, {}),
                selected_modules,
                dependency_set,
                group_set,
                seed_agents,
            )
            for member in members
        ]
        mandatory_group = any(member in mandatory_agents for member in members)
        group_scores[group_name] = {
            "score": max(member_scores) if member_scores else 0,
            "mandatory": mandatory_group,
            "size": len(members),
            "members": dedupe_preserve_order(members),
        }

    ranked_groups = sorted(
        group_scores.items(),
        key=lambda item: (-int(item[1]["mandatory"]), -int(item[1]["score"]), item[0]),
    )

    final_agents: List[str] = []
    active_groups: List[Dict[str, Any]] = []
    selected_count = 0
    for group_name, group_info in ranked_groups:
        members = group_info["members"]
        if not members:
            continue
        if selected_count + len(members) > budget and not group_info["mandatory"]:
            continue
        final_agents.extend(members)
        active_groups.append({
            "group": group_name,
            "members": members,
            "score": group_info["score"],
            "mandatory": group_info["mandatory"],
        })
        selected_count += len(members)

    final_agents = dedupe_preserve_order([*core_agents, *final_agents])
    if include_system_agents:
        final_agents = dedupe_preserve_order([*final_agents, *system_agents])

    dependency_added = [agent for agent in dependency_expansion if agent not in seed_agents]
    group_added = [agent for agent in group_expansion if agent not in [*seed_agents, *dependency_expansion]]

    agent_definitions = [
        _build_agent_definition(
            agent_key=agent_key,
            config=AGENT_REGISTRY.get(agent_key, {}),
            selected_modules=selected_modules,
            role=normalized_role,
            depth=depth_name,
            dependency_level=(
                "core" if agent_key in core_agents else
                "dependency" if agent_key in dependency_expansion else
                "group" if agent_key in group_expansion else
                "seed"
            ),
            mandatory=agent_key in mandatory_agents,
        )
        for agent_key in final_agents
    ]

    active_agent_map = {
        key: ("auto" if key in final_agents else "bypass")
        for key in ALL_MISSION_AGENT_KEYS
    }

    telemetry = {
        "budget": budget,
        "selected": len(final_agents),
        "dependency_added": len(dependency_added),
        "group_added": len(group_added),
        "bypassed": max(len(combined_agents) - len(final_agents), 0),
    }

    counts = {
        "core": len([a for a in final_agents if a in core_agents]),
        "supporting": len([a for a in final_agents if a not in core_agents and a not in system_agents]),
        "dependencies": len(dependency_added),
        "system": len(system_agents),
        "final": len(final_agents),
        **telemetry,
    }

    coverage = _resolve_manifest_coverage(db, source_mission_id, required_artifacts)
    bypass_candidates = _resolve_bypass_candidates(db, source_mission_id, final_agents) if db and source_mission_id else [agent for agent in combined_agents if agent not in final_agents]
    telemetry["bypassed"] = len(bypass_candidates) if bypass_candidates else telemetry["bypassed"]
    counts["bypassed"] = telemetry["bypassed"]
    counts["executed"] = max(len(final_agents) - len(bypass_candidates), 0) if bypass_candidates else len(final_agents)

    return {
        "role": normalized_role,
        "allowed_modules": allowed_modules,
        "selected_modules": selected_modules,
        "depth": depth_name,
        "budget": budget,
        "deliverables": deliverable_plan["deliverables"],
        "deliverables_by_module": deliverable_plan["module_breakdown"],
        "artifacts": required_artifacts,
        "artifact_coverage": {
            "required": len(required_artifacts),
            "existing": len(coverage["existing_artifacts"]),
            "missing": len(coverage["missing_artifacts"]),
            "required_artifacts": coverage["required_artifacts"],
            "existing_artifacts": coverage["existing_artifacts"],
            "missing_artifacts": coverage["missing_artifacts"],
        },
        "configured_agents": dedupe_preserve_order([*combined_agents]),
        "eligible_agents": final_agents,
        "bypass_candidates": bypass_candidates,
        "system_agents": system_agents,
        "core_agents": core_agents,
        "dependency_expansion": dependency_added,
        "execution_groups": active_groups,
        "agent_definitions": agent_definitions,
        "final_agents": final_agents,
        "active_agents": active_agent_map,
        "telemetry": telemetry,
        "metrics": telemetry,
        "counts": counts,
    }

def build_mission_manifest(
    role: str | None,
    modules: Sequence[str] | None,
    depth: str | None,
    db=None,
    source_mission_id: int | None = None,
    include_system_agents: bool = True,
    restored_surface: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    surface = resolve_execution_surface(
        role=role,
        modules=modules,
        depth=depth,
        db=db,
        source_mission_id=source_mission_id,
        include_system_agents=include_system_agents,
        restored_surface=restored_surface,
    )
    return surface

def build_mission_profile(
    role: str | None,
    modules: Sequence[str] | None,
    depth: str | None,
    include_system_agents: bool = True,
    restored_surface: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    manifest = build_mission_manifest(role, modules, depth, include_system_agents=include_system_agents, restored_surface=restored_surface)
    import logging
    logger = logging.getLogger(__name__)
    logger.info({
        "depth": manifest["depth"],
        "final_agents": manifest["final_agents"],
        "count": len(manifest["final_agents"])
    })
    return {
        **manifest,
        "resolved_surface": manifest,
        "core_agents": manifest.get("core_agents", []),
        "depth_agents": manifest.get("configured_agents", []),
        "supporting_agents": [agent for agent in manifest.get("final_agents", []) if agent not in set(manifest.get("core_agents", []))],
        "dependency_agents": manifest.get("dependency_expansion", []),
    }


def get_allowed_modules(role: str | None) -> List[str]:
    return list(VALID_MODULES)

def get_role_defaults(role: str | None) -> Dict[str, Any]:
    normalized = normalize_role(role)
    return ROLE_DEFAULTS.get(normalized, ROLE_DEFAULTS["qa"])
