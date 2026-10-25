"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - SHARED WORKFLOW STATE
================================================================================
Architecture: Typed Graph Memory with Persistent Side-Channel Logging.

This module defines the schema for the 'Short-Term Memory' (AgentState) 
passed between LangGraph nodes and provide the real-time 'Thought Bubble' 
persistent logging system used by the UI Reasoning Console.
"""

import datetime
import logging
from typing import TypedDict, List, Dict, Any, Annotated
import threading
from sqlalchemy.orm.attributes import flag_modified

from backend.core.database import SessionLocal, GenerationTask

logger = logging.getLogger(__name__)


def _merge_list(left, right):
    merged = []
    seen = set()
    for group in (left or [], right or []):
        for item in group or []:
            token = repr(item)
            if token in seen:
                continue
            seen.add(token)
            merged.append(item)
    return merged


def _merge_dict(left, right):
    merged = {}
    if isinstance(left, dict):
        merged.update(left)
    if isinstance(right, dict):
        merged.update(right)
    return merged

class CoreState(TypedDict):
    """Base Orchestration and Telemetry State"""
    
    schema_version: int         # Track schema version for cache invalidation
    pipeline_version: str       # Which pipeline version (e.g. SDD-v2.0)
    task_id: str                # Global unique ID used for persistent logging and UI polling.
    mission_id: int             # Phase-agnostic ID tying node executions back to the parent mission.
    mission_intent: str         # The execution phase target (PHASE_1 or PHASE_2).
    active_agents: Dict[str, bool] # Global Mesh Activation Status Map.
    sources: List[Any]          # List of ALM source objects from the user's request.
    additional_context: str     # Raw string of manual instructions/overrides from the UI.
    llm_apiKey: str             # [DEPRECATED] API keys are now pulled by the Inference Mesh.
    iteration_count: int        # Loop counter to track planning cycles (max 3).
    logic_audit_feedback: str   # Collective critique from the Critic node during loops.
    feedback: str               # Direct feedback from previous reasoning loops.
    is_valid: bool              # Termination flag (True when Critic approves the plan).
    error: str                  # Diagnostic error string used for graph termination on failure.
    partial_state: dict         # LIVE TELEMETRY: Incremental snapshot written after each node.
    execution_readiness: dict   # Computed tool readiness snapshot for this mission.
    execution_mode: str         # The scope of execution (analysis, validation, full_execution).
    depth: str                  # Reasoning depth (standard, deep, surgical).
    role: str                   # Stakeholder persona (qa_engineer, sdet, manager, ciso).
    use_node_cache: bool        # Flag to enable/disable result caching for cost efficiency.
    metadata: Annotated[Dict[str, Any], _merge_dict]    # Catch-all for telemetry and sovereign tracing.
    origin_mission: str         # Original mission pointer for re-runs.
    Sovereign_Mission_ID: str  # Note: Pythonic naming to avoid key-error on dash
    ANT_Protocol: str
    
    # SDD Pipeline Pillar 1A / 1B State
    open_questions: Annotated[List[Dict], _merge_list]
    clarification_approved: bool
    unified_context_contract: Annotated[Dict, _merge_dict]
    target_tech_stack: Annotated[Dict, _merge_dict]
    risk_advisory_report: Annotated[Dict, _merge_dict]

    # SDD Pipeline Pillar 2 State (Artifact Factory)
    system_specification: Annotated[Dict, _merge_dict]
    tasks: Annotated[List[Dict], _merge_list]
    tdd_contracts: Annotated[Dict, _merge_dict]
    handoff_bundle_path: str
    bundle_manifest: Annotated[Dict, _merge_dict]
    hitl_2_approved: bool

class PlanState(TypedDict):
    """Implementation Plan + Approval Gate (Phase 3)"""
    plan_json: Annotated[Dict, _merge_dict]
    file_hashes: Annotated[Dict, _merge_dict]
    open_questions: Annotated[List[Dict], _merge_list]
    approval: Annotated[Dict, _merge_dict]
    plan_approved: bool

class ForgeState(TypedDict):
    """Generative Artifacts (Test Cases, Mocks, Scripts)"""
    execution_context: Annotated[Dict, _merge_dict]     # The user-provided execution URLs and configuration.
    test_cases: Annotated[List[Dict], _merge_list]      # Atomic execution scenarios Agent #6.
    test_data_samples: Annotated[List[Dict], _merge_list] # Synthetic, PII-compliant test data Agent #7.
    mock_specs: Annotated[List[Dict], _merge_list]      # API Virtualization & Mocks Agent #8.
    automation_bootstrap: Annotated[Dict, _merge_dict]  # Framework scaffold/config Agent #10.
    api_test_code: Annotated[List[Dict], _merge_list]   # Executable API scripts Agent #11.
    api_validation_config: Dict       # API boundary contracts & dependency graph Agent #12.
    suite_optimization_config: Dict   # Pruned suite, parallel groups, time savings Agent #38.
    event_driven_config: Dict         # Kafka/SQS/RabbitMQ async queue tests Agent #31.
    api_spec: Dict
    # execution_context: consolidated to line 63 with _merge_dict annotation.

class AuditState(TypedDict):
    """Compliance, Risk, and Security Audits"""
    ingestor_quality_audit: Annotated[Dict, _merge_dict] # Extraction metrics and quality gates from the Ingestor.
    traceability_matrix: Annotated[List[Dict], _merge_list] # Bidirectional mapping (Requirement <-> Test Case) Agent #9.
    traceability_audit: Annotated[Dict, _merge_dict]      # Derived audit lineage and workflow-to-test coverage Agent #9.
    compliance_report: Annotated[Dict, _merge_dict]     # Regulatory controls and audit requirements Agent #21.
    nfr_clearance_report: Annotated[Dict, _merge_dict]  # Security, Accessibility, Performance Gates (GREEN or RED only)
    lifecycle_audit: Annotated[Dict, _merge_dict]       # Derived lifecycle states, transitions, and dependency chains Agent #4.
    logic_audit_report: Annotated[Dict, _merge_dict]     # Semantic contradiction audit Agent #20.
    cryptographic_passport: Annotated[Dict, _merge_dict] # Immutable Cryptographic Passport Agent.
    security_signals: Annotated[List[Dict], _merge_list] # ASPM+ security vulnerabilities and threat models Agent #18.
    microservices_config: Annotated[Dict, _merge_dict]   # Service-to-service logic, sidecars, and mesh compliance Agent #30.
    feature_flag_tests: Annotated[List[Dict], _merge_list] # Feature flag logic and experimentation validation Agent #34.
    sla_slo_audit: Annotated[Dict, _merge_dict]          # SRE error budget and SLO compliance auditing Agent #40.
    compliance_remediation_config: Dict # Auto-remediated PCI/GDPR/HIPAA findings Agent #27.
    release_risk_decision: Annotated[Dict, _merge_dict]        # Release Risk & Decision Agent #50
    compliance_remediation: Dict
    risk_signals: Annotated[Dict, _merge_dict]          # Empirical signals (Bug counts, repo churn) mined from ALM.
    restored_compliance: Annotated[Dict, _merge_dict]
    restored_risks: Annotated[Dict, _merge_dict]

class DeliveryState(TypedDict):
    """Performance, Resiliency, and Environment Configs"""
    performance_config: Annotated[Dict, _merge_dict]     # Performance targets, load profiles, and NFRs Agent #17.
    chaos_scenarios: Annotated[List[Dict], _merge_list]  # Failure injection and resilience validation Agent #26.
    mobile_test_config: Annotated[Dict, _merge_dict]     # Appium/Espresso mobile test intelligence Agent #28.
    graphql_validation: Annotated[Dict, _merge_dict]     # GraphQL schema introspection and query testing Agent #32.
    production_monitors: Annotated[Dict, _merge_dict]    # Shift-right observability and real-user monitoring Agent #25.
    distributed_traces: Annotated[Dict, _merge_dict]     # Correlation ID and span coverage validation Agent #41.
    reliability_config: Annotated[Dict, _merge_dict]     # Flaky test detection and autonomous remediation Agent #44 (legacy key).
    reliability_eng: Annotated[Dict, _merge_dict]        # Flaky test detection and autonomous remediation Agent #44 (current key).
    cross_browser_config: Dict        # Browser matrix and DOM divergence map Agent #29.
    database_pipeline_config: Dict    # ETL checkpoints, DB scenarios, latency SLOs Agent #33.
    digital_twin_config: Dict         # Production mirror config and shadow plan Agent #42.
    ux_intelligence_config: Dict      # UX heuristics, TTI, CLS, LCP targets Agent #35.
    env_consistency_config: Dict      # Env drift findings and remediation playbook Agent #37.
    devops_manifests: Annotated[Dict, _merge_dict]       # Phase 4 Dockerfile, devcontainer, github_actions_ci
    vv_passport: Annotated[Dict, _merge_dict]            # Phase 5 Cryptographic passport / blocked state
    perf_intelligence_config: Annotated[Dict, _merge_dict]     # Performance Intelligence Agent #45
    env_report: Dict
    ux_report: Dict
    perf_intel: Dict

class IntelligenceState(TypedDict):
    """Synthesis, Reporting, and Meta-Learning"""
    raw_requirements: Annotated[List[Dict], _merge_list] # Normalized list of individual platform requirement nodes.
    clarified_requirements: Annotated[List[Dict], _merge_list] # Refinement layer from AI Clarifier Agent (#3).
    combined_data: Annotated[Dict, _merge_dict]         # The single synthesized Requirement baseline used by the AI nodes.
    requirement_graph: Annotated[Dict, _merge_dict]     # The canonical structured graph representing the PRD.
    analysis_payload: Annotated[Dict, _merge_dict]      # The 'Blueprint' (Current state of the AI's complex JSON plan).
    mesh_topology: Annotated[Dict, _merge_dict]         # Real-time state tracker Agent #4.
    visual_checkpoints: Annotated[List[Dict], _merge_list] # UI Visual Regression Agents #39.
    self_healing_config: Annotated[Dict, _merge_dict]    # Resilience and adaptive locator strategy Agent #43.
    strategy_blueprint: Annotated[Dict, _merge_dict]     # Testing pyramid, tool selection, and approach Agent #2.
    regression_priority: Annotated[Dict, _merge_dict]    # AI-driven change-impact prioritization Agent #14.
    execution_plan: Annotated[Dict, _merge_dict]         # Parallel run orchestration and distribution Agent #15.
    environment_config: Annotated[Dict, _merge_dict]     # Dynamic env provisioning and container specs Agent #16.
    progressive_delivery: Annotated[Dict, _merge_dict]   # Canary/Blue-Green quality gate definitions Agent #23.
    # === NEW: Phase 1 Discovery State Keys ===
    validation_metrics: Annotated[Dict, _merge_dict]     # output of validate_ingestion
    capabilities: Annotated[Dict, _merge_dict]           # output of repository_intelligence
    threat_areas: Annotated[Dict, _merge_dict]           # output of tech_stack_analysis
    repo_intelligence_context: str
    tech_stack_advisory: Annotated[Dict, _merge_dict]
    threat_model_advisories: Annotated[Dict, _merge_dict]
    
    # === NEW: Phase 2 Architecture State Keys ===
    api_design_spec: Annotated[Dict, _merge_dict]     # {"type": "openapi" | "graphql", "spec": dict | str}
    db_schema_design: Annotated[Dict, _merge_dict]    # {"type": "mermaid_erd" | "sql_ddl", "content": str}
    visual_architecture: str                          # Pure Mermaid.js string (C4)
    requirement_clarity_report: Annotated[Dict, _merge_dict]
    module_boundary_map: Annotated[Dict, _merge_dict]
    traceability_matrix_p2: Annotated[Dict, _merge_dict]
    integration_dependency_map: Annotated[Dict, _merge_dict]
    mcp_recommendations: Annotated[Dict, _merge_dict]
    performance_budget: Annotated[Dict, _merge_dict]
    security_constraints: Annotated[Dict, _merge_dict]
    compliance_requirements: Annotated[Dict, _merge_dict]
    hook_guardrail_recommendations: Annotated[Dict, _merge_dict]
    logician_summary: Annotated[Dict, _merge_dict]
    
    # === NEW: Phase 3 Forge State Keys ===
    engineering_contract: Annotated[Dict, _merge_dict]
    contract_approved: bool
    frontend_forge_code: Annotated[List[Dict], _merge_list]
    backend_forge_code: Annotated[List[Dict], _merge_list]
    forge_errors: Annotated[List[str], _merge_list]
    
    # === NEW: 10-Agent Extension Pack State Keys ===
    test_impact_config: Dict          # PR blast radius and impacted module map Agent #13.
    # === NEW: TIER 2 & TIER 3 EXPANSION PACK (Agents 45-59) ===
    observability_intelligence: Annotated[Dict, _merge_dict]   # Observability & Quality Agent #46
    rca_intelligence: Annotated[Dict, _merge_dict]             # Autonomous RCA Agent #47
    incident_remediation: Annotated[Dict, _merge_dict]         # Incident Intelligence Agent #48
    system_resilience: Annotated[Dict, _merge_dict]            # System Resilience Intelligence Agent #49
    business_impact_intelligence: Annotated[Dict, _merge_dict] # Business Impact Intelligence Agent #51
    eng_economics_roi: Annotated[Dict, _merge_dict]            # Economics & ROI Intelligence Agent #52
    eng_knowledge_graph: Annotated[Dict, _merge_dict]          # Engineering Knowledge Graph Agent #53
    platform_meta_intelligence: Annotated[Dict, _merge_dict]   # Platform Learning & Meta Intel Agent #54
    exploratory_test_assistant: Annotated[Dict, _merge_dict]   # Exploratory Testing Assistant Agent #55
    locator_intelligence: Annotated[Dict, _merge_dict]         # Locator Intelligence Assistant Agent #56
    auto_migration_assistant: Annotated[Dict, _merge_dict]     # Automation Migration Assistant Agent #57
    mutation_test_assistant: Annotated[Dict, _merge_dict]      # Mutation Testing Assistant Agent #58
    i18n_test_assistant: Annotated[Dict, _merge_dict]          # Internationalization Testing Assistant Agent #59
    final_synthesis: Annotated[Dict, _merge_dict]        # Consolidated Mesh Output Agent #5.
    impact_report: Dict
    pipeline_report: Dict
    twin_report: Dict
    event_report: Dict
    business_impact: Dict
    release_decision: Dict
    roi_report: Dict
    knowledge_graph: Dict
    meta_intel_report: Dict
    exploratory_report: Dict
    locator_strategy: Dict
    migration_report: Dict
    mutation_report: Dict
    i18n_report: Dict
    resilience_report: Dict
    incident_report: Dict
    observability_report: Dict
    rca_report: Dict
    api_validation_report: Dict
    optimized_suite: Dict
    factory_output: Dict
    critic_report: Dict
    release_package: Dict
    trend_report: Dict
    final_document: Dict
    output_filename: str        # Final system name for the generated DOCX.
    download_url: str           # Public-facing URL used by the frontend to trigger file download.
    markdown_preview: str       # GFM Markdown string representing the plan (for UI render).
    mesh_confidence: float      # Aggregated confidence score from reasoning nodes (0.0-1.0).
    refactoring_suggestions: Dict
    iac_artifacts: Dict
    provision_report: Dict
    PLANNER_CONTEXT_AUDIT: Dict
    CONTRACT_ENFORCEMENT_AUDIT: Dict
    # === NEW: GRAPH ORCHESTRATION METADATA (V5.6) ===
    # === NEW: RESILIENCE FIELDS (V5.6.1) ===
    # === NEW: RESTORATION FIELDS (Phase Handshake) ===
    restored_raw: Annotated[List[Dict], _merge_list]
    restored_clarified: Annotated[List[Dict], _merge_list]
    restored_combined: Annotated[Dict, _merge_dict]
    restored_analysis: Annotated[Dict, _merge_dict]
    restored_rtm: Annotated[List[Dict], _merge_list]
    restored_markdown: str

class AgentState(CoreState, PlanState, ForgeState, AuditState, DeliveryState, IntelligenceState):
    """
    ARCHITECTURE: WORKFLOW STATE DEFINITION (Short-Term Memory)
    Refactored using Type Composition to prevent schema bloat (Task 0.3).
    """
    pass

import operator

class Phase1State(TypedDict):
    # Inputs
    prd_input: str
    mission_id: str
    task_id: str
    
    # Phase 1A outputs
    repo_intelligence_context: str
    capabilities: List[Dict]
    compliance_flags: List[str]
    threat_areas: List[str]
    missing_information: List[str]
    detected_domain: str
    quality_score: float
    ingestion_metrics: Dict
    ingestion_quality_warning: bool
    open_questions: Annotated[List[Dict], operator.add]
    unified_context_contract: Annotated[Dict, _merge_dict]
    target_tech_stack: Annotated[Dict, _merge_dict]
    clarification_approved: bool
    
    # Phase 1B outputs
    risk_advisory_report: Annotated[Dict, _merge_dict]
    
    # Gate flags
    hitl_1_approved: bool
    
    # Pipeline metadata
    schema_version: int
    pipeline_version: str

class Phase2State(TypedDict):
    # Inputs (must match Phase 1 contract exactly)
    unified_context_contract: Dict
    risk_advisory_report: Dict
    capabilities: List[Dict]
    target_tech_stack: Dict
    open_questions: List[Dict]
    missing_information: List  # From Phase 1 handoff
    
    # Mission Info
    mission_id: str
    task_id: str     # Phase 1 task UUID — needed so log_step writes to the correct DB row
    
    # Phase 2 outputs
    system_specification: Annotated[Dict, _merge_dict]
    api_design_spec: Annotated[Dict, _merge_dict]
    db_schema_design: Annotated[Dict, _merge_dict]
    tasks: Annotated[List[Dict], _merge_list]
    engineering_tasks: Annotated[List[Dict], _merge_list]
    tdd_contracts: Annotated[Dict, _merge_dict]  # FIX: dict not list — keyed by task_id
    acceptance_criteria: Annotated[List[str], _merge_list]
    coverage_targets: Annotated[Dict, _merge_dict]
    handoff_bundle_path: str
    engineering_contract: Annotated[Dict, _merge_dict]
    phase2_valid: bool

    # NEW: Phase 2 Architecture-Gate agent outputs (#03, #05, #09, #12, #17, #18, #21)
    requirement_clarity_report: Annotated[Dict, _merge_dict]   # #03 Requirement Clarifier (architecture pass)
    module_boundary_map: Annotated[Dict, _merge_dict]          # #05 Synthesis Optimizer (module boundary graph)
    traceability_matrix_p2: Annotated[Dict, _merge_dict]       # #09 Traceability Auditor (design-time coverage)
    integration_dependency_map: Annotated[Dict, _merge_dict]   # #12 API Validation & Dependency
    mcp_recommendations: Annotated[Dict, _merge_dict]          # MCP Advisor Agent
    performance_budget: Annotated[Dict, _merge_dict]           # #13 Performance Architect
    security_constraints: Annotated[Dict, _merge_dict]         # #14 Security Intelligence
    compliance_requirements: Annotated[Dict, _merge_dict]      # #21 Compliance Governor (regulatory findings)
    hook_guardrail_recommendations: Annotated[Dict, _merge_dict] # Hook Guardrails Advisor
    logician_summary: Annotated[Dict, _merge_dict]             # Logician Fan-out Summary

    # Gate flags
    hitl_2_approved: bool

class Phase3State(TypedDict):
    # Inputs (from Phase 2 output)
    system_specification: Dict
    api_design_spec: Dict
    db_schema_design: Dict
    tasks: List[Dict]
    tdd_contracts: Dict
    handoff_bundle_path: str
    engineering_contract: Dict
    plan_json: Dict
    
    # Mission Info
    mission_id: str
    task_id: str
    failed_modules: List[str]
    
    # Phase 3 outputs
    tdd_execution_report: Annotated[Dict, _merge_dict]
    generated_code_paths: Annotated[List[str], operator.add]
    all_tests_green: bool
    
    # Node outputs
    backend_forge_code: str
    database_forge_code: str
    automation_forge_code: str
    api_coder_code: str
    migration_code: str
    frontend_forge_code: str
    env_ops_code: str
    module_forge_code: Annotated[List[Dict], operator.add]

class Phase4State(TypedDict):
    # Inputs from Phase 3
    generated_code_paths: List[str]
    module_forge_code: List[Dict]
    api_design_spec: Dict
    risk_advisory_report: Dict
    tdd_execution_report: Dict
    
    # Mission Info
    mission_id: str
    task_id: str
    retry_count: int
    
    # Per-domain audit results
    security_results: Annotated[List[Dict], operator.add]
    performance_results: Annotated[List[Dict], operator.add]
    accessibility_results: Annotated[List[Dict], operator.add]
    reliability_results: Annotated[List[Dict], operator.add]
    compliance_results: Annotated[List[Dict], operator.add]
    
    # Aggregated output
    nfr_clearance_report: Annotated[Dict, _merge_dict]
    all_nfr_green: bool

class Phase5State(TypedDict):
    # Loaded from Phase 1 DB output
    unified_context_contract: Dict
    risk_advisory_report: Dict
    capabilities: List[Dict]
    open_questions: List[Dict]
    
    # Loaded from Phase 2 DB output
    engineering_contract: Dict
    tasks: List[Dict]
    api_design_spec: Dict
    system_specification: Dict
    
    # Loaded from Phase 3 DB output
    tdd_execution_report: Dict
    generated_code_paths: List[str]
    
    # Loaded from Phase 4 DB output
    nfr_clearance_report: Dict
    
    mission_id: str
    task_id: str
    
    # Phase 5 outputs
    readiness_report: Annotated[Dict, _merge_dict]
    vv_passport: Annotated[Dict, _merge_dict]
    mission_archive: Annotated[Dict, _merge_dict]

from enum import IntEnum

class LogLevel(IntEnum):
    CRITICAL = 0
    ERROR = 1
    WARN = 2
    INFO = 3
    DEBUG = 4
    TRACE = 5

# Global Visibility Threshold (Configurable via ENV)
import os
SYSTEM_LOG_LEVEL = int(os.getenv("VVNT_LOG_LEVEL", 3))

def _get_list_like_keys():
    """Identify keys that should use list aggregation"""
    return [
        "raw_requirements", "sources", "restored_raw",
        "acceptance_criteria", "test_cases", "test_scenarios",
        "bdd_scenarios", "flaws", "refactoring_recommendations",
        "open_questions", "tasks"
    ]

def _get_dict_like_keys():
    return [
        "combined_data", "analysis_payload", "risk_signals", "bypass_evaluations",
        "bypass_evaluation",        "unified_context_contract",
        "target_tech_stack",
        "risk_advisory_report",
        "system_specification", "tdd_contracts", "bundle_manifest"
    ]

def write_partial_state(task_id: str, state_delta: dict):
    """
    ARCHITECTURE: INCREMENTAL TELEMETRY FLUSH (Live Telemetry Side-Channel)
    
    PURPOSE:
    Writes a partial snapshot of the current mesh state to the DB after each
    node completes. This allows the frontend to display live telemetry in the
    Agent Workspace panels during execution — not just after completion.
    
    STRATEGY V2 — WRITE COALESCING:
    Rather than hitting the DB on every single node completion (59 writes in
    Phase 2), deltas are accumulated in an in-memory buffer per task_id and
    flushed to the DB at most once every FLUSH_INTERVAL_SECONDS. This reduces
    DB contention by ~80% while keeping live telemetry latency under 3 seconds.
    
    SECURITY: Sources, tokens, and config objects are never written.
    """
    if not task_id: return
    
    FORBIDDEN_KEYS = {"sources", "config", "token", "auth", "session", "llm_apiKey"}
    FLUSH_INTERVAL_SECONDS = 3.0
    
    import time
    
    try:
        safe_delta = {k: v for k, v in state_delta.items() if k not in FORBIDDEN_KEYS and v is not None}
        if not safe_delta:
            return
        
        # ── IN-MEMORY BUFFER ─────────────────────────────────────────────────────
        if not hasattr(write_partial_state, "_buffer"):
            write_partial_state._buffer: dict = {}
            write_partial_state._last_flush: dict = {}
            write_partial_state._timers: dict = {}
            write_partial_state._lock = threading.Lock()
            
        lock = write_partial_state._lock
        
        def _db_flush(tid):
            with lock:
                delta = write_partial_state._buffer.pop(tid, {})
                write_partial_state._last_flush[tid] = time.monotonic()
                if tid in write_partial_state._timers:
                    del write_partial_state._timers[tid]
            if not delta: return
            try:
                with SessionLocal() as db:
                    task = db.query(GenerationTask).filter(GenerationTask.task_id == tid).first()
                    if task:
                        current = dict(task.partial_state or {})
                        current.update(delta)
                        task.partial_state = current
                        flag_modified(task, "partial_state")
                        db.commit()
            except Exception as e:
                logger.error(f"[PARTIAL-STATE-FAIL] Timer flush failed: {e}")

        with lock:
            buf = write_partial_state._buffer
            last = write_partial_state._last_flush
            timers = write_partial_state._timers
            
            if task_id not in buf:
                buf[task_id] = {}
            buf[task_id].update(safe_delta)
            
            now = time.monotonic()
            elapsed = now - last.get(task_id, 0.0)
            
            if elapsed < FLUSH_INTERVAL_SECONDS:
                if task_id not in timers:
                    t = threading.Timer(FLUSH_INTERVAL_SECONDS - elapsed, _db_flush, args=(task_id,))
                    timers[task_id] = t
                    t.start()
                return
                
            flush_delta = buf.pop(task_id, {})
            last[task_id] = now
            if task_id in timers:
                timers[task_id].cancel()
                del timers[task_id]
        
        if not flush_delta:
            return
            
        try:
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    current = dict(task.partial_state or {})
                    current.update(flush_delta)
                    task.partial_state = current
                    flag_modified(task, "partial_state")
                    db.commit()
        except Exception as e:
            logger.error(f"[PARTIAL-STATE-FAIL] Incremental telemetry write failed: {e}")
    except Exception as e:
        logger.error(f"[PARTIAL-STATE-FAIL] Incremental telemetry write failed: {e}")


def flush_log_step(task_id: str):
    """
    Force an immediate DB flush of any buffered log entries for the given task.
    Call this at graph completion alongside flush_partial_state().
    """
    if not hasattr(log_step, "_lock"):
        return
        
    lock = log_step._lock
    with lock:
        flush_entries = log_step._log_buffer.pop(task_id, [])
        if not flush_entries:
            return
        
        # Clean up cached state for this task
        log_step._log_last_flush.pop(task_id, None)
        log_step._log_min_level.pop(task_id, None)
    
    try:
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
            if task:
                new_logs = list(task.logs or [])
                new_logs.extend(flush_entries)
                task.logs = new_logs
                flag_modified(task, "logs")
                db.commit()
    except Exception as e:
        logger.error(f"[LOG-FLUSH] Final log flush failed for {task_id}: {e}")


def flush_partial_state(task_id: str):
    """
    Force an immediate DB flush of any buffered partial state for the given task.
    Call this at graph completion to ensure the final node outputs are persisted
    even if the 3-second coalescing window hasn't expired yet.
    Also cleans up buffer entries for the completed task to prevent memory leaks.
    """
    if not task_id: return
    if not hasattr(write_partial_state, "_lock"):
        return
    
    lock = write_partial_state._lock
    with lock:
        flush_delta = write_partial_state._buffer.pop(task_id, {})
        # Clean up cached state for this task (prevents memory leak)
        if hasattr(write_partial_state, "_last_flush"):
            write_partial_state._last_flush.pop(task_id, None)
    
    if not flush_delta:
        return

    try:
        with SessionLocal() as db:
            task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
            if task:
                current = dict(task.partial_state or {})
                current.update(flush_delta)
                task.partial_state = current
                flag_modified(task, "partial_state")
                db.commit()
    except Exception as e:
        logger.error(f"[PARTIAL-STATE-FLUSH] Final flush failed for {task_id}: {e}")


def reset_runtime_buffers(task_id: str | None = None):
    """
    Clear the in-memory coalescing buffers used by log_step and
    write_partial_state.

    If task_id is provided, only that task's buffered state is removed.
    Otherwise the entire process-local runtime memory is cleared.
    """
    buffers = []

    if hasattr(write_partial_state, "_lock"):
        buffers.append((write_partial_state._lock, write_partial_state, ("_buffer", "_last_flush")))
    if hasattr(log_step, "_lock"):
        buffers.append((log_step._lock, log_step, ("_log_buffer", "_log_last_flush", "_log_min_level")))

    for lock, owner, attrs in buffers:
        with lock:
            for attr in attrs:
                data = getattr(owner, attr, None)
                if not isinstance(data, dict):
                    continue
                if task_id is None:
                    data.clear()
                else:
                    data.pop(task_id, None)


def log_step(task_id: str, message: str, agent: str = "System", level=None, status: str = None):
    """
    ARCHITECTURE: REAL-TIME THOUGHT-BUBBLE LOGGING (Side-Channel)
    
    PURPOSE:
    Graph execution can take 30-60 seconds. To prevent the UI from appearing 
    'frozen', nodes invoke this function to provide immediate feedback.
    
    STRATEGY V2 — LOG COALESCING:
    Rather than opening a DB session for every single log message (200-400 per
    Phase 2 run), log entries are accumulated in an in-memory buffer per task_id
    and flushed to the DB at most once every LOG_FLUSH_INTERVAL_SECONDS.
    This reduces DB session overhead by ~90% while keeping log latency under 2s.
    
    TECHNICAL LOGIC:
    1. FILTER: Checks the message level against the system log level threshold.
    2. BUFFER: Appends log entry to in-memory buffer.
    3. FLUSH: Writes buffered entries to DB when interval expires.
    """
    if not task_id: return
    
    LOG_FLUSH_INTERVAL_SECONDS = 2.0
    
    import time
    
    try:
        # ── IN-MEMORY LOG BUFFER ──────────────────────────────────────────────────
        if not hasattr(log_step, "_log_buffer"):
            log_step._log_buffer: dict = {}       # task_id → list of log entries
            log_step._log_last_flush: dict = {}   # task_id → last flush timestamp
            log_step._log_min_level: dict = {}    # task_id → cached min_log_level
            log_step._lock = threading.Lock()
        
        lock = log_step._lock
        with lock:
            buf = log_step._log_buffer
            last = log_step._log_last_flush
            cached_level = log_step._log_min_level
        
        if task_id not in cached_level:
            try:
                with SessionLocal() as db:
                    task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                    try:
                        m_level = int(task.min_log_level) if task and task.min_log_level is not None else 3
                    except (ValueError, TypeError):
                        m_level = 3
                    with lock:
                        cached_level[task_id] = m_level
            except Exception:
                with lock:
                    cached_level[task_id] = 3
        
        with lock:
            if isinstance(level, str):
                status = level
                level = 3  # INFO equivalent
            elif level is None:
                level = 3

            if hasattr(level, 'value'):
                level_val = level.value
                level_name = level.name
            else:
                level_val = level
                level_name = "INFO"

            if level_val > cached_level.get(task_id, 3):
                return
            
            # Append to buffer
            entry = {
                "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
                "agent": agent,
                "message": message,
                "level": level_name
            }
            if status is not None:
                entry["status"] = status
            
            if task_id not in buf:
                buf[task_id] = []
            buf[task_id].append(entry)
            
            now = time.monotonic()
            elapsed = now - last.get(task_id, 0.0)
            
            if elapsed < LOG_FLUSH_INTERVAL_SECONDS:
                return
            
            # ── DB FLUSH ─────────────────────────────────────────────────────────────
            flush_entries = buf.pop(task_id, [])
            last[task_id] = now
        
        if not flush_entries:
            return
        
        try:
            with SessionLocal() as db:
                task = db.query(GenerationTask).filter(GenerationTask.task_id == task_id).first()
                if task:
                    new_logs = list(task.logs or [])
                    new_logs.extend(flush_entries)
                    task.logs = new_logs
                    flag_modified(task, "logs")

                    # Also update partial_state active_nodes for the frontend
                    st = task.partial_state or {}
                    nodes = st.get("active_nodes", {})
                    modified_nodes = False
                    for entry in flush_entries:
                        ag = entry.get("agent", "")
                        st_val = entry.get("status")
                        if ag and st_val:
                            # Normalize agent name to match frontend keys (e.g. FrontendForge -> frontend_forge)
                            import re
                            node_key = re.sub(r'(?<!^)(?=[A-Z])', '_', ag).lower().replace(" ", "_")
                            if not node_key.endswith("_node") and node_key != "system":
                                node_key += "_node"
                            nodes[node_key] = st_val
                            modified_nodes = True
                    
                    if modified_nodes:
                        st["active_nodes"] = nodes
                        task.partial_state = st
                        flag_modified(task, "partial_state")

                    db.commit()
        except Exception as e:
            logger.error(f"[LOG-FAIL] Real-time milestone update failed: {e}")
    except Exception as e:
        logger.error(f"[LOG-FAIL] Real-time milestone update failed: {e}")
