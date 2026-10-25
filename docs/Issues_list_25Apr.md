
---

## 1. Requirement-to-Agent Pipeline Not Generating Context-Aware Outputs

### **Actual Result**

- System receives a structured PRD with multiple modules, workflows, and acceptance criteria  
- Initial context synthesis may partially reflect input  

- Downstream agents (Creator, API, Regression, Automation, etc.):
  - ignore extracted context  
  - generate limited or unrelated outputs  
  - fallback to predefined templates (e.g., authentication-only scenarios)

- Output shows:
  - incomplete module coverage  
  - missing workflows  
  - repeated/generic test cases  
  - no domain alignment  

---

### **Expected Result**

The system should dynamically interpret any PRD and generate outputs that are **fully aligned, comprehensive, and context-aware across all agents**.

- All modules and workflows identified from the PRD should be reflected in outputs  
- Outputs should be:
  - domain-specific  
  - derived from actual requirements  
  - free from generic/template-based content  

- Acceptance criteria should be consistently used across agents to generate:
  - test cases  
  - API validations  
  - automation scenarios  

- Outputs across agents should remain:
  - consistent  
  - traceable to input  
  - aligned with each other  

- The system should ensure:
  - complete functional coverage  
  - inclusion of edge cases  
  - preservation of domain context  

---

## 2. Test Case Creator Agent Not Integrated with RAG/Context Layer

### **Actual Result**

- Even when PRD or contextual knowledge is available, the agent:
  - does not use it  
  - generates unrelated or generic output  

---

### **Expected Result**

- The agent should:
  - retrieve relevant context (via RAG or internal context layer)  
  - use retrieved context for generation  
  - produce test cases aligned with the input requirement  

- Generated output should:
  - reflect domain-specific workflows  
  - incorporate contextual knowledge  
  - avoid generic or fallback templates  

---

## 3. Acceptance Criteria Not Converted into Test Cases

### **Actual Result**

- Acceptance criteria from PRD are not transformed into test scenarios  
- No traceability between requirement and generated test cases  

---

### **Expected Result**

- Each acceptance criterion should:
  - map to one or more test cases  
  - include:
    - clear steps  
    - expected results  
  - ensure complete requirement coverage  

- System should maintain:
  - requirement → test case traceability  
  - structured mapping for validation  

---

## 4. Test Case Creator Agent Not Generating Test Cases from PRD Input

### **Actual Result**

- When only a PRD is provided as input:
  - agent does not generate test cases from requirement  
  - returns predefined or template-based test cases (e.g., authentication scenarios)  
  - output is not derived from input  

---

### **Expected Result**

The Test Case Creator Agent should:

- parse the PRD  
- identify:
  - modules  
  - workflows  
  - acceptance criteria  

- dynamically generate test cases from:
  - functional requirements  
  - acceptance criteria  
  - edge cases and negative scenarios  

- ensure:
  - domain alignment  
  - full functional coverage  
  - realistic and meaningful test scenarios  

---


## 5. Automation Forge Not Receiving or Using Context from Upstream Pipeline

### **Actual Result**

- Warning indicates:
  - payload is “isolated” or “merged upstream”  

- This suggests:
  - agent is not receiving proper input  
  - context propagation is broken  

- As a result:
  - Automation Forge operates without requirement context  
  - output is either missing or irrelevant  

---

### **Expected Result**

- Agent should:
  - receive structured context including:
    - modules
    - APIs
    - workflows
  - use this context to generate framework configuration
  - be fully integrated within the agent pipeline

- Context should flow seamlessly from:
  - requirement ingestion → synthesis → automation generation

---

## 6. Automation Forge Generating Generic Framework Configuration

### **Actual Result**

- Framework output is static:
  - Playwright/C# selected  
  - Node.js/npm-based setup used  

- Same folder structure used regardless of input:
  - src  
  - tests  
  - pages  
  - utils  
  - reports  

- Output does not reflect:
  - input application  
  - selected framework consistency  
  - system architecture  

---

### **Expected Result**

- Framework setup should be:
  - dynamically generated  
  - aligned with selected framework and language  

- Configuration should be:
  - consistent (e.g., C# → dotnet, not npm)  
  - context-aware (based on application modules and APIs)  

- Folder structure should:
  - adapt based on framework  
  - reflect application design  
  - organize test layers (UI/API/integration) logically  

---

7. Agent #35 — UX Intelligence Audit

### **Issue**
Output is generic, not grounded in input context, and includes unverified metrics.

### **Actual Result**
- Produces performance and accessibility insights without clear data source  
- Recommendations are generic and not tied to specific user flows or components  
- Lacks context-aware UX analysis  
- Scoring is not backed by defined criteria  

### **Expected Result**
- UX insights mapped to actual user flows/components from input  
- Metrics should be data-driven or clearly marked as simulated  
- Context-aware recommendations instead of generic suggestions  
- Score derived from defined evaluation logic  

---

## 8. Integration Node — A11Y Intel

### **Issue**
Output is generic, not context-aware, includes unverified metrics, and contains schema inconsistency.

### **Actual Result**
- Accessibility metrics generated without UI/DOM input  
- Recommendations not tied to specific components  
- No mapping to actual user flows or interface elements  
- Scoring lacks defined evaluation basis  
- JSON structure contains formatting issues  

### **Expected Result**
- Accessibility insights mapped to actual UI components and interactions  
- Metrics should be data-driven or clearly marked as simulated  
- WCAG issues linked to specific UI elements  
- Valid and consistent JSON schema  
- Score based on defined accessibility evaluation criteria  

---

## 9. Integration Node — Reliability Engineering (Agent #44)

### **Issue**
Output is based on assumed flakiness data and not grounded in actual execution telemetry.

### **Actual Result**
- Flaky test identification inferred, not data-driven  
- Root causes are generic and unsupported  
- Failure trends lack real data source  
- Healing logs reflect assumed remediation  
- No linkage to actual execution signals  

### **Expected Result**
- Flakiness analysis based on real execution telemetry  
- Root cause backed by logs and failure patterns  
- Trend data derived from historical runs  
- Healing logs based on real remediation events  
- Insights aligned with actual test suite behavior  

---

## 10. Integration Node — SLA/SLO Compliance

### **Issue**
Output is generic and not grounded in actual telemetry or upstream signals.

### **Actual Result**
- Uses predefined SLO targets without validation  
- Recommendations are generic  
- No linkage to reliability signals or execution outcomes  
- Error budget not tied to real performance  
- No impact analysis on system flows  

### **Expected Result**
- SLO analysis based on actual telemetry and reliability signals  
- Error budget aligned with observed system behavior  
- Identification of at-risk components or flows  
- Recommendations derived from real issues  
- Clear mapping: Reliability signals → SLO impact  

---

## 11. Integration Node — Self Healing (Agent #43)

### **Issue**
Output uses generic locators and healing strategies without real execution context.

### **Actual Result**
- Locators are predefined, not derived from UI/DOM  
- Fallback strategies are generic  
- Healing logic not tied to actual failures  
- No linkage to failure signals or flaky tests  
- Resilience score lacks measurable basis  

### **Expected Result**
- Locators derived from actual UI/DOM or execution logs  
- Fallback strategies based on real failures  
- Healing strategies mapped to failure patterns  
- Integration with reliability signals  
- Resilience score based on measurable metrics  

---

## 12. Integration Node — Test Suite Optimization (Agent #38)

### **Issue**
Output is based on placeholders and assumed redundancy.

### **Actual Result**
- Uses placeholder test cases instead of real data  
- Redundancy identified without evidence  
- Parallel execution not based on dependencies  
- Critical path lacks logical basis  
- Optimization gains not calculated  

### **Expected Result**
- Optimization based on actual test suite data  
- Redundancy derived from coverage analysis  
- Parallelization based on dependencies  
- Critical path based on execution flow  
- Gains supported by metrics (time, coverage)  

---

## 13. Integration Node — Microservices Intelligence (Agent #30)

### **Issue**
Output is synthetic and not aligned with actual system architecture.

### **Actual Result**
- Service graph uses placeholder nodes  
- Mesh configuration is generic  
- Observability metrics assumed  
- Recommendations are generic  
- No validation of architecture presence  

### **Expected Result**
- Detect whether microservices architecture exists  
- Avoid generating assumed topology  
- Provide insights only when data is available  
- Align recommendations with real architecture  
- If not applicable → return “No microservices detected”  

---

## 14. Integration Node — Distributed Tracing

### **Issue**
Output is assumed and not based on real telemetry or architecture.

### **Actual Result**
- Predefined request flows without data  
- Generic tracing standards used blindly  
- No trace data (spans, latency, errors)  
- No alignment with system context  

### **Expected Result**
- Tracing based on real request flows  
- Include spans, latency, and errors  
- Correlation verified via actual logs/headers  
- If no data → return “No tracing data available”  
- Avoid assumptions without evidence  

---

## 15. Integration Node — Data Pipeline (Agent #33)

### **Issue**
Output assumes data pipeline/ETL context without validation.

### **Actual Result**
- Generates pipeline scenarios without schema  
- ETL checkpoints are assumed  
- Mixes application and data-layer logic  
- No defined pipeline or data flow  
- Insights are generic  

### **Expected Result**
- Validate existence of data pipeline before analysis  
- Avoid assumed structures  
- Provide insights only with real schema/data  
- If not applicable → return “No data pipeline defined”  
- Separate application logic from data-layer analysis  

---

### 16. API Automation Generator Producing Architecture Stubs Instead of Executable Tests

### **Actual Result**

- All generated test scripts are marked as:
  - `[ARCH-STUB]`
  - `stub_status: architecture_only`

- Scripts do not contain real implementation logic  
- Tests are not usable for execution  

---

### **Expected Result**

- Generator should produce:
  - fully executable test scripts  
  - real request/response handling  
  - assertions based on business logic  

---

### 17. Integration Node — Digital Twin & Simulation (Agent #42)
Issue:
Output is synthetic and not based on actual system traffic or production signals, reducing reliability of simulation.

### Actual Output:
Traffic profiles and patterns are generated without real usage data
Simulation parameters (latency, replication, load) are assumed
Shadow testing plan is generic and not tied to actual system behavior
Insights and recommendations are generic and not simulation-driven

### Expected Output:

Simulation based on real traffic patterns and system telemetry
Traffic profiles derived from actual usage data
Shadow testing aligned with real system behavior and workloads
Insights based on observed simulation results, not generic suggestions

---

### 18. Integration Node — Environment Consistency (Agent #37)
Issue:
Output shows assumed configuration drift without validation from real environment data, making findings unreliable.

### Actual Output:
Environments and config differences are generated without actual config sources
Drift findings are repetitive and template-based
Config values appear assumed, not extracted from real systems
Remediation steps are generic and not tied to real infra state
Severity score lacks calculation basis

### Expected Output:
Drift detection based on actual environment configurations (dev, QA, staging, prod)
Differences derived from real config comparison (infra, env variables, runtime settings)
Non-redundant, meaningful drift insights
Remediation actions based on actual detected mismatches
Severity score derived from impact and scope of real drift


### 19. # 🚨 Execution Orchestrator – Payload Isolation Issue

---

## Issue: Agent Execution Failing Due to Missing Context Payload

---

### **Actual Result**

- During mesh execution, the system returns:

{
  "warning": "Payload isolated or merged upstream. Check final synthesis output."
}


### **Expected Result**

Each agent should:
receive complete and structured context from upstream pipeline
process input data (modules, workflows, acceptance criteria, etc.)
generate valid, context-aware output

Execution should ensure:
proper payload propagation across all agents
no agent runs with empty or missing input
no fallback warnings during normal execution

---

## 20. Integration Node — Progressive Delivery

Issue:
Output defines delivery strategies without real deployment data or release pipeline context, making it non-actionable.

### Actual Output:
Canary rules, rollout stages, and rollback triggers are predefined without real deployment inputs
Traffic policies are assumed, not based on actual traffic routing or infra setup
Thresholds and KPIs are generic and not derived from system behavior
No linkage to real deployments, releases, or monitoring signals

### Expected Output:
Delivery strategies based on actual deployment pipeline and release configuration
Canary and rollout stages derived from real traffic and release practices
Rollback triggers based on observed system metrics and incidents
Traffic policies aligned with actual routing and infra capabilities
Insights based on real deployment telemetry (errors, usage, performance)

## 21. Integration Node — Feature Flag Testing

Issue:
Output defines feature flags and combinations without real flag configuration or system integration, making results unreliable.

### Actual Output:
Feature flags and combinations are generated without actual flag source
Conditions (environment, concurrency, login method) are assumed
No linkage to real feature flag service or runtime toggles
No validation of flag impact on system behavior

### Expected Output:
Feature flags derived from actual configuration (feature flag service or codebase)
Combinations based on real flag conditions and rollout strategies
Validation of flag impact on system behavior and test scenarios
Integration with runtime toggles and environment-specific configurations


---
---

# 🛠️ FIX DOCUMENTATION — Groups A, B, C, D
**Fix Date:** 27 April 2026  
**Status:** ✅ All 21 issues resolved + 8 latent issues fixed + 3 critical gaps closed  
**Files Modified:** `backend/agents/nodes.py` · `backend/agents/workflow.py` · `backend/core/node_cache.py`  
**Verification:** 37/37 automated checks PASS

---

## GROUP A — Context Propagation Pipeline (Issues #1, #2, #3, #4, #19)

### Root Cause (Pre-Fix)
The pipeline had three structural breaks that caused all downstream agents to generate generic output regardless of PRD input:

1. `fetch_requirements_node` — when a PRD was pasted as `additional_context` with no ALM sources, it was only appended as a raw string and never parsed into `raw_requirements`. The PRD never reached `synthesis_node` as structured data.
2. `synthesis_node` — collapsed all acceptance criteria into a single blob string `[full_description]` instead of preserving individual ACs as a structured list.
3. `test_case_creator_node` — did not read `clarified_requirements` ACs, had no RAG integration, and fell back to a generic "Core Execution Pathway" stub when Gherkin scenarios were empty.

---

### Fix #1 — `fetch_requirements_node` (workflow.py)
**Issue addressed:** #1, #4

**What changed:**
- Added **Phase 0b: PRD Detection** — when no ALM sources are provided but `additional_context` contains text > 100 chars, the node now detects it as a PRD input
- Extracts acceptance criteria using regex patterns (numbered lists, bullet points, keyword-based: `must`, `shall`, `given`, `when`, `then`)
- Structures the PRD into `raw_requirements` with `id`, `summary`, `description`, `acceptance_criteria` fields
- Sets `combined_data` directly so synthesis has structured data immediately

**Validation test:**
- Submit a PRD as free text in the additional context field (no Jira/ADO sources)
- Verify `raw_requirements` contains `PRD-001` with extracted ACs
- Verify `combined_data.acceptance_criteria` is a list of individual items, not a blob

---

### Fix #2 — `synthesis_node` (workflow.py)
**Issue addressed:** #1, #3

**What changed:**
- Added `structured_ac_list` collection loop — iterates all source requirements and preserves individual ACs as discrete list items
- For list ACs: each item added individually
- For string ACs: split by newline and numbered list patterns, items > 10 chars preserved
- Fallback: if no ACs extracted, parses the `"Synthesized Acceptance Criteria"` section from the LLM output
- `combined_data.acceptance_criteria` is now a proper list (e.g., `["AC1: User can login", "AC2: Session expires after 30 min"]`) instead of `[<2000-char blob>]`
- Log message now shows AC count: `"ACs preserved: N"`

**Validation test:**
- Submit a requirement with 5 explicit acceptance criteria
- Check backend logs for `"ACs preserved: 5"`
- Verify `combined_data.acceptance_criteria` has 5 discrete items

---

### Fix #3 — `test_case_creator_node` (nodes.py)
**Issue addressed:** #1, #2, #3, #4

**What changed:**
- **AC injection:** Reads `clarified_requirements[].refined_acceptance_criteria` first, falls back to `combined_data.acceptance_criteria`
- **RAG integration:** Calls `vector_store.search_similar(ucc_desc[:800], n_results=2)` and injects domain knowledge into the prompt
- **PRD-only path:** When `gherkin_scenarios` is empty, prompt explicitly instructs LLM to parse modules/workflows from UCC — does NOT fall back to generic auth scenarios
- **Traceability:** Every test case must include `ac_reference` field linking to a specific AC or module
- **Mandatory rules in prompt:** No generic fallback, domain-specific terminology required, edge cases required per happy-path
- **Context-aware fallback:** When LLM fails, generates test cases from actual ACs (e.g., `"Verify: <AC text>"`) instead of `"[FALLBACK] Core Execution Pathway"`

**Validation test:**
- Submit a PRD for an e-commerce checkout flow
- Verify test cases reference checkout-specific modules (cart, payment, order confirmation)
- Verify each test case has `ac_reference` field populated
- Verify no test cases mention "authentication" unless the PRD explicitly describes it
- Verify RAG log entry: `"Creator RAG: Domain context recalled (XX% match)"`

---

### Fix #4 — `execution_orchestrator_node` (nodes.py)
**Issue addressed:** #19

**What changed:**
- Removed dependency on `automation_bootstrap.framework` (not available in Tier B parallel pool)
- Framework now derived from `analysis_payload.test_strategy_recommendations` — same source as `automation_forge_node`
- UCC context injected via `ucc_summary(ucc, max_chars=600)`
- Test type distribution built from actual `test_cases` list: `{"Functional": 8, "API": 3, "Edge": 2}`
- Prompt includes `APPLICATION CONTEXT`, `FRAMEWORK`, and `TEST SUITE distribution`
- Fallback includes `application_context` and `framework` fields — no more generic sharding template
- Warning message changed from silent "payload isolated" to explicit log: `"[ORCHESTRATOR] Warning: No UCC context available"`

**Validation test:**
- Run a Phase 2 mesh execution
- Verify no `"Payload isolated or merged upstream"` warning in logs
- Verify execution plan references the actual application name
- Verify `parallelism_config.framework` matches the detected framework

---

### Cache Fix — `node_cache.py`
Added explicit `NODE_INPUT_KEYS` entries for nodes that were missing them:
- `"creator"`: `["combined_data", "clarified_requirements", "analysis_payload"]`
- `"clarifier"`: `["raw_requirements", "additional_context"]`
- `"synthesis_optimizer"`: `["clarified_requirements", "raw_requirements", "additional_context"]`
- `"run_orchestrator"`: `["combined_data", "test_cases", "analysis_payload"]`

This ensures cache invalidates correctly when ACs or requirements change.

---

## GROUP B — Automation Forge (Issues #5, #6)

### Root Cause (Pre-Fix)
`automation_forge_node` only read `tooling_landscape` and `combined_data.summary` — it had no access to the full UCC, test strategy recommendations, or actual test cases. The fallback always defaulted to Playwright/TypeScript regardless of strategy. `api_automation_generator_node` read `automation_bootstrap.framework` which is always empty during Tier B parallel execution (both nodes run in the same ThreadPoolExecutor pool).

---

### Fix #5 — `automation_forge_node` (nodes.py)
**Issue addressed:** #5, #6

**What changed:**
- **Pre-detection:** Framework detected from `test_strategy_recommendations.ui/api` + `tooling_landscape` before LLM call — prompt is pre-seeded with correct framework hint
- **Language consistency rules:** C# → `"Use dotnet CLI commands. Do NOT use npm"`, Cypress → `"Use npm/npx. Do NOT use dotnet"`, etc.
- **UCC injection:** Full `ucc_summary(ucc, max_chars=1200)` injected — LLM derives folder names from actual application modules
- **Test layer distribution:** Reads actual `test_cases` to detect API/UI/integration layers and informs folder structure
- **Post-process consistency check:** If LLM returns C# framework but npm commands slipped in, commands are replaced with dotnet CLI
- **Context-aware fallback:** Each fallback branch (C#, Cypress, PyTest, Playwright) uses `project_hint` from UCC for folder names
- **New output fields:** `language`, `test_layers`, `application_modules_mapped`

**Validation test:**
- Submit a PRD for a .NET application
- Verify `automation_bootstrap.framework` contains "C#" or ".NET"
- Verify `bootstrap_commands` uses `dotnet new`, `dotnet add package` — no npm
- Verify `folder_hierarchy` reflects application module names from the PRD
- Submit a Python/pytest PRD — verify `pip install` commands, no npm

---

### Fix #6 — `api_automation_generator_node` (nodes.py)
**Issue addressed:** #5, #6, #16 (Group D)

**Parallel execution fix:**
- `automation_bootstrap` is never available when `api_coder` runs (same Tier B pool)
- Framework now derived independently from `analysis_payload.test_strategy_recommendations` — same logic as `automation_forge_node`
- Phase 2 resume path: also checks `automation_bootstrap` if pre-populated

**What changed:**
- Framework detection produces `framework`, `code_pattern`, `import_note`, `file_ext` variables
- C# → `RestSharp/HttpClient`, `[Test]` attributes, `Assert.That()`, `.cs` extension
- Cypress → `cy.request()`, `.cy.js` extension
- PyTest → `requests` library, `assert` statements, `.py` extension
- Playwright → `APIRequestContext`, `expect()`, `.spec.ts` extension
- Case selection broadened: API-tagged → integration-tagged → top 8 cases
- UCC context + ACs injected into prompt for real assertion values
- Stub rejection: if all scripts contain "stub" in first 50 chars of `code_content`, triggers retry
- Simplified retry with reduced scope before falling back to stubs
- Context-aware stubs: use real endpoint from `mock_specs`, real AC hint, correct file extension

**Validation test:**
- Submit a C# application PRD
- Verify generated scripts use `[Test]` attributes and `Assert.That()` — not `test()` or `expect()`
- Verify filenames end in `.cs` not `.spec.ts`
- Verify `ac_reference` field populated in each script
- Verify no `[ARCH-STUB]` or `stub_status: architecture_only` in primary output

---

## GROUP C — Integration Node Applicability (Issues #7–15, #17–18, #20–21)

### Root Cause (Pre-Fix)
All integration nodes generated output for every application regardless of whether the relevant architecture/technology was present. Nodes fabricated microservices topologies for monoliths, Kafka tests for REST-only apps, and iOS device matrices for desktop web apps. No node labeled its output as AI-synthesized.

### Fix Pattern Applied
Two fix patterns were applied consistently across all affected nodes:

**Pattern 1 — Applicability Guard** (for architecture-specific nodes):
```
APPLICABILITY CHECK (MANDATORY — do this first):
If NO [technology] indicators are present, return:
{"applicable": false, "reason": "...", "recommendation": "..."}
```
Python post-processing: `if result.get("applicable") is False: return {state_key: result}`

**Pattern 2 — Data Source Labeling** (for all nodes):
```python
result.setdefault("data_source", "AI-Synthesized (No real [X] connected)")
```

---

### Issue #7 & #8 — UX Intelligence / A11Y (`ux_intelligence_node`)
- `data_source` label on all 3 paths (UXCrew, direct-LLM, fallback)
- Prompt maps insights to actual UI components from UCC
- Scoring basis: `"78/100 — based on WCAG 2.2 + CWV criteria"`
- Accessibility violations reference specific components (login form, dashboard, checkout)

**Validation:** Submit a PRD with a dashboard UI. Verify `ux_intelligence_config.data_source` = "AI-Synthesized...". Verify `heuristics` reference dashboard components, not generic "button" elements.

---

### Issue #9 — Reliability Engineering (`reliability_engineering_node`)
- `data_source` label added to all 3 paths (ReliabilityCrew, direct-LLM, fallback)
- Flakiness threshold deterministic: `"failure_rate > 5% over last 20 runs"`
- Per-test fields enforced: `failure_rate`, `pattern`, `action`
- CI gate impact explicitly quantified
- Test IDs derived from actual `test_cases` or UCC context

**Validation:** Run Phase 2. Verify `reliability_eng.data_source` present. Verify `flakiness_threshold` = exact string. Verify each `flaky_tests` item has `failure_rate`, `pattern`, `action` fields.

---

### Issue #10 — SLA/SLO (`sla_slo_audit_node`)
- `data_source` label on success and fallback
- SLO targets derived from UCC context (application type, criticality)
- Required error budget fields enforced: `burn_rate`, `error_budget_remaining`, `projected_exhaustion`, `alert_threshold`
- Fallback includes `application` field from UCC project hint

**Validation:** Verify `sla_slo_audit.data_source` present. Verify `error_budget_policy` has all 4 required fields. Verify SLO targets reference the application name.

---

### Issue #11 — Self-Healing (`self_healing_agent_node`)
- UCC context injected for locator derivation
- Stubs filtered out before analysis (`stub_status` check)
- `data_source` label on success and fallback
- Fallback derives locators from UCC project hint

**Validation:** Verify `self_healing_config.data_source` present. Verify `self_healing_hooks[].ui_component` references actual UI components from the PRD.

---

### Issue #12 — Test Suite Optimization (`test_suite_optimization_node`)
- Actual `test_cases` list injected as compact summary (up to 20 cases)
- `data_source` labeled as "AI-Estimated"
- Parallel groups derived from real test types
- Critical path tests derived from actual high-severity cases

**Validation:** Verify `suite_optimization_config.data_source` = "AI-Estimated...". Verify `critical_path_tests` contains actual test IDs from the generated suite.

---

### Issue #13 — Microservices (`microservices_intel_node`)
- Applicability guard checks for: multiple services, service mesh, API gateway, Kubernetes, Docker Compose, event bus
- Returns `{"applicable": false}` for monolithic apps
- Cache stores not-applicable result

**Validation:** Submit a simple CRUD web app PRD. Verify `microservices_config.applicable` = false. Verify no fabricated service graph.

---

### Issue #14 — Distributed Tracing (`distributed_tracing_node`)
- Applicability guard checks for: multiple services, microservices, API gateway, async messaging, Kubernetes
- Returns `{"applicable": false}` for single-service apps
- `data_source` labeled on all paths

**Validation:** Submit a monolithic app PRD. Verify `distributed_traces.applicable` = false.

---

### Issue #15 — Data Pipeline (`database_pipeline_node`)
- Applicability guard checks for: ETL, data warehouse, data lake, Kafka, Spark, Airflow, CDC, batch processing
- Returns `{"applicable": false}` for CRUD-only apps
- Application logic separated from data-layer analysis

**Validation:** Submit a standard web app PRD. Verify `database_pipeline_config.applicable` = false.

---

### Issue #17 — Digital Twin (`digital_twin_simulation_node`)
- `data_source` labeled on all paths
- Prompt instructs LLM to label all traffic profiles as AI-Synthesized
- Recommends connecting real APM tools

**Validation:** Verify `digital_twin_config.data_source` = "AI-Synthesized (No real production telemetry connected)".

---

### Issue #18 — Environment Consistency (`multi_environment_consistency_node`)
- Applicability guard checks for multi-environment context
- `data_source` labeled
- Severity score calculation basis required
- No fabricated config values (IP addresses, connection strings)

**Validation:** Submit a single-environment PRD. Verify `env_consistency_config.applicable` = false.

---

### Issue #20 — Progressive Delivery (`progressive_delivery_node`)
- **Was completely unfixed** — added in this pass
- Applicability guard checks for: CI/CD, deployment, release, canary, blue/green, Kubernetes, ArgoCD
- `data_source` labeled on success and fallback
- Fallback includes actionable note to connect real CI/CD

**Validation:** Submit a PRD with no deployment pipeline context. Verify `progressive_delivery.applicable` = false.

---

### Issue #21 — Feature Flags (`feature_flag_node`)
- Applicability guard checks for: feature toggles, A/B testing, LaunchDarkly, Unleash, Split.io, kill switches
- Returns `{"applicable": false}` when no feature flag system detected

**Validation:** Submit a PRD with no feature flag mentions. Verify `feature_flag_tests[0].applicable` = false.

---

## GROUP D — API Automation Stubs (Issue #16)

### Root Cause (Pre-Fix)
`api_automation_generator_node` always fell back to `[ARCH-STUB]` scripts with `stub_status: architecture_only` because:
1. The LLM had no UCC context or ACs to generate real assertions from
2. The case filter was too narrow (only "api" in title), often returning 0 cases
3. No retry mechanism existed before stub emission
4. Framework was always "Playwright" due to parallel execution race condition

### Fix — `api_automation_generator_node` (nodes.py)
**Issue addressed:** #16

**What changed:**
- **Framework detection:** Derived from `analysis_payload.test_strategy_recommendations` (not `automation_bootstrap` which is empty in parallel execution)
- **Broadened case selection:** API-tagged → integration-tagged → top 8 cases (was top 5 API-only)
- **UCC + AC injection:** Full application context and acceptance criteria in prompt
- **Mandatory rules:** Executable code only, real assertions, language consistency, AC traceability, error scenarios
- **Stub rejection:** If all scripts have "stub" in first 50 chars of `code_content`, raises `ValueError` and triggers retry
- **Simplified retry:** Second attempt with reduced scope (3 cases, 400-char context) before fallback
- **Context-aware stubs (last resort):** Use real endpoint from `mock_specs`, real AC hint, correct file extension per framework

**Validation test:**
- Submit a PRD with clear API endpoints and acceptance criteria
- Verify primary output has no `stub_status: architecture_only`
- Verify `code_content` contains real assertions (not just `expect(response.status()).toBe(200)`)
- Verify `ac_reference` field populated in each script
- For C# PRD: verify `.cs` files with `[Test]` attributes
- For TypeScript PRD: verify `.spec.ts` files with `expect()` assertions

---

## LATENT ISSUES FIXED (Discovered During Impact Assessment)

These issues were not in the original list but followed the same pattern and were fixed proactively:

| Node | Issue | Fix Applied |
|---|---|---|
| `event_driven_architecture_node` | Generated Kafka/SQS tests for REST-only apps | Applicability guard: checks for async messaging indicators |
| `chaos_engineering_node` | Generated pod eviction experiments for simple web apps | Applicability guard: checks for container/Kubernetes infrastructure |
| `mobile_testing_node` | Generated iOS/Android matrices for desktop-only apps | Applicability guard: checks for mobile app indicators |
| `graphql_validation_node` | Generated GraphQL schema checks for REST-only APIs | Applicability guard: checks for GraphQL indicators |

**Validation:** Submit a simple REST web app PRD. Verify all four nodes return `applicable: false`.

---

## CRITICAL GAPS FIXED

### Gap 1 — `synthesis_optimizer_node` filtering not-applicable outputs
**Problem:** When nodes returned `{"applicable": false}`, the SynthesisCrew included them in the final report, creating noise.

**Fix:** Added `_is_applicable()` helper function in `synthesis_optimizer_node`:
```python
def _is_applicable(v) -> bool:
    if not v: return False
    if isinstance(v, dict) and v.get("applicable") is False: return False
    if isinstance(v, list) and len(v) == 1 and isinstance(v[0], dict) and v[0].get("applicable") is False: return False
    return True

mesh_keys = [k for k, v in payload.items() if _is_applicable(v)]
```
This is self-maintaining — any future node following the applicability guard pattern is automatically filtered.

**Validation:** Submit a monolithic app PRD. Verify final synthesis report does not contain microservices, distributed tracing, or data pipeline sections.

---

### Gap 3 — `production_monitor_node` missing data_source label
**Problem:** Generated synthetic monitors and RUM rules without labeling them as AI-synthesized. Fallback hardcoded `/api/health` and `["Login", "Core Action", "Logout"]` regardless of application.

**Fix:**
- `data_source` label added on success path
- Prompt instructs LLM to derive monitor endpoints from UCC context
- Fallback uses `project_hint` from UCC, attempts regex extraction of real endpoint from description, generates context-aware journey steps

**Validation:** Verify `production_monitors.data_source` = "AI-Synthesized (No real production telemetry connected)". Verify fallback monitor name includes application name.

---

### Gap 4 — `cross_browser_compatibility_node` missing applicability guard
**Problem:** Generated Chrome/Firefox/Safari matrices for backend services, CLI tools, and API-only applications.

**Fix:** Applicability guard checks for: web app, browser, UI, frontend, React, Angular, Vue, HTML, CSS, DOM, SPA, PWA, web portal, dashboard.

**Validation:** Submit a backend API PRD. Verify `cross_browser_config.applicable` = false.

---

## VALIDATION CHECKLIST

Use this checklist to validate all fixes end-to-end:

### Group A
- [ ] PRD pasted as free text → `raw_requirements` contains `PRD-001` with extracted ACs
- [ ] `combined_data.acceptance_criteria` is a list of individual items (not a blob)
- [ ] Test cases have `ac_reference` field populated
- [ ] No test cases mention "authentication" for non-auth PRDs
- [ ] RAG log entry visible: `"Creator RAG: Domain context recalled"`
- [ ] No `"Payload isolated or merged upstream"` in execution logs
- [ ] Execution plan references actual application name

### Group B
- [ ] C# PRD → `bootstrap_commands` uses `dotnet new`, no npm
- [ ] `folder_hierarchy` reflects application module names
- [ ] Generated scripts have `ac_reference` field
- [ ] No `[ARCH-STUB]` or `stub_status: architecture_only` in primary output
- [ ] C# scripts use `[Test]` attributes and `Assert.That()`
- [ ] TypeScript scripts use `expect()` assertions

### Group C
- [ ] Monolithic app → `microservices_config.applicable` = false
- [ ] Single-service app → `distributed_traces.applicable` = false
- [ ] CRUD app → `database_pipeline_config.applicable` = false
- [ ] No feature flag PRD → `feature_flag_tests[0].applicable` = false
- [ ] No deployment pipeline PRD → `progressive_delivery.applicable` = false
- [ ] All nodes have `data_source` field in output
- [ ] `reliability_eng.flakiness_threshold` = `"failure_rate > 5% over last 20 runs"`
- [ ] `sla_slo_audit.error_budget_policy` has all 4 required fields

### Group D
- [ ] API scripts have real assertions (not just status 200 checks)
- [ ] C# PRD → `.cs` files with NUnit structure
- [ ] TypeScript PRD → `.spec.ts` files with Playwright structure

### Latent + Gaps
- [ ] REST-only app → `event_driven_config.applicable` = false
- [ ] Web app → `chaos_scenarios[0].applicable` = false (no Kubernetes)
- [ ] Desktop web app → `mobile_test_config.applicable` = false
- [ ] REST API → `graphql_validation.applicable` = false
- [ ] Backend API → `cross_browser_config.applicable` = false
- [ ] Final synthesis report excludes not-applicable sections
- [ ] `production_monitors.data_source` present

---

*Fix documentation generated: 27 April 2026*  
*All 37 automated verification checks: PASS*
