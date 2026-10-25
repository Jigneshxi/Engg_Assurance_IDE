import logging
import json
import re
from fastapi import APIRouter
from backend.api.models import AgentInvokeRequest
from backend.core.inference import InferenceCoordinator

router = APIRouter(prefix="/api/agents", tags=["agents"])
logger = logging.getLogger(__name__)

# =============================================================================
# AGENT-SPECIFIC PROMPT TEMPLATES
# Each agent gets a prompt that requests its actual specialist output,
# not generic telemetry. The LLM is instructed to return a JSON object
# whose keys match what the corresponding workspace component expects.
# =============================================================================
AGENT_PROMPTS = {
    "planning_agent": """
ROLE: Senior QA Architect / Intelligent Test Planner (Agent #1)
TASK: Analyse the provided context and produce a complete Strategic Test Plan.
CONTEXT: {context}
ACTION: {action}

INSTRUCTIONS:
1. Parse the context to identify the system under test, user flows, and acceptance criteria.
2. Derive testing objectives with measurable success criteria from the context.
3. Generate BDD Gherkin scenarios specific to the described flows.
4. Identify risks based on the described architecture and user flows.
5. Recommend a testing strategy pyramid tailored to the context.

Return a single JSON object with EXACTLY these keys (matching the analysis_payload schema):
{{
  "executive_summary": {{
    "title": "Strategic Test Plan — <system name from context>",
    "description": "High-level summary of the testing strategy derived from the provided context."
  }},
  "testing_objectives": [
    {{"goal": "Specific objective derived from context", "success_criteria": "Measurable success criterion"}}
  ],
  "scope": {{
    "inclusions": ["Feature or flow included in scope"],
    "exclusions": ["What is explicitly out of scope"],
    "gherkin_scenarios": [
      "Scenario: <name>\\n  Given <precondition>\\n  When <action>\\n  Then <expected result>"
    ]
  }},
  "risk_matrix": [
    {{"area": "Risk area from context", "likelihood": "H/M/L", "impact": "H/M/L", "mitigation": "Specific mitigation strategy"}}
  ],
  "test_strategy_recommendations": {{
    "unit": "Unit testing approach for this context",
    "api": "API testing approach",
    "ui": "UI/E2E testing approach",
    "perf": "Performance testing approach",
    "security": "Security testing approach"
  }},
  "intelligence_metrics": {{
    "requirement_coverage": "XX%",
    "risk_density": "High/Medium/Low",
    "sla_confidence": "XX%",
    "stability_index": "Analysis result"
  }},
  "testing_points": [
    {{"feature": "Feature name", "verification_point": "What to verify", "expected_behavior": "Expected outcome"}}
  ]
}}
""",

    "clarifier": """
ROLE: Senior Business Analyst
TASK: Clarify and harden the following requirement context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- clarified_requirements: [{{"id": "REQ-01", "clarified_summary": "...", "clarified_description": "...", "identified_gaps": [...], "refined_acceptance_criteria": [...], "testability_score": 85}}]
- ambiguity_report: {{"total_gaps": 0, "critical_terms": [...], "recommendations": [...]}}
""",

    "security": """
ROLE: Security Intelligence Specialist (ASPM+)
TASK: Perform a security threat analysis on the provided context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- threats: [{{"id": "S-01", "type": "...", "vector": "...", "risk": "Critical/High/Medium/Low", "status": "Mitigated/Pending"}}]
- safety_score: 85
- compliance: [{{"title": "OWASP Top 10", "description": "...", "status": "ok/warn"}}]
- scan: {{"title": "ASPM+ Probe", "description": "...", "progress": 100}}
""",

    "performance": """
ROLE: Senior Performance Engineering Specialist (Agent #17)
TASK: Perform a deep performance analysis on the system or feature described in the context.
CONTEXT: {context}
ACTION: {action}

INSTRUCTIONS:
1. Parse the context to identify the system under test, endpoints, and user flows.
2. Derive realistic NFR baselines (latency, throughput, error rate) from the context.
3. Identify specific bottlenecks based on the described architecture or test steps.
4. Generate load scenario recommendations tailored to the context.
5. Produce an audit log with specific findings from the analysis.

Return a single JSON object with ALL of these keys populated from the context:
{{
  "metrics": [
    {{"metric": "P99 Latency", "target": "< 200ms", "current": "<derived from context>", "status": "pass/fail"}},
    {{"metric": "P95 Latency", "target": "< 150ms", "current": "<derived>", "status": "pass/fail"}},
    {{"metric": "Throughput", "target": "> 500 RPS", "current": "<derived>", "status": "pass/fail"}},
    {{"metric": "Error Rate", "target": "< 0.1%", "current": "<derived>", "status": "pass/fail"}},
    {{"metric": "CPU Saturation", "target": "< 70%", "current": "<derived>", "status": "pass/fail"}}
  ],
  "load_profile": "Describe the recommended load strategy based on the context (e.g. Steady State 500 VU, 60s ramp)",
  "throughput_projection": "Projected RPS based on context analysis",
  "bottlenecks": ["List specific bottlenecks identified from the context — e.g. database queries, auth flows, third-party calls"],
  "health_score": 85,
  "audit_log": [
    {{"ts": "Analysis timestamp", "agent": "Agent #17", "message": "Specific finding from context analysis", "level": "warn/info"}},
    {{"ts": "Analysis timestamp", "agent": "Agent #17", "message": "Another specific finding", "level": "info"}}
  ],
  "recommendations": ["Actionable recommendation 1 derived from context", "Recommendation 2"],
  "load_scenarios": [
    {{"name": "Steady State", "vus": 500, "duration": "10m", "ramp": "60s", "description": "Baseline load"}},
    {{"name": "Spike Test", "vus": 2000, "duration": "2m", "ramp": "10s", "description": "Peak traffic simulation"}}
  ]
}}
""",

    "data_builder": """
ROLE: Test Data Engineering Specialist
TASK: Generate synthetic, PII-compliant test data for the provided context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- records: [{{"id": "USR-001", "name": "Test User", "email": "test@example.com", "role": "admin"}}]
- schema: {{"entity": "User", "fields": 4, "pii_fields": ["name", "email"]}}
- pii_masking: "enabled"
- records_synced: 50
""",

    "api_validation": """
ROLE: API Validation Specialist
TASK: Validate API contracts and dependency graph for the provided context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- endpoints: [{{"method": "POST", "path": "/api/v1/auth/login", "status": "verified", "coverage": 88}}]
- topology: [{{"name": "Auth Service", "type": "service", "mocked": false}}]
- contract: {{"type": "object", "required": ["username", "password"]}}
""",

    "test_impact": """
ROLE: Test Impact Intelligence Specialist
TASK: Calculate blast radius and regression subset for the provided change context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- impacted_modules: [{{"name": "...", "depth": 1, "tests": 42, "risk": "High/Medium/Low"}}]
- scan_label: "Impact Analysis"
- history: [{{"ts": "...", "message": "..."}}]
""",

    "reliability_eng": """
ROLE: Senior Reliability Engineering Specialist / TRE (Agent #44)
TASK: Perform a deep test suite reliability analysis on the tests described in the context.
CONTEXT: {context}
ACTION: {action}

INSTRUCTIONS:
1. Parse the context to identify individual test cases, test IDs, and test steps.
2. For EACH test case found, calculate a flakiness score based on complexity, async operations, and dependencies.
3. Determine which tests should be quarantined (flakiness > 10% or race conditions detected).
4. Generate a self-healing log with root cause analysis and remediation for unstable tests.
5. Calculate suite health metrics from the per-test analysis.

Return a single JSON object with ALL of these keys populated from the context:
{{
  "flaky_tests": [
    {{
      "id": "TC-001",
      "name": "Specific test name from context",
      "flakiness": "14%",
      "trend": "up",
      "status": "Quarantined",
      "root_cause": "Race condition in async payment handler",
      "failure_rate": "3/20 runs"
    }}
  ],
  "quarantine_count": 3,
  "health": {{
    "mttr": "1.4 Hours",
    "quarantine_exit_rate": "85%",
    "stability_score": "94/100"
  }},
  "healing_log": [
    {{
      "ts": "Analysis timestamp",
      "title": "Specific test name — Root Cause Identified",
      "description": "Detailed root cause and remediation action derived from context",
      "badge": "Remediation: <specific action>"
    }}
  ],
  "per_test_analysis": [
    {{
      "id": "TC-001",
      "name": "Test name from context",
      "complexity": "High/Medium/Low",
      "async_dependencies": true,
      "recommended_action": "Quarantine/Monitor/Stable"
    }}
  ],
  "suite_summary": {{
    "total_tests": 0,
    "stable": 0,
    "flaky": 0,
    "quarantined": 0,
    "coverage_impact": "X% of critical paths affected"
  }}
}}
""",

    "digital_twin": """
ROLE: Digital Twin Simulation Specialist
TASK: Assess production mirror fidelity and traffic shadowing status.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- sync_status: [{{"service": "...", "lastSync": "12s ago", "matchRate": "99.2%", "status": "Active"}}]
- active_shadows: 4
- delta: [{{"title": "...", "description": "...", "status": "ok/warn"}}]
""",

    "visual_intel": """
ROLE: Visual Testing Intelligence Specialist
TASK: Assess visual regression baselines and DOM anchor stability.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- baselines: [{{"id": "V-01", "page": "...", "threshold": "0.1%", "status": "Locked", "drift": "0.01%"}}]
- anchors: [{{"selector": "#header", "constraint": "Sticky Position", "sensitivity": "High"}}]
""",

    "automation_forge": """
ROLE: Automation Framework Specialist
TASK: Generate automation framework scaffold and configuration.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- scaffold: [{{"name": "tests/", "type": "folder"}}, {{"name": "playwright.config.ts", "type": "file"}}]
- frameworks: [{{"name": "Playwright", "description": "Configured for parallel sharding", "version": "v1.42.1", "active": true}}]
- config: "import {{ defineConfig }} from '@playwright/test';\\n\\nexport default defineConfig({{\\n  testDir: './tests',\\n  fullyParallel: true\\n}});"
""",

    "cross_browser": """
ROLE: Cross-Browser Compatibility Specialist
TASK: Validate browser compatibility matrix for the provided context.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- browsers: [{{"page": "...", "chrome": "ok", "firefox": "ok", "safari": "warn", "edge": "ok", "ios": "ok"}}]
- health: "98.5% Passing"
""",

    "self_healing": """
ROLE: Self-Healing Automation Specialist
TASK: Analyse locator stability and propose resilient selector strategies.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- locators: [{{"name": "Login Button", "primary": "#submit-btn", "fall": "3 alternatives", "heals": 0}}]
- stability: "88.4%"
- evolution: {{"mean_time_to_heal": "120ms", "zero_touch_success": "99.2%", "framework_gain": "+4h/week"}}
""",

    "microservices": """
ROLE: Microservices & Service Mesh Specialist
TASK: Validate service topology, distributed tracing, and mTLS compliance.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- mesh_nodes: [{{"name": "Auth Service", "connection": "mTLS"}}, {{"name": "Gateway"}}, {{"name": "Inventory"}}]
- traces: [{{"name": "Gateway", "duration": "200ms"}}, {{"name": "Auth Svc", "duration": "400ms"}}]
- mtls: [{{"title": "Identity Attestation", "description": "SPIFFE ID verified", "status": "pass"}}]
""",

    "run_orchestrator": """
ROLE: Test Execution Orchestration Specialist
TASK: Design parallel execution strategy and CI/CD pipeline configuration.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- shards: [{{"id": "SHARD-1", "status": "ACTIVE", "identity": "Worker Node-01 (k8s)", "complexity": "70%"}}]
- max_concurrent: 12
- retry_policies: [{{"title": "Network Flakiness Retry", "description": "Retries 3x with backoff", "tier": "Tier 1", "enabled": true}}]
""",

    "env_provisioner": """
ROLE: Environment Provisioning Specialist
TASK: Generate ephemeral environment blueprint and container configuration.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- yaml: "version: '3.8'\\nservices:\\n  test-env:\\n    image: sequor/node-runner:latest"
- containers: [{{"name": "sql-mock-v1", "status": "Running on Port 5432", "load": 40}}]
- ttl: "2 Hours"
""",

    "ux_intelligence": """
ROLE: Senior UX Intelligence Specialist (Agent #35)
TASK: Perform a comprehensive UX and accessibility analysis on the system described in the context.
CONTEXT: {context}
ACTION: {action}

INSTRUCTIONS:
1. Parse the context to identify the application, URL, or user flows being tested.
2. Derive realistic Core Web Vitals estimates based on the described UI complexity and interactions.
3. Identify specific UX heuristic violations from the described flows (e.g. feedback latency, visual hierarchy).
4. Generate a WCAG 2.2 accessibility audit based on the described UI elements.
5. Provide actionable recommendations specific to the context.

Return a single JSON object with ALL of these keys populated from the context:
{{
  "vitals": [
    {{"label": "LCP (Largest Contentful Paint)", "val": "<derived>", "status": "ok/warn/fail", "benchmark": "< 2.5s"}},
    {{"label": "FID (First Input Delay)", "val": "<derived>", "status": "ok/warn/fail", "benchmark": "< 100ms"}},
    {{"label": "CLS (Cumulative Layout Shift)", "val": "<derived>", "status": "ok/warn/fail", "benchmark": "< 0.1"}},
    {{"label": "INP (Interaction to Next Paint)", "val": "<derived>", "status": "ok/warn/fail", "benchmark": "< 200ms"}},
    {{"label": "FCP (First Contentful Paint)", "val": "<derived>", "status": "ok/warn/fail", "benchmark": "< 1.8s"}}
  ],
  "score": "XX/100",
  "heuristics": [
    {{
      "title": "Specific heuristic finding from context",
      "description": "Detailed description of the UX issue identified",
      "status": "warn/ok",
      "severity": "High/Medium/Low",
      "recommendation": "Specific fix recommendation"
    }}
  ],
  "accessibility": {{
    "compliance": "XX% WCAG 2.2",
    "missing_alt_text": "X elements",
    "contrast_ratio": "X violations",
    "aria_labels": "X% compliant",
    "violations": [
      {{"criterion": "1.4.3 Contrast", "severity": "AA", "element": "<specific element from context>", "fix": "Increase contrast ratio to 4.5:1"}}
    ]
  }},
  "recommendations": [
    "Specific actionable recommendation 1 derived from context",
    "Specific actionable recommendation 2"
  ],
  "performance_insights": {{
    "render_blocking_resources": ["List specific resources if identifiable from context"],
    "optimization_opportunities": ["Specific optimization based on context"],
    "estimated_improvement": "X% LCP improvement with recommended changes"
  }}
}}
""",

    "env_consistency": """
ROLE: Environment Consistency Specialist
TASK: Detect configuration drift across Dev, Staging, and Production environments.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- drift: [{{"key": "DB_CONNECTION_LIMIT", "dev": "20", "stg": "50", "prod": "500", "ok": true}}]
- hazard_count: 2
- parity: {{"score": "92%", "description": "Staging matches production with high fidelity", "items": [{{"name": "Node.js Version", "value": "v18.19.0 STABLE"}}]}}
- health: {{"fleet_status": "Operational", "sync_latency": "1.2ms"}}
""",

    "suite_optimization": """
ROLE: Test Suite Optimization Specialist
TASK: Analyse suite composition and recommend pruning and parallelisation strategies.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- optimization_score: "87%"
- redundant_tests: 14
- time_savings: "42 minutes"
- parallel_groups: [{{"group": "Smoke", "tests": 12, "estimated_time": "4m"}}]
- recommendations: ["Remove 14 duplicate login flow tests", "Parallelise checkout suite across 4 shards"]
""",

    "data_pipeline": """
ROLE: Database & Data Pipeline Specialist
TASK: Validate ETL checkpoints, DB scenarios, and latency SLOs.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- pipeline_health: "Stable"
- etl_checkpoints: [{{"stage": "Extract", "status": "pass", "latency": "120ms"}}]
- latency_slo: "< 500ms"
- anomalies: []
""",

    "compliance_remediation": """
ROLE: Autonomous Compliance Remediation Specialist
TASK: Identify and auto-remediate PCI/GDPR/HIPAA compliance findings.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- findings: [{{"control_id": "PCI-DSS-3.4", "description": "...", "status": "Remediated", "severity": "High"}}]
- remediation_score: "94%"
- standards_covered: ["PCI-DSS v4.0", "GDPR", "SOC2"]
""",

    "event_driven": """
ROLE: Event-Driven Architecture Testing Specialist
TASK: Validate async message queue integrity and event schema compliance.
CONTEXT: {context}
ACTION: {action}

Return a single JSON object with:
- queues: [{{"name": "order.created", "broker": "Kafka", "schema_valid": true, "lag": "0ms"}}]
- event_coverage: "92%"
- schema_violations: []
""",

    "test_case_factory": """
ROLE: Test Case Factory — Mesh Synthesis Core
TASK: Consolidate the provided context into a final test case manifest and mesh consensus report.
CONTEXT: {context}
ACTION: {action}

INSTRUCTIONS:
1. Parse the context to extract all test scenarios, requirements, and acceptance criteria.
2. Generate a comprehensive set of atomic test cases with full traceability.
3. Calculate mesh integrity metrics from the provided context.
4. Produce a synthesis summary of the full test strategy.

Return a single JSON object with:
{{
  "intelligence_metrics": {{
    "strategic_alignment": 98,
    "technical_coverage": 94,
    "risk_mitigation": 91,
    "logic_consistency": 99,
    "critical_feedback": "Synthesis complete. All requirement nodes mapped to test scenarios."
  }},
  "synthesis": "Consolidated test strategy summary derived from provided context.",
  "test_cases": [
    {{"id": "TC-001", "title": "Test case title", "preconditions": ["..."], "steps": ["..."], "expected_result": "...", "severity": "High/Medium/Low"}}
  ],
  "coverage_summary": {{
    "total_requirements": 0,
    "covered": 0,
    "coverage_percentage": "XX%"
  }}
}}
""",
}

# Default prompt for agents not in the map above
DEFAULT_AGENT_PROMPT = """
ROLE: {agent_key} Specialist within the SeQuor STLC Mesh
TASK: Perform a high-fidelity specialist assessment.
CONTEXT: {context}
ACTION: {action}

Analyse the context and return a structured JSON object with:
- status: "Analysed"
- summary: "One-paragraph specialist assessment"
- actionable_insights: ["Insight 1", "Insight 2", "Insight 3"]
- quality_recommendations: ["Recommendation 1", "Recommendation 2"]
- confidence: "94%"
- key_metrics: {{"metric_1": "value_1", "metric_2": "value_2"}}
"""

# =============================================================================
# COMPREHENSIVE FALLBACK DATA (used when LLM is unavailable)
# Covers all 59 agents with meaningful, agent-specific data.
# =============================================================================
FALLBACK_DATA = {
    "planning_agent": {
        "executive_summary": {"title": "Strategic Test Plan", "description": "Comprehensive STLC coverage plan generated from provided context. Covers functional, API, performance, and security testing layers."},
        "testing_objectives": [
            {"goal": "Validate end-to-end user flows", "success_criteria": "All critical paths pass with zero P1 defects"},
            {"goal": "Verify API contract compliance", "success_criteria": "100% endpoint coverage with schema validation"},
            {"goal": "Confirm non-functional requirements", "success_criteria": "P99 latency < 200ms under 500 VU load"}
        ],
        "scope": {
            "inclusions": ["Functional Testing", "Regression Suite", "API Validation", "Security Scan"],
            "exclusions": ["Performance Stress Testing (Phase 2)", "Third-party integrations"],
            "gherkin_scenarios": [
                "Scenario: User completes purchase flow\n  Given user is on login page\n  When user enters valid credentials\n  Then inventory page is displayed",
                "Scenario: Cart session persistence\n  Given user has added items to cart\n  When user navigates away and returns\n  Then cart items are preserved"
            ]
        },
        "risk_matrix": [
            {"area": "Authentication", "likelihood": "M", "impact": "H", "mitigation": "Implement retry logic and session validation"},
            {"area": "Payment Processing", "likelihood": "L", "impact": "H", "mitigation": "Sandbox environment with full transaction replay"},
            {"area": "Third-party API Dependency", "likelihood": "H", "impact": "M", "mitigation": "Service virtualization for all external calls"}
        ],
        "intelligence_metrics": {"requirement_coverage": "94%", "risk_density": "Medium", "sla_confidence": "96%", "stability_index": "Stable"},
        "test_strategy_recommendations": {
            "unit": "Jest/Vitest for component logic — target 80% branch coverage",
            "api": "Supertest for REST contracts — schema validation on all endpoints",
            "ui": "Playwright E2E — critical path coverage across Chrome, Firefox, Safari",
            "perf": "k6 load testing — 500 VU steady state, spike to 2000 VU",
            "security": "OWASP ZAP scan — DAST on all authenticated endpoints"
        },
        "testing_points": [
            {"feature": "User Authentication", "verification_point": "Login with valid/invalid credentials", "expected_behavior": "Valid: redirect to dashboard; Invalid: error message shown"},
            {"feature": "Shopping Cart", "verification_point": "Add/remove items, quantity update", "expected_behavior": "Cart badge updates, totals recalculate correctly"},
            {"feature": "Checkout Flow", "verification_point": "Complete purchase end-to-end", "expected_behavior": "Order confirmation displayed, inventory decremented"}
        ]
    },
    "security": {"threats": [{"id": "S-01", "type": "SQL Injection", "vector": "Login Form", "risk": "Critical", "status": "Mitigated"}, {"id": "S-02", "type": "Broken Auth", "vector": "Session JWT", "risk": "High", "status": "Audit Pending"}], "safety_score": 82, "compliance": [{"title": "OWASP Top 10", "description": "Architecture matches 9/10 recommended safety patterns.", "status": "ok"}]},
    "performance": {
        "metrics": [
            {"metric": "P99 Latency",    "target": "< 200ms",  "current": "142ms",   "status": "pass"},
            {"metric": "P95 Latency",    "target": "< 150ms",  "current": "118ms",   "status": "pass"},
            {"metric": "Throughput",     "target": "> 500 RPS", "current": "420 RPS", "status": "fail"},
            {"metric": "Error Rate",     "target": "< 0.1%",   "current": "0.005%",  "status": "pass"},
            {"metric": "CPU Saturation", "target": "< 70%",    "current": "45%",     "status": "pass"}
        ],
        "load_profile": "Steady State — 500 VU ramp over 60s",
        "throughput_projection": "1,240 req/sec",
        "bottlenecks": ["Legacy XML Parser in checkout flow", "Auth Token Validation Hub (synchronous)"],
        "health_score": 89,
        "audit_log": [
            {"ts": "Analysis", "agent": "Agent #17", "message": "Memory leak signature detected in Inventory Service GC profile during 4k iteration soak test.", "level": "warn"},
            {"ts": "Analysis", "agent": "Agent #17", "message": "LCP within budget (1.2s) for Login page baseline. Checkout page at 2.1s — approaching threshold.", "level": "info"}
        ],
        "recommendations": [
            "Replace synchronous XML parser with streaming JSON alternative — estimated 40% latency reduction",
            "Implement connection pooling for Auth Token Validation to eliminate sequential bottleneck"
        ],
        "load_scenarios": [
            {"name": "Steady State", "vus": 500, "duration": "10m", "ramp": "60s", "description": "Baseline load validation"},
            {"name": "Spike Test",   "vus": 2000, "duration": "2m", "ramp": "10s", "description": "Peak traffic simulation"}
        ]
    },
    "data_builder": {"records": [{"id": "USR-001", "name": "Test User Alpha", "email": "alpha@test.com", "role": "admin"}, {"id": "USR-002", "name": "Test User Beta", "email": "beta@test.com", "role": "viewer"}], "pii_masking": "enabled", "records_synced": 50},
    "api_validation": {"endpoints": [{"method": "GET", "path": "/api/v1/health", "status": "verified", "coverage": 95}, {"method": "POST", "path": "/api/v1/auth/login", "status": "verified", "coverage": 88}], "topology": [{"name": "Auth Service", "type": "service", "mocked": False}, {"name": "Inventory Service", "type": "service", "mocked": True}]},
    "test_impact": {"impacted_modules": [{"name": "Payment Processing", "depth": 1, "tests": 42, "risk": "High"}, {"name": "Inventory Cache", "depth": 2, "tests": 18, "risk": "Medium"}], "scan_label": "Blast Radius Analysis"},
    "reliability_eng": {
        "flaky_tests": [
            {"id": "TC-901", "name": "Checkout Payment Race Condition", "flakiness": "14%", "trend": "up",   "status": "Quarantined",  "root_cause": "Race condition between payment confirmation and inventory update", "failure_rate": "3/20 runs"},
            {"id": "TC-221", "name": "Cart Session Persistence",        "flakiness": "4%",  "trend": "down", "status": "Active",        "root_cause": "Intermittent Redis cache miss under load", "failure_rate": "1/25 runs"},
            {"id": "TC-104", "name": "User Profile Image Upload",       "flakiness": "28%", "trend": "up",   "status": "Self-Healing",  "root_cause": "Dynamic XPath locator breaks on React re-render", "failure_rate": "6/20 runs"}
        ],
        "quarantine_count": 4,
        "health": {"mttr": "1.4 Hours", "quarantine_exit_rate": "85%", "stability_score": "94/100"},
        "healing_log": [
            {"ts": "April 09, 10:44:21", "title": "Locator Refactored: TC-104",    "description": "Identified flaky XPath for upload_btn. Switched to dynamic data-testid with 500ms smart-wait fallback. Root cause: React 18 concurrent rendering invalidates XPath mid-execution.", "badge": "Success: 100% Reliability Gain"},
            {"ts": "April 08, 16:12:05", "title": "State Injection Added: TC-901", "description": "Reduced flakiness by forcing session clear-down before payment step. Root cause: shared session state between parallel test workers.", "badge": "Pending: Monitoring Next 10 Runs"}
        ],
        "per_test_analysis": [
            {"id": "TC-901", "name": "Checkout Payment Race Condition", "complexity": "High",   "async_dependencies": True,  "recommended_action": "Quarantine"},
            {"id": "TC-221", "name": "Cart Session Persistence",        "complexity": "Medium", "async_dependencies": True,  "recommended_action": "Monitor"},
            {"id": "TC-104", "name": "User Profile Image Upload",       "complexity": "Medium", "async_dependencies": False, "recommended_action": "Self-Heal"}
        ],
        "suite_summary": {"total_tests": 285, "stable": 278, "flaky": 4, "quarantined": 3, "coverage_impact": "12% of critical checkout paths affected"}
    },
    "digital_twin": {"sync_status": [{"service": "Auth Gateway", "lastSync": "12s ago", "matchRate": "99.2%", "status": "Active"}, {"service": "Inventory DB", "lastSync": "45s ago", "matchRate": "98.5%", "status": "Active"}], "active_shadows": 4, "delta": [{"title": "Payload Parity", "description": "100% match on JSON response schemas.", "status": "ok"}]},
    "visual_intel": {"baselines": [{"id": "V-01", "page": "Login Page", "threshold": "0.05%", "status": "Locked", "drift": "0.01%"}, {"id": "V-02", "page": "Checkout", "threshold": "0.1%", "status": "Locked", "drift": "0.00%"}]},
    "automation_forge": {"scaffold": [{"name": "tests/", "type": "folder"}, {"name": "pages/", "type": "folder"}, {"name": "playwright.config.ts", "type": "file"}], "frameworks": [{"name": "Playwright", "description": "Configured for parallel sharding and visual snapshots.", "version": "v1.42.1", "active": True}], "config": "import { defineConfig } from '@playwright/test';\n\nexport default defineConfig({\n  testDir: './tests',\n  fullyParallel: true,\n  reporter: 'html'\n});"},
    "cross_browser": {"browsers": [{"page": "Login Page", "chrome": "ok", "firefox": "ok", "safari": "ok", "edge": "ok", "ios": "ok"}, {"page": "Checkout Flow", "chrome": "ok", "firefox": "ok", "safari": "warn", "edge": "ok", "ios": "ok"}], "health": "98.5% Passing"},
    "self_healing": {"locators": [{"name": "Login Button", "primary": "#submit-btn", "fall": "3 alternatives", "heals": 0}, {"name": "Cart Badge", "primary": ".nav-cart-badge", "fall": "5 alternatives", "heals": 12}], "stability": "88.4%"},
    "microservices": {"mesh_nodes": [{"name": "Auth Service", "connection": "mTLS"}, {"name": "Gateway"}, {"name": "Inventory"}], "traces": [{"name": "Gateway", "duration": "200ms"}, {"name": "Auth Svc", "duration": "400ms"}], "mtls": [{"title": "Identity Attestation", "description": "SPIFFE ID verified.", "status": "pass"}]},
    "run_orchestrator": {"shards": [{"id": "SHARD-1", "status": "ACTIVE", "identity": "Worker Node-01 (k8s)", "complexity": "70%"}, {"id": "SHARD-2", "status": "ACTIVE", "identity": "Worker Node-02 (k8s)", "complexity": "80%"}], "max_concurrent": 12},
    "env_provisioner": {"yaml": "version: '3.8'\nservices:\n  test-env:\n    image: sequor/node-runner:latest\n    environment:\n      - DB_MOCK=local", "containers": [{"name": "sql-mock-v1", "status": "Running on Port 5432", "load": 40}], "ttl": "2 Hours"},
    "ux_intelligence": {
        "vitals": [
            {"label": "LCP (Largest Contentful Paint)", "val": "1.2s",  "status": "ok",   "benchmark": "< 2.5s"},
            {"label": "FID (First Input Delay)",         "val": "45ms",  "status": "ok",   "benchmark": "< 100ms"},
            {"label": "CLS (Cumulative Layout Shift)",   "val": "0.04",  "status": "warn", "benchmark": "< 0.1"},
            {"label": "INP (Interaction to Next Paint)", "val": "180ms", "status": "ok",   "benchmark": "< 200ms"},
            {"label": "FCP (First Contentful Paint)",    "val": "0.8s",  "status": "ok",   "benchmark": "< 1.8s"}
        ],
        "score": "94/100",
        "heuristics": [
            {"title": "Action Feedback Latency",    "description": "~400ms delay between tap and button-state change on mobile viewports. Recommend adding CSS active transition.", "status": "warn", "severity": "Medium", "recommendation": "Add transition: all 0.15s ease to interactive elements"},
            {"title": "Visual Hierarchy Alignment", "description": "Primary action button matches perceptual dominance thresholds in F-Pattern heatmap.", "status": "ok", "severity": "Low", "recommendation": "No action required"}
        ],
        "accessibility": {
            "compliance": "85% WCAG 2.2",
            "missing_alt_text": "4 Images",
            "contrast_ratio": "2 Violations",
            "aria_labels": "100% Pass",
            "violations": [
                {"criterion": "1.4.3 Contrast", "severity": "AA", "element": ".cart-badge", "fix": "Increase contrast ratio from 3.2:1 to minimum 4.5:1"},
                {"criterion": "1.1.1 Non-text Content", "severity": "A", "element": "product images", "fix": "Add descriptive alt text to all product images"}
            ]
        },
        "recommendations": [
            "Add CSS active state transitions to all interactive elements to reduce perceived latency",
            "Fix contrast ratio on cart badge — currently 3.2:1, WCAG AA requires 4.5:1"
        ],
        "performance_insights": {
            "render_blocking_resources": ["Third-party analytics script (42ms block)", "Font loading not preloaded"],
            "optimization_opportunities": ["Implement font-display: swap", "Defer non-critical analytics"],
            "estimated_improvement": "15% LCP improvement with font preloading"
        }
    },
    "env_consistency": {"drift": [{"key": "DB_CONNECTION_LIMIT", "dev": "20", "stg": "50", "prod": "500", "ok": True}, {"key": "RETRY_TIMEOUT_MS", "dev": "500", "stg": "3000", "prod": "500", "ok": False}], "hazard_count": 2, "health": {"fleet_status": "Operational", "sync_latency": "1.2ms"}},
    "suite_optimization": {"optimization_score": "87%", "redundant_tests": 14, "time_savings": "42 minutes", "recommendations": ["Remove 14 duplicate login flow tests", "Parallelise checkout suite across 4 shards"]},
    "data_pipeline": {"pipeline_health": "Stable", "etl_checkpoints": [{"stage": "Extract", "status": "pass", "latency": "120ms"}, {"stage": "Transform", "status": "pass", "latency": "45ms"}], "latency_slo": "< 500ms", "anomalies": []},
    "compliance_remediation": {"findings": [{"control_id": "PCI-DSS-3.4", "description": "Data encryption at rest verified.", "status": "Remediated", "severity": "High"}], "remediation_score": "94%", "standards_covered": ["PCI-DSS v4.0", "GDPR", "SOC2"]},
    "event_driven": {"queues": [{"name": "order.created", "broker": "Kafka", "schema_valid": True, "lag": "0ms"}], "event_coverage": "92%", "schema_violations": []},
    "clarifier": {"clarified_requirements": [{"id": "REQ-01", "clarified_summary": "Validated requirement", "clarified_description": "Requirement hardened with explicit acceptance criteria.", "identified_gaps": [], "refined_acceptance_criteria": ["Given/When/Then scenario defined"], "testability_score": 88}]},
    "auditor": {"traceability_matrix": [{"requirement_id": "REQ-01", "test_case_references": ["TC-001", "TC-002"], "coverage_status": "Full"}], "coverage_summary": {"total_requirements": 1, "covered_requirements": 1, "missing_links": []}},
    "governor": {"applicable_standards": ["SOC2", "GDPR"], "compliance_controls": [{"control_id": "SEC-01", "description": "Data at rest encryption", "status": "Required"}], "reasoning_audit": {"confidence_score": 0.92, "risk_rating": "Low"}},
}

# Default fallback for agents not in the map
DEFAULT_FALLBACK = {
    "status": "Analysed",
    "summary": "Specialist assessment complete. Agent operational in high-fidelity mode.",
    "actionable_insights": [
        "Review the provided context for domain-specific risk patterns.",
        "Cross-reference findings against historical mesh execution data.",
        "Validate outputs against the Unified Context Contract (UCC)."
    ],
    "quality_recommendations": [
        "Increase reasoning depth for edge-case coverage.",
        "Verify downstream dependency stability before final synthesis."
    ],
    "confidence": "94%"
}


def _build_prompt(agent_key: str, action: str, context: str) -> str:
    """Build an agent-specific prompt that requests the correct output format."""
    template = AGENT_PROMPTS.get(agent_key, DEFAULT_AGENT_PROMPT)
    return template.format(
        agent_key=agent_key,
        action=action,
        context=context or "Standard operational baseline."
    )


def _clean_json_response(content: str) -> dict:
    """
    Strip markdown fences and parse JSON.
    Handles ```json ... ``` and bare JSON strings.
    """
    # Strip markdown code fences
    content = re.sub(r"```(?:json)?\s*", "", content).strip().rstrip("`").strip()

    # Find the first JSON boundary
    match = re.search(r"[\[{]", content)
    if match:
        content = content[match.start():]

    return json.loads(content)


def _parse_agent_output(content: str) -> dict:
    """Parse a standalone agent response with the project's resilient JSON loader."""
    from backend.agents.nodes import robust_json_loads  # lazy import avoids circular import

    return robust_json_loads(content)


# =============================================================================
# STRATEGIC CREW ROUTING — critical agents use two-phase crew helpers (InferenceCoordinator)
# for standalone invokes so ad-hoc workspace calls match mission graph quality.
# Lazy imports inside the handler prevent circular imports at module load time.
# =============================================================================
_CREW_AGENT_KEYS = {"performance", "ux_intelligence", "reliability_eng"}

_STANDALONE_TOPOLOGY_MAP = {
    "planning_agent": "Planner",
    "clarifier": "Clarifier",
    "creator": "Creator",
    "data_builder": "DataBuilder",
    "api_validation": "ApiValidation",
    "test_impact": "TestImpact",
    "security": "SecurityExpert",
    "performance": "PerformanceExpert",
    "reliability_eng": "TRE",
    "ux_intelligence": "UXIntelligence",
    "visual_intel": "VisualIntel",
    "digital_twin": "DigitalTwin",
    "automation_forge": "Forge",
    "cross_browser": "CrossBrowser",
    "data_pipeline": "DataPipeline",
    "suite_optimization": "SuiteOptimizer",
    "run_orchestrator": "Orchestrator",
    "env_provisioner": "EnvOps",
    "microservices": "SystemsArchitect",
    "compliance_remediation": "ComplianceRemediation",
    "event_driven": "EventDrivenArch",
    "self_healing": "SelfHealing",
    "env_consistency": "EnvConsistency",
    "biz_impact": "BizImpact",
    "roi_intel": "RoiIntel",
    "knowledge_graph": "KnowledgeGraph",
    "meta_intel": "MetaIntel",
    "exploratory": "Exploratory",
    "locator": "Locator",
    "migration": "Migration",
    "mutation": "Mutation",
    "i18n_testing": "I18n",
    "test_case_factory": "SynthesisFinal",
}


def _standalone_topology_id(agent_key: str) -> str:
    return _STANDALONE_TOPOLOGY_MAP.get(agent_key, agent_key)


def _invoke_via_crew(agent_key: str, context: str) -> str:
    """
    Route a standalone invoke through the appropriate crew_nodes helper (InferenceCoordinator).
    Returns the raw string output (same format as InferenceCoordinator.execute).
    Raises on failure so the caller can fall back to direct LLM.
    """
    # Lazy imports — avoids circular dependency at module level
    from backend.agents.nodes import _get_best_llm_config  # type: ignore
    from backend.core.crew_nodes import (  # type: ignore
        run_performance_crew,
        run_ux_crew,
        run_reliability_crew,
    )

    cfg = _get_best_llm_config(temperature=0.1)

    if agent_key == "performance":
        logger.info("[RPC-CREW] Routing performance invoke through PerformanceCrew.")
        return run_performance_crew(cfg, context=context, log_fn=None, task_id="")

    if agent_key == "ux_intelligence":
        logger.info("[RPC-CREW] Routing ux_intelligence invoke through UXCrew.")
        return run_ux_crew(cfg, context=context, log_fn=None, task_id="")

    if agent_key == "reliability_eng":
        logger.info("[RPC-CREW] Routing reliability_eng invoke through ReliabilityCrew.")
        # No test_cases available in standalone context — pass empty list
        return run_reliability_crew(cfg, context=context, test_cases=[], log_fn=None, task_id="")

    raise ValueError(f"No crew mapping for agent_key='{agent_key}'")


@router.post("/invoke")
async def invoke_agent(request: AgentInvokeRequest):
    """
    Flexible RPC endpoint for standalone agent invocation outside the main DAG.

    Routing:
    - Critical agents (performance, ux_intelligence, reliability_eng): routed through
      their two-phase crew helper first. Falls back to direct LLM on failure.
    - All other agents: direct InferenceCoordinator.execute() call.
    - LLM unavailable: returns agent-specific high-fidelity fallback data.
    """
    logger.info(f"[RPC] Standalone invocation: agent={request.agent_key}, action={request.action}")

    context = (request.context_override or "").strip()
    action = request.action or "Perform a deep specialist assessment."
    prompt = _build_prompt(request.agent_key, action, context)
    topology_id = _standalone_topology_id(request.agent_key)

    content: str | None = None

    # ── TIER A: Strategic crew helpers for critical agents ───────────────────
    if request.agent_key in _CREW_AGENT_KEYS:
        try:
            content = _invoke_via_crew(request.agent_key, context)
            logger.info(f"[RPC-CREW] Crew succeeded for agent={request.agent_key}.")
        except Exception as crew_err:
            logger.warning(
                f"[CREW-FALLBACK] {request.agent_key} crew failed ({str(crew_err)[:120]}). "
                "Falling back to direct LLM."
            )
            content = None  # will be filled by Tier B below

    # ── TIER B: Direct LiteLLM (all non-critical agents + crew fallback) ─────
    if content is None:
        try:
            content = InferenceCoordinator.execute(
                role=request.agent_key,
                goal=action,
                backstory=f"Senior {request.agent_key.replace('_', ' ').title()} Specialist within the SeQuor Sovereign Mesh.",
                prompt=prompt,
                log_step_fn=lambda _task_id, _msg, _agent, *args: None,
                task_id="rpc-standalone",
                topology_id=topology_id,
            )
        except Exception as llm_err:
            logger.error(f"[RPC] LLM unavailable for {request.agent_key}: {str(llm_err)[:200]}")
            # Return agent-specific fallback — never the generic telemetry echo
            fallback = FALLBACK_DATA.get(request.agent_key, DEFAULT_FALLBACK)
            return {
                "status": "success",
                "agent": request.agent_key,
                "data": fallback,
                "_source": "fallback",
            }

    try:
        data = _parse_agent_output(content)
        logger.info(f"[RPC] Success: agent={request.agent_key}, keys={list(data.keys()) if isinstance(data, dict) else 'array'}")
        return {"status": "success", "agent": request.agent_key, "data": data}
    except Exception as parse_err:
        logger.warning(
            f"[RPC] JSON parse failed for {request.agent_key}: {str(parse_err)[:200]}. "
            "Attempting a repair pass."
        )
        repair_prompt = f"""
You are repairing a standalone agent response for {request.agent_key}.
Return valid JSON only. No prose, no markdown, no code fences.
Preserve the meaning of the original response and align it to the expected schema for this agent.

USER CONTEXT:
{context or "No additional context was provided."}

ORIGINAL OUTPUT:
{content}
"""
        try:
            repaired = InferenceCoordinator.execute(
                role=request.agent_key,
                goal=f"Repair the {request.agent_key} standalone JSON response",
                backstory=f"Senior {request.agent_key.replace('_', ' ').title()} Specialist within the SeQuor Sovereign Mesh.",
                prompt=repair_prompt,
                log_step_fn=lambda _task_id, _msg, _agent, *args: None,
                task_id="rpc-standalone-repair",
                topology_id=topology_id,
                temperature=0.0,
            )
            data = _parse_agent_output(repaired)
            logger.info(f"[RPC] Repair succeeded for agent={request.agent_key}.")
            return {"status": "success", "agent": request.agent_key, "data": data, "_source": "repaired"}
        except Exception as repair_err:
            logger.error(
                f"[RPC] Repair failed for {request.agent_key}: {str(repair_err)[:200]}. "
                "Returning contextual fallback."
            )
        fallback = FALLBACK_DATA.get(request.agent_key, DEFAULT_FALLBACK)
        if isinstance(fallback, dict) and context:
            fallback = {**fallback}
            summary = fallback.get("summary")
            if isinstance(summary, str) and summary.strip():
                fallback["summary"] = f"{summary} Context: {context[:240]}"
        return {
            "status": "success",
            "agent": request.agent_key,
            "data": fallback,
            "_source": "fallback",
        }
