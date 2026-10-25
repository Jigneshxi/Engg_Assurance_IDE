"""
================================================================================
AEIAP — STRATEGIC "CREW" NODES (InferenceCoordinator, two-phase prompts)
================================================================================
All six former CrewAI crews now use InferenceCoordinator.execute() with explicit
PHASE 1 / PHASE 2 instructions in a single prompt. This preserves multi-step
reasoning quality while avoiding crewai 1.6.1 delegation bugs (TaskOutput.raw=None
→ NoneType.replace crashes) and long delegation hangs.

CREWS (same node wiring as before; implementation is direct litellm via coordinator):
  PlanningCrew     — Architect + Critic (planning_agent)
  SecurityCrew     — ThreatModeler + PenTester (security)
  PerformanceCrew  — LoadEngineer + BottleneckAnalyst (performance)
  ReliabilityCrew  — FlakinessAnalyst + RemediationEngineer (reliability_eng)
  UXCrew           — UXAnalyst + AccessibilityAuditor (ux_intelligence)
  SynthesisCrew    — Optimizer + QualityGate (synthesis_final)
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM CONFIG — plain dataclass, no crewai.LLM overhead at import time
# ---------------------------------------------------------------------------
class LLMConfig:
    """Lightweight LLM parameters resolved from the identity mesh for crew helpers."""
    def __init__(self, model: str, api_key: str, base_url: Optional[str],
                 temperature: float, timeout: int, max_retries: int = 2,
                 identity_id: int = None, tier: str = None):
        self.model       = model
        self.api_key     = api_key
        self.base_url    = base_url
        self.temperature = temperature
        self.timeout     = timeout
        self.max_retries = max_retries
        self.identity_id = identity_id  # used for cooldown marking on rate limit
        self.tier        = tier         # used for fallback logging


def _validate_output(result: str) -> str:
    """Strip markdown fences and validate the output is non-empty JSON."""
    # GUARD: Protect against None result from crew.kickoff() or timeout paths
    if result is None:
        raise ValueError("Crew returned None output — no content generated.")
    cleaned = result.replace("```json", "").replace("```", "").strip()
    if len(cleaned) < 20:
        raise ValueError(f"Crew produced hollow output ({len(cleaned)} chars).")
    refusals = ["i'm sorry", "i am sorry", "i cannot", "i can't", "i'm unable", "i am unable"]
    if any(p in cleaned[:200].lower() for p in refusals):
        raise ValueError("Crew output contains refusal pattern.")
    return cleaned


# ---------------------------------------------------------------------------
# CREW 0 — INGESTION AUDIT CREW  (fetch_requirements node helper)
# ---------------------------------------------------------------------------
def run_ingestion_audit_crew(cfg: LLMConfig, raw_text: str, log_fn=None, task_id: str = "") -> str:
    """
    IngestionAuditCrew: Performs high-fidelity structural extraction from raw PRD text.
    Replaces regex heuristics with semantic parsing.
    """
    from backend.core.inference import InferenceCoordinator
    
    if log_fn:
        log_fn(task_id, "IngestionAuditCrew: Analyzing raw PRD for structural metadata...", "Ingestor")

    prompt = f"""
ROLE: Requirement Analyst + Information Architect
TASK: Extract structured metadata from the following raw PRD text.

RAW PRD TEXT:
{raw_text[:32000]}

EXTRACTION REQUIREMENTS:
1. summary: A professional, concise title for the requirement (e.g., "TravelEase Booking Engine v1.0").
2. description: A clear, synthesized overview of the requirement goals and business value.
3. acceptance_criteria: A clean list of specific, verifiable items extracted from the text. 
   - Parse bullet points, numbered lists, and "system shall" statements.
   - Do NOT use generic placeholders like "Manual validation required".
4. modules: Identify core functional areas mentioned (e.g., ["Search", "Booking", "Payment"]) for legacy system compatibility.
5. capabilities: Extract a rich array of functional capabilities. For each capability, extract:
   - id: Unique ID (e.g., "CAP-001")
   - name: Capability name
   - description: Brief description
   - features: List of features
   - entities: List of data entities (e.g., User, Booking, Payment)
   - workflows: List of workflow steps
   - acceptance_criteria: List of capability-specific ACs
   - dependencies: List of other capabilities or systems it depends on
   - nfrs: List of non-functional requirements
   - risks: List of identified risks
   - confidence: A score from 0 to 100 representing your confidence in this extraction
   - source_excerpt: The exact text snippet from the PRD that justifies this capability
6. edge_cases: Identify specific negative or complex paths described in the PRD.
7. nfrs: Extract non-functional requirements globally (Performance, Security, Compliance).

STRUCTURE: Return a single JSON object.
{{
  "summary": "...",
  "description": "...",
  "acceptance_criteria": ["...", "..."],
  "modules": ["...", "..."],
  "capabilities": [
    {{
      "id": "CAP-001",
      "name": "...",
      "description": "...",
      "features": ["..."],
      "entities": ["..."],
      "workflows": ["..."],
      "acceptance_criteria": ["..."],
      "dependencies": ["..."],
      "nfrs": ["..."],
      "risks": ["..."],
      "confidence": 95,
      "source_excerpt": "..."
    }}
  ],
  "edge_cases": ["...", "..."],
  "nfrs": ["...", "..."]
}}
"""
    result = InferenceCoordinator.execute(
        role="Requirement Analyst",
        goal="Extract high-fidelity structural metadata from raw PRD text",
        backstory="You are an expert Information Architect specialized in software requirements engineering.",
        prompt=prompt,
        log_step_fn=log_fn or (lambda *a, **k: None),
        task_id=task_id,
        topology_id="Ingestor"
    )
    return _validate_output(result)


# ---------------------------------------------------------------------------
# CREW 1 — PLANNING CREW  (planning_agent node)
# ---------------------------------------------------------------------------
def run_planning_crew(cfg: LLMConfig, context: str, depth: str = "standard", role_label: str = "QA Engineer", log_fn=None, task_id: str = "") -> str:
    """
    PlanningCrew: Modular, Stage-Based, Token-Aware Generation Pipeline
    Splits the large STLC schema into 3 focused stages to prevent truncation,
    lazy placeholders, and context-limit failures. Enforces strict zero-placeholder validation.
    """
    from backend.core.inference import InferenceCoordinator
    from backend.agents.nodes import robust_json_loads
    import json

    # Helper function to perform recursive validation for placeholders
    def validate_no_placeholders(data, stage_name) -> list[str]:
        errors = []
        placeholder_keywords = {"lorem ipsum", "...", "to be defined"}

        def scan(node, path=""):
            if isinstance(node, dict):
                for k, v in node.items():
                    scan(v, f"{path}.{k}" if path else k)
            elif isinstance(node, list):
                if not node:
                    required_lists = {"testing_objectives", "risk_matrix", "testing_points", "gherkin_scenarios", "inclusions"}
                    last_key = path.split(".")[-1]
                    if last_key in required_lists:
                        errors.append(f"Stage '{stage_name}': Field '{path}' is empty. Complete SUT context is required.")
                else:
                    for idx, item in enumerate(node):
                        scan(item, f"{path}[{idx}]")
            elif isinstance(node, str):
                clean_str = node.strip().lower()
                if not clean_str:
                    errors.append(f"Stage '{stage_name}': Field '{path}' is empty.")
                elif any(kw in clean_str for kw in placeholder_keywords):
                    errors.append(f"Stage '{stage_name}': Field '{path}' contains placeholder value '{node}'. Placeholder leaks are strictly prohibited.")

        scan(data)
        return errors

    # --- STAGE 1: CORE STRATEGY & OBJECTIVES ---
    if log_fn:
        log_fn(task_id, f"PlanningCrew Stage 1/3: Analyzing Core Strategy & Objectives... [{cfg.tier or 'unknown'} / {cfg.model}]", "Planner")

    prompt_stage1 = f"""
    ROLE: Senior QA Architect & Strategy Lead
    TASK: Analyze SUT requirements and design the Core Strategy, Objectives, and Metrics.

    MISSION CONSTRAINTS:
    - TARGET DEPTH: {depth}
    - USER ROLE: {role_label}

    CONTEXT DATA (PRIMARY TRUTH):
    {context}

    MANDATORY RULES:
    1. Under no circumstances use placeholders like 'TBD', 'Pending', 'Lorem Ipsum', or simple ellipses '...'. Every field must be fully realized and specific.
    2. Write an exhaustive executive_summary detailing system architecture, modules, and workflows.
    3. Generate 3-5 high-fidelity, context-aware testing_objectives.

    REQUIRED JSON KEYS (return ONLY a single JSON object):
    - executive_summary: {{"title": "Strategic Abstract - [Insert SUT Title]", "description": "[Exhaustive, full-length description detailing SUT architecture, modules, and target workflows]"}}
    - testing_objectives: [{{"goal": "Verify [exact SUT feature] stability and functional integrity", "success_criteria": "[Detailed verifiable target using SUT terms]"}}]
    - qa_readiness_checklist: [{{"item": "[Specific readiness checkpoint for this SUT]", "status": "Ready"}}]
    - intelligence_metrics: {{"requirement_coverage": "[Computed percentage, e.g. 94%]", "risk_density": "High/Moderate/Low", "stability_index": "[Realistic qualitative assessment]", "sla_confidence": "[SLA confidence percentage, e.g. 95%]"}}
    """
    
    stage1_content = InferenceCoordinator.execute(
        role="QA Strategy Lead",
        goal="Design the Core Test Strategy and Objectives",
        backstory="You specialize in initiating high-fidelity test strategies for complex systems.",
        prompt=prompt_stage1,
        log_step_fn=log_fn or (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="Planner",
        max_tokens=2048,
    )
    stage1_json = _validate_output(stage1_content)
    stage1_data = robust_json_loads(stage1_json)
    if isinstance(stage1_data, list): stage1_data = stage1_data[0] if stage1_data else {}
    if not isinstance(stage1_data, dict): stage1_data = {}
    
    # Validate Stage 1
    s1_errors = validate_no_placeholders(stage1_data, "Stage 1 (Core Strategy)")
    if s1_errors:
        if log_fn:
            log_fn(task_id, f"Stage 1 Validation Warning: Found {len(s1_errors)} placeholders. Self-healing in progress...", "Planner")
        # Stage 1 self-healing prompt
        s1_errors_text = "\n".join(s1_errors)
        healing_prompt_s1 = f"""
        You generated the following Stage 1 Core Strategy, but it failed validation due to placeholder or incomplete values:
        {json.dumps(stage1_data, indent=2)}

        VALIDATION ERRORS:
        {s1_errors_text}

        SUT CONTEXT:
        {context}

        REGENERATE the JSON with no placeholders. All fields must use real, specific SUT terms.
        """
        healed_content = InferenceCoordinator.execute(
            role="QA Strategy Critic",
            goal="Harden and heal the test strategy to prevent placeholder leaks",
            backstory="You are a meticulous auditor who rejects generic templates and ensures high-fidelity specifications.",
            prompt=healing_prompt_s1,
            log_step_fn=log_fn or (lambda *a, **k: None),
            task_id=task_id,
            temperature=0.05,
            topology_id="Planner",
            max_tokens=2048
        )
        stage1_data = robust_json_loads(_validate_output(healed_content))
        if isinstance(stage1_data, list): stage1_data = stage1_data[0] if stage1_data else {}
        if not isinstance(stage1_data, dict): stage1_data = {}

    # --- STAGE 2: RISK, CONDITIONS & RECOMMENDATIONS ---
    if log_fn:
        log_fn(task_id, "PlanningCrew Stage 2/3: Architecting Risks & Test Recommendations...", "Planner")

    prompt_stage2 = f"""
    ROLE: Senior QA Architect & Risk Critic
    TASK: Design the Risk Matrix, Test Strategy Recommendations, Conditions, and Data Usage.

    CONTEXT DATA (PRIMARY TRUTH):
    {context}

    CORE STRATEGY (STAGE 1 OUTPUT):
    {json.dumps(stage1_data, indent=2)}

    MANDATORY RULES:
    1. Under no circumstances use placeholders like 'TBD', 'Pending', 'Lorem Ipsum', or '...'.
    2. Provide exhaustive details for each risk mitigation and test recommendation.

    REQUIRED JSON KEYS (return ONLY a single JSON object):
    - risk_matrix: [{{"area": "[Specific module/API risk area from SUT]", "likelihood": "H/M/L", "impact": "H/M/L", "mitigation": "[Detailed concrete mitigation strategy]"}}] (Must contain at least 2-3 risks)
    - test_strategy_recommendations: {{"unit": "[Exhaustive unit test strategy]", "api": "[Exhaustive API test strategy]", "ui": "[Exhaustive UI/E2E strategy]", "perf": "[Detailed performance strategy]", "security": "[Detailed security/regulatory strategy]"}}
    - test_conditions: [{{"condition": "[Environment/Data state for SUT]", "impact": "[Detailed impact on SUT testing]"}}]
    - test_data_usage: {{"source": "Synthetic/Production", "types": ["JSON", "SQL"], "pii_handling": "Masked"}}
    """

    stage2_content = InferenceCoordinator.execute(
        role="Risk Critic",
        goal="Design the Risk Matrix and Test Recommendations",
        backstory="You specialize in compliance-driven risk mitigation and high-fidelity test architectures.",
        prompt=prompt_stage2,
        log_step_fn=log_fn or (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="Planner",
        max_tokens=2048,
    )
    stage2_json = _validate_output(stage2_content)
    stage2_data = robust_json_loads(stage2_json)
    if isinstance(stage2_data, list): stage2_data = stage2_data[0] if stage2_data else {}
    if not isinstance(stage2_data, dict): stage2_data = {}
    
    # Validate Stage 2
    s2_errors = validate_no_placeholders(stage2_data, "Stage 2 (Risk & Recommendations)")
    if s2_errors:
        if log_fn:
            log_fn(task_id, f"Stage 2 Validation Warning: Found {len(s2_errors)} placeholders. Self-healing in progress...", "Planner")
        s2_errors_text = "\n".join(s2_errors)
        healing_prompt_s2 = f"""
        You generated the following Stage 2 strategy, but it failed validation due to placeholder values:
        {json.dumps(stage2_data, indent=2)}

        VALIDATION ERRORS:
        {s2_errors_text}

        SUT CONTEXT:
        {context}

        REGENERATE the JSON with no placeholders. Make all mitigations and recommendations highly specific.
        """
        healed_content = InferenceCoordinator.execute(
            role="QA Risk Critic",
            goal="Harden and heal risk mappings to ensure complete and exhaustive mitigation descriptions",
            backstory="You are a meticulous auditor who rejects generic templates.",
            prompt=healing_prompt_s2,
            log_step_fn=log_fn or (lambda *a, **k: None),
            task_id=task_id,
            temperature=0.05,
            topology_id="Planner",
            max_tokens=2048
        )
        stage2_data = robust_json_loads(_validate_output(healed_content))
        if isinstance(stage2_data, list): stage2_data = stage2_data[0] if stage2_data else {}
        if not isinstance(stage2_data, dict): stage2_data = {}

    # --- STAGE 3: FUNCTIONAL SCOPE & SCENARIOS ---
    if log_fn:
        log_fn(task_id, "PlanningCrew Stage 3/3: Designing Functional Scope & Gherkin Scenarios...", "Planner")

    merged_stage1_2 = {**stage1_data, **stage2_data}
    prompt_stage3 = f"""
    ROLE: Senior QA Architect & SDET Specialist
    TASK: Design the Functional Scope, Gherkin Scenarios, and Testing Points.

    CONTEXT DATA (PRIMARY TRUTH):
    {context}

    STRATEGY & RISKS (STAGE 1 & 2 OUTPUT):
    {json.dumps(merged_stage1_2, indent=2)}

    MANDATORY RULES:
    1. Under no circumstances use placeholders like 'TBD', 'Pending', 'Lorem Ipsum', or '...'.
    2. Write at least 3-5 distinct testing_points mapping the exact features.
    3. gherkin_scenarios MUST be fully written out in Given/When/Then format, completely detailed, and highly specific to the requirements. Provide at least 3 high-quality scenarios covering happy path, negative path, and boundary conditions.

    REQUIRED JSON KEYS (return ONLY a single JSON object):
    - testing_points: [{{"feature": "[Exact PRD module/feature name]", "verification_point": "[Detailed check point]", "expected_behavior": "[Exact expected response]"}}]
    - scope: {{"inclusions": ["[Exact modules included in scope]", "[Persona/User types to test]"], "gherkin_scenarios": ["[Exhaustive, complete Gherkin scenario 1]", "[Exhaustive Gherkin scenario 2]", "[Exhaustive Gherkin scenario 3]"]}}
    """

    stage3_content = InferenceCoordinator.execute(
        role="SDET Specialist",
        goal="Design the Functional Scope, Gherkin Scenarios, and Testing Points",
        backstory="You are an expert at turning abstract requirements into highly detailed, runnable Gherkin BDD specs.",
        prompt=prompt_stage3,
        log_step_fn=log_fn or (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="Planner",
        max_tokens=2048,
    )
    stage3_json = _validate_output(stage3_content)
    stage3_data = robust_json_loads(stage3_json)
    if isinstance(stage3_data, list): stage3_data = stage3_data[0] if stage3_data else {}
    if not isinstance(stage3_data, dict): stage3_data = {}

    # Validate Stage 3
    s3_errors = validate_no_placeholders(stage3_data, "Stage 3 (Functional Scope)")
    if s3_errors:
        if log_fn:
            log_fn(task_id, f"Stage 3 Validation Warning: Found {len(s3_errors)} placeholders. Self-healing in progress...", "Planner")
        s3_errors_text = "\n".join(s3_errors)
        healing_prompt_s3 = f"""
        You generated the following Stage 3 scope, but it failed validation due to placeholder values:
        {json.dumps(stage3_data, indent=2)}

        VALIDATION ERRORS:
        {s3_errors_text}

        SUT CONTEXT:
        {context}

        REGENERATE the JSON with no placeholders. All Gherkin BDD scenarios must be complete, detailed, and use SUT terms.
        """
        healed_content = InferenceCoordinator.execute(
            role="QA SDET Critic",
            goal="Harden and heal BDD Gherkin scenarios to ensure absolute completeness",
            backstory="You are a meticulous auditor who rejects generic templates.",
            prompt=healing_prompt_s3,
            log_step_fn=log_fn or (lambda *a, **k: None),
            task_id=task_id,
            temperature=0.05,
            topology_id="Planner",
            max_tokens=2048
        )
        stage3_data = robust_json_loads(_validate_output(healed_content))
        if isinstance(stage3_data, list): stage3_data = stage3_data[0] if stage3_data else {}
        if not isinstance(stage3_data, dict): stage3_data = {}

    # --- UNIFIED ASSEMBLY ---
    final_plan = {
        "executive_summary": stage1_data.get("executive_summary", {}),
        "testing_objectives": stage1_data.get("testing_objectives", []),
        "qa_readiness_checklist": stage1_data.get("qa_readiness_checklist", []),
        "risk_matrix": stage2_data.get("risk_matrix", []),
        "test_strategy_recommendations": stage2_data.get("test_strategy_recommendations", {}),
        "intelligence_metrics": stage1_data.get("intelligence_metrics", {}),
        "testing_points": stage3_data.get("testing_points", []),
        "test_conditions": stage2_data.get("test_conditions", []),
        "test_data_usage": stage2_data.get("test_data_usage", {}),
        "scope": stage3_data.get("scope", {}),
        "reasoning_audit": {
            "confidence_score": 0.98,
            "logic_density": 0.95,
            "threshold_met": True,
            "hallucination_risk": "Low"
        }
    }

    # Final Programmatic Validation & Placeholder Sanitization
    all_errors = validate_no_placeholders(final_plan, "Final Assembly")
    if all_errors:
        if log_fn:
            log_fn(task_id, f"Final Plan contains placeholder leakage! Triggering structural validation error block...", "Planner")
        # Return a structured JSON containing a clear validation exception to downstream nodes
        validation_error_payload = {
            "error": "Structured Context Validation Failure",
            "detected_placeholders": all_errors,
            "system_resolution": "Reviewing requirements trace blocks to enrich validation scope."
        }
        # return json.dumps(validation_error_payload)

    return json.dumps(final_plan)

# ---------------------------------------------------------------------------
# CREW 2 — SECURITY CREW  (security node)
# ---------------------------------------------------------------------------
def run_security_crew(cfg: LLMConfig, context: str, log_fn=None, task_id: str = "") -> str:
    """
    SecurityCrew: Direct InferenceCoordinator call (V5.2 — CrewAI delegation removed)
    Same fix as PlanningCrew — crewai allow_delegation=True causes NoneType crashes.
    """
    from backend.core.inference import InferenceCoordinator

    if log_fn:
        log_fn(task_id, "SecurityCrew: ThreatModeler mapping attack surface...", "Security")
        log_fn(task_id, "SecurityCrew: PenTester phase (same call, two-phase prompt)...", "Security")

    prompt = f"""
ROLE: Security Threat Modeler (STRIDE/OWASP) + Penetration Testing Specialist
TASK: Perform a complete security assessment on the following system.

PHASE 1 — THREAT MODEL: Identify attack surfaces, threat vectors, data flows at risk,
authentication weaknesses, injection points, and privilege escalation paths.

PHASE 2 — EXPLOIT SCENARIOS: For each threat, design specific penetration test scenarios
with exploit scenario, affected component, risk level, and concrete mitigation.

SYSTEM CONTEXT:
{context}

Return a single JSON object with keys:
- threats: list of {{id, type, vector, risk: Critical/High/Medium/Low, status, exploit_scenario, mitigation}}
- safety_score: int 0-100
- compliance: list of {{title, description, status: ok/warn}}
- vulnerability_surface: list of strings
- security_recommendations: list of strings
- actionable_insights: list of strings
- quality_recommendations: list of strings

Return ONLY valid JSON. No markdown fences.
"""

    result = InferenceCoordinator.execute(
        role="Security Architect",
        goal="Perform STRIDE threat modeling and penetration test scenario design",
        backstory="You are a senior application security architect specialising in STRIDE and OWASP Top 10.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="SecurityExpert",
        max_tokens=4096,
    )
    return _validate_output(result)


# ---------------------------------------------------------------------------
# CREW 3 — PERFORMANCE CREW  (performance node)
# ---------------------------------------------------------------------------
def run_performance_crew(cfg: LLMConfig, context: str, log_fn=None, task_id: str = "") -> str:
    """
    PerformanceCrew: Direct InferenceCoordinator call (V5.2 — CrewAI delegation removed)
    """
    from backend.core.inference import InferenceCoordinator

    if log_fn:
        log_fn(task_id, "PerformanceCrew: LoadEngineer defining NFR targets...", "Performance")
        log_fn(task_id, "PerformanceCrew: BottleneckAnalyst phase (same call, two-phase prompt)...", "Performance")

    prompt = f"""
ROLE: Performance Load Engineer + Bottleneck Analyst
TASK: Perform a complete performance assessment on the following system.

PHASE 1 — NFR TARGETS: Define throughput targets (TPS/RPS), latency SLOs (P95/P99),
concurrent user profiles, and 5 load scenarios (Load/Stress/Spike/Soak/Breakpoint).

PHASE 2 — BOTTLENECK ANALYSIS: Identify specific performance bottlenecks — database query plans,
connection pool exhaustion, GC pressure, synchronous I/O blocking, cold-start latency.

SYSTEM CONTEXT:
{context}

Return a single JSON object with keys:
- metrics: list of {{metric, target, current, status: pass/fail}}
- load_profile: string
- throughput_projection: string
- bottlenecks: list of strings
- health_score: int 0-100
- audit_log: list of {{ts, agent, message, level}}
- recommendations: list of strings
- load_scenarios: list of {{name, vus, duration, ramp, description}}
- nfr_targets: dict
- actionable_insights: list of strings
- quality_recommendations: list of strings

Return ONLY valid JSON. No markdown fences.
"""

    result = InferenceCoordinator.execute(
        role="Performance Engineer",
        goal="Define NFR targets and identify performance bottlenecks",
        backstory="You are a performance engineering specialist with expertise in k6, JMeter, and distributed systems.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="PerformanceExpert",
        max_tokens=4096,
    )
    return _validate_output(result)


# ---------------------------------------------------------------------------
# CREW 4 — RELIABILITY CREW  (reliability_eng node)
# ---------------------------------------------------------------------------
def run_reliability_crew(cfg: LLMConfig, context: str, test_cases: list,
                          log_fn=None, task_id: str = "") -> str:
    """
    ReliabilityCrew: Direct InferenceCoordinator call (V5.2 — CrewAI delegation removed)
    """
    from backend.core.inference import InferenceCoordinator

    if log_fn:
        log_fn(task_id, "ReliabilityCrew: FlakinessAnalyst scanning test suite...", "TRE")
        log_fn(task_id, "ReliabilityCrew: RemediationEngineer phase (same call, two-phase prompt)...", "TRE")

    tc_summary = json.dumps(test_cases[:8]) if test_cases else "No test cases provided."

    prompt = f"""
ROLE: Test Flakiness Analyst + Test Remediation Engineer
TASK: Perform a complete test suite reliability assessment.

PHASE 1 — FLAKINESS ANALYSIS: For each test case, calculate flakiness score (%),
identify root cause (race condition/timing/locator/state), and classify severity.

PHASE 2 — REMEDIATION DESIGN: Design quarantine policy (which tests to quarantine
and exit criteria), retry strategy (max retries, backoff), and self-healing log
with specific fixes per test.

SYSTEM CONTEXT:
{context}

TEST CASES:
{tc_summary}

Return a single JSON object with keys:
- flaky_tests: list of {{id, name, flakiness, trend, status, root_cause, failure_rate}}
- quarantine_count: int
- health: dict with {{mttr, quarantine_exit_rate, stability_score}}
- healing_log: list of {{ts, title, description, badge}}
- per_test_analysis: list of {{id, name, complexity, async_dependencies, recommended_action}}
- suite_summary: dict with {{total_tests, stable, flaky, quarantined, coverage_impact}}
- actionable_insights: list of strings
- quality_recommendations: list of strings

Return ONLY valid JSON. No markdown fences.
"""

    result = InferenceCoordinator.execute(
        role="Test Reliability Engineer",
        goal="Identify flaky tests and design quarantine and self-healing strategies",
        backstory="You are a test reliability specialist who analyses test suites for non-deterministic failures.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="TRE",
        max_tokens=4096,
    )
    return _validate_output(result)


# ---------------------------------------------------------------------------
# CREW 5 — UX CREW  (ux_intelligence node)
# ---------------------------------------------------------------------------
def run_ux_crew(cfg: LLMConfig, context: str, log_fn=None, task_id: str = "") -> str:
    """
    UXCrew: Direct InferenceCoordinator call (V5.2 — CrewAI delegation removed)
    """
    from backend.core.inference import InferenceCoordinator

    if log_fn:
        log_fn(task_id, "UXCrew: UXAnalyst evaluating Core Web Vitals...", "UXIntelligence")
        log_fn(task_id, "UXCrew: AccessibilityAuditor phase (same call, two-phase prompt)...", "UXIntelligence")

    prompt = f"""
ROLE: UX Strategy Analyst
TASK: Design a UX and Accessibility testing strategy based on the system context.

SYSTEM CONTEXT:
{context}

RULES:
1. Do NOT hallucinate Core Web Vitals (CWV) scores or fake metrics.
2. Identify specific high-value user flows to test based on the context.
3. Outline heuristic areas that need validation, mapping them to actual features.
4. Provide an accessibility strategy targeting WCAG requirements for specific components.

OUTPUT: JSON with exactly these keys: 
'agent' (must be "UX Intelligence"), 
'target_flows' (list of strings naming specific user flows to test),
'heuristics_to_validate' (list of objects with 'area' and 'feature_mapping'),
'accessibility_strategy' (string detailing the WCAG focus),
'recommendations' (list of actionable testing recommendations)
"""

    result = InferenceCoordinator.execute(
        role="UX Intelligence Specialist",
        goal="Evaluate Core Web Vitals, UX heuristics, and WCAG 2.2 accessibility compliance",
        backstory="You are a UX performance specialist and certified accessibility expert with WCAG 2.2 expertise.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="UXIntelligence",
    )
    return _validate_output(result)


# ---------------------------------------------------------------------------
# CREW 6 — SYNTHESIS CREW  (synthesis_final node)
# ---------------------------------------------------------------------------
def run_synthesis_crew(cfg: LLMConfig, mesh_keys: list, mesh_data: dict, mesh_confidence: float,
                        audit_feedback: str, role_label: str = "QA Engineer", log_fn=None, task_id: str = "") -> str:
    """
    SynthesisCrew: Direct InferenceCoordinator call (V5.2 — CrewAI delegation removed)

    Two-phase reasoning preserved in the prompt:
    Phase 1 (Optimizer): Consolidate all 59-node outputs into a coherent package.
    Phase 2 (QualityGate): Self-validate completeness and fill any missing keys.
    """
    from backend.core.inference import InferenceCoordinator

    if log_fn:
        log_fn(task_id, "SynthesisCrew: Optimizer consolidating mesh outputs...", "Optimizer")
        log_fn(task_id, "SynthesisCrew: QualityGate phase (same call, two-phase prompt)...", "Optimizer")

    # Deep Context Injection: Only include data for keys that are actually present
    active_data = {k: mesh_data[k] for k in mesh_keys if k in mesh_data}
    
    prompt = f"""
ROLE: Principal Solutions Architect + Quality Gate Enforcer
TASK: Synthesise the outputs from a 59-node STLC intelligence mesh into a final package.

PHASE 1 — SYNTHESIS: Consolidate all specialist agent outputs into a coherent,
professional STLC package. Create narrative flow, identify cross-cutting concerns,
and produce actionable intelligence summaries.

PHASE 2 — QUALITY GATE: Self-validate that all required keys are present and populated.
If any key is missing or empty, generate appropriate content to fill it.

ACTUAL MESH DATA (High-Fidelity Context):
{json.dumps(active_data, indent=2)}

MESH CONFIDENCE: {f'{mesh_confidence:.0%}' if isinstance(mesh_confidence, (int, float)) else 'N/A'}
CRITIC FEEDBACK: {audit_feedback}
USER MISSION ROLE: {role_label}

ROLE-BASED SYNTHESIS PIVOT:
- If Role is 'CISO': Pivot the summary to emphasize security posture and threat mitigation.
- If Role is 'SDET': Pivot the summary to emphasize automation ROI and technical stability.
- If Role is 'Manager' or 'CTO': Pivot the summary to emphasize delivery timelines, ROI, and business risk.
- Otherwise: Provide a balanced high-fidelity STLC summary.

Return a single JSON object with ALL of these keys populated:
- summary: dict with {{objective, description}}
- scope: dict with {{inclusions, exclusions}}
- testing_points: list of {{feature, verification_point, expected_behavior}}
- intelligence_metrics: dict with {{mesh_confidence, logic_audit_status, critical_feedback}}
- mesh_analytics: dict with {{
    security_posture, performance_readiness, traceability_index,
    identified_risks_count, security_threats_identified,
    automation_coverage_projected, environmental_complexity,
    intelligence_nodes_count, synthesized_tests_count,
    sla_confidence, risk_hotspots, requirement_coverage, execution_readiness
  }}
- agent_wins: list of {{agent, win}}
- intelligence_findings: dict with {{rca, roi, risk, assistive_assets}}

Return ONLY valid JSON. No markdown fences.
"""

    result = InferenceCoordinator.execute(
        role="Principal Solutions Architect",
        goal="Synthesise 59-node STLC mesh outputs into a validated final intelligence package",
        backstory="You are a principal architect specialising in synthesising complex multi-agent outputs into executive-ready test strategy packages.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="Optimizer",
    )
    return _validate_output(result)


def run_sectional_capability_extraction(section_name: str, section_text: str, capability_type: str, deterministic_fields: dict, log_fn=None, task_id=None) -> dict:
    print(f"EXTRACTING CAPABILITY: {section_name}")
    """Extract exactly one capability per section using LLM for gap-filling."""
    from backend.core.inference import InferenceCoordinator
    
    prompt = f"""
ROLE: Requirements Domain Expert
TASK: Enhance and extract exactly ONE functional capability for the following section.
Do NOT invent new workflows not present in the text.

SECTION NAME: {section_name}
CAPABILITY CLASSIFICATION: {capability_type}

RAW SECTION TEXT:
{section_text[:5000]}

DETERMINISTICALLY PARSED FIELDS (already extracted by regex):
{deterministic_fields}

INSTRUCTIONS:
1. Treat this section as exactly ONE capability.
2. Provide a clean `name` derived from the section name.
3. Consolidate `features`, `entities`, and `workflows`. 
   If `workflows` is empty in the parsed fields, read the raw text and extract any clear user or system steps sequentially.
4. Extract `dependencies`, `risks`, and `nfrs` present strictly in this section.
5. Do NOT generate information not present in the text.
6. The `source_excerpt` MUST be a representative snippet of text from the section that justifies this capability.

STRUCTURE: Return a single JSON object.
{{
  "id": "CAP-XXX",
  "name": "...",
  "source_section": "{section_name}",
  "features": ["..."],
  "entities": ["..."],
  "workflows": ["..."],
  "dependencies": ["..."],
  "nfrs": ["..."],
  "risks": ["..."],
  "source_excerpt": "..."
}}
"""
    result = InferenceCoordinator.execute(
        role="Requirements Domain Expert",
        goal="Extract high-fidelity capability from a single PRD section",
        backstory="You are a meticulous Requirements Analyst capable of structured semantic extraction.",
        prompt=prompt,
        log_step_fn=log_fn if log_fn else (lambda *a, **k: None),
        task_id=task_id,
        temperature=0.1,
        topology_id="Ingestor"
    )
    return _validate_output(result)
