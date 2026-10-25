## Spec-Driven Development (SDD) + TDD Pipeline
**Version 2.0 | Classification: Internal Technical Reference**

---

## 1. Executive Summary

The AI Engineering Assurance Platform is an **Autonomous Engineering Governance Engine** — not a code generator. It owns the Requirements, the Specifications, the Tests, and the Validation. The actual code generation is a commoditized, replaceable step in the middle of a strictly governed lifecycle.

The platform enforces a single non-negotiable principle: **no artifact at any stage is produced until the artifact before it has been explicitly approved by a human.** This eliminates compounding hallucination errors, architectural drift, and the "garbage in, garbage out" failure mode common to autonomous coding agents.

The pipeline is:

```
Requirements → Clarification → Risk Assessment → Specification → 
Implementation Plan → TDD Contracts → Code Generation → 
Test Validation → NFR Audits → Code Review → V&V → Production
```

Every arrow in that chain is a gate. Every gate has an owner. Every owner is accountable to a cryptographically signed artifact trail.

---

## 2. Core Design Philosophy

### 2.1 Shift-Left Quality
Quality parameters — Security, Accessibility, Performance, Compliance — are assessed at the **requirements level** before any specification is written. Constraints discovered at this stage are attached as binding rules to every downstream artifact. Finding a WCAG violation at the requirements stage costs zero rework. Finding it after code generation costs everything.

### 2.2 Spec-Driven Development (SDD)
No specification is generated until the mesh has fully executed its proactive assessment and the user has reviewed and approved the assessment outputs. The System Specification Document (SSD) is a **hardened artifact** — every line in it has survived a requirements-level audit.

### 2.3 Test-Driven Development (TDD) as a Mathematical Boundary
Test contracts are generated **before implementation code**. This makes passing tests a mathematical precondition for code acceptance, not a retrospective validation step. The coding agent — internal or external — writes code to satisfy a pre-existing contract it cannot modify.

### 2.4 Agent Agnosticism
The platform produces a **portable handoff bundle** at the end of Pillar 2. The user is not locked into the platform's internal code generation capability. They may take the bundle to any external coding agent (Devin, Cursor, Aider, a human developer) and return to the platform for validation.

### 2.5 Zero-Trust Validation
No code proceeds to human review without clearing every specialized agent (Security, Accessibility, Performance) with an explicit GREEN status. This is a deterministic boolean AND gate — not an LLM judgment call, not a majority vote.

### 2.6 Immutable Audit Trail
Every phase transition produces a cryptographically hashed artifact. The final Cryptographic V&V Passport is a SHA-256 signed record of the complete pipeline — from the original PRD hash to the final test execution results — making the entire journey reproducible, auditable, and tamper-evident.

---

## 3. System Architecture Overview

### 3.1 Pipeline Architecture

The platform is structured as five sequential Pillars, each representing a governance domain. Pillars are not interchangeable phases — they have strict input requirements and produce typed output artifacts that form the input contracts for the next Pillar.

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMMAND MESH (Pillar 1)                     │
│  Ingest → Clarify → Risk Assess → [HITL CHECKPOINT 1]           │
└────────────────────────────┬────────────────────────────────────┘
                             │ Approved: risk_advisory_report
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ARTIFACT FACTORY (Pillar 2)                   │
│  Specify → Plan → TDD Forge → [HITL CHECKPOINT 2]               │
└────────────────────────────┬────────────────────────────────────┘
                             │ Approved: handoff_bundle
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXECUTION ARRAY (Pillar 3)                    │
│  Link Codebase → Run TDD Loop → [BLOCKING GATE: ALL GREEN]      │
└────────────────────────────┬────────────────────────────────────┘
                             │ Passed: tdd_execution_report
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NFR & GUARDS (Pillar 4)                      │
│  Security Scan → Accessibility → Performance → [AND GATE]       │
└────────────────────────────┬────────────────────────────────────┘
                             │ Passed: nfr_clearance_report
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              RELIABILITY & CONTINUITY (Pillar 5)                │
│  Code Review → V&V Sign-off → Observability → Passport          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Agent Topology

The platform uses a LangGraph-based multi-agent mesh. Agents are organized into three execution classes:

**Class 1 — Sequential Governance Agents**: Run in a fixed order within a Pillar. Each must complete before the next starts. Examples: `ingestor_node → clarifier_node → security_intel_node`.

**Class 2 — Parallel Assessment Agents**: Fan out simultaneously within a sub-phase. Results are collected via a fan-in synchronization node before the HITL checkpoint. Examples: Security Intel, Accessibility Intel, Governance running in parallel during Pillar 1B.

**Class 3 — Continuous Monitoring Agents** (Sidebar Subgraph): Decoupled from the main DAG. Triggered reactively by filesystem or repository events. Run independently and write results back to mission state. Examples: TDD execution loop in Pillar 3.

### 3.3 Human-in-the-Loop (HITL) Architecture

There are exactly **two explicit HITL checkpoints** in the main pipeline:

| Checkpoint | Location | What the User Approves | What Gets Blocked |
|---|---|---|---|
| HITL-1 | End of Pillar 1 | Clarified requirements + risk advisories | Entire Pillar 2 |
| HITL-2 | End of Pillar 2 | SSD + Implementation Plan + TDD contracts | Entire Pillar 3 |

Additionally there are two **automated blocking gates** (no human required, deterministic):

| Gate | Location | Condition | Action on Failure |
|---|---|---|---|
| TDD Gate | Pillar 3 exit | All TDD tests GREEN | Pipeline halts, feedback sent to coding agent |
| NFR Gate | Pillar 4 exit | All NFR agents return GREEN | Pipeline halts, detailed remediation report generated |

---

## 4. Pillar Definitions

---

### Pillar 1: Command Mesh
**Domain: Requirements & Strategic Governance**
**Role: The Clarification and Hardening Gateway**

This Pillar owns everything before a single test or specification exists. Its sole responsibility is to transform raw, ambiguous inputs into a mathematically sound, risk-hardened requirements contract.

#### 4.1.1 Sub-phase 1A — Clarification Loop

**Input**: Raw PRD document, JIRA tickets, Confluence pages, or any unstructured requirements source.

**Process**:
The `repository_intelligence_node` first loads the enterprise baseline (RULES.md, DATA-GOVERNANCE.md, WoW_Process.md) as deterministic context — no LLM call, static file injection. This establishes the governance baseline before any LLM reasoning occurs.

The `ingestor_node` then parses the raw requirements into the internal `capabilities` graph — a structured representation of all functional requirements, user roles, integrations, and product categories discovered in the input.

The `clarifier_node` performs a systematic gap analysis against the ingested capabilities:
- Missing edge cases (e.g., what happens when a QR code expires mid-session?)
- Undefined data models (e.g., commission rate structure is mentioned but never specified)
- Conflicting requirements (e.g., "no login required for browsing" conflicts with "personalised product recommendations")
- Ambiguous NFRs (e.g., "fast" performance without a defined SLA)
- Unhandled error states

**State Tracking**: All identified gaps are stored as:
```json
{
  "open_questions": [
    {
      "id": "GAP-001",
      "category": "data_model | edge_case | conflict | nfr | error_state",
      "description": "Commission rate structure is referenced but not defined",
      "status": "open | resolved",
      "resolution": null
    }
  ]
}
```

**Iteration**: The platform presents open questions to the user in the Mission Feed as a conversational interface, not a form. The user resolves each gap. The clarifier re-evaluates after each resolution. This loop continues until `all(q.status == "resolved" for q in open_questions)`.

**Exit Condition**: Zero open questions. Requires explicit user action: "Approve Requirements."

---

#### 4.1.2 Sub-phase 1B — Proactive Risk Assessment

**Trigger**: Only after Sub-phase 1A exit condition is met.

**Input**: Resolved `capabilities` graph and `unified_context_contract`.

**Process**: Three specialized agents fan out in parallel, each assessing the **requirements text** — not code (no code exists at this stage):

- **Security Intel**: Performs STRIDE threat modeling on the requirements. Identifies attack surfaces implied by the data flows described (e.g., QR code forgery, OTP bypass, commission manipulation). Outputs recommended AuthN/AuthZ strategies.

- **Governance**: Scans requirements for regulatory constraints. For Indian medical device commerce: Medical Device Rules 2017, DPDP Act (data privacy), GST compliance, ALIMCO certification documentation requirements. Assigns a Risk Tier (Low / Medium / High / Stop-the-Line) and Data Classification.

- **Accessibility Intel**: Analyzes UI requirements for WCAG compliance implications. Flags any described flows that would fail AA criteria before a single component is designed.

**Fan-in**: All three agents write to `risk_advisory_report`. The fan-in synchronization node waits for all three before proceeding.

**Output — `risk_advisory_report` schema**:
```json
{
  "risk_tier": "LOW | MEDIUM | HIGH | STOP",
  "data_classification": "PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED",
  "advisories": [
    {
      "id": "ADV-001",
      "source_agent": "security_intel | governance | accessibility_intel",
      "category": "security | compliance | accessibility | performance",
      "constraint": "QR codes must implement HMAC signature validation",
      "binding": true,
      "pillar_4_check_id": "SEC-CHECK-001",
      "severity": "blocking | warning"
    }
  ]
}
```

**Stop-the-Line**: If `risk_tier == "STOP"`, the platform halts the entire pipeline and presents the reasons. No further execution occurs until the user resolves the blocking advisories.

**HITL Checkpoint 1**: The user reviews the clarified requirements and the complete `risk_advisory_report` together. They see exactly what constraints will govern every downstream artifact. Explicit approval required. This approval is recorded with a timestamp and stored in the mission audit log.

---

### Pillar 2: Artifact Factory
**Domain: Specification & TDD Forge**
**Role: The Spec Generator and Test-First Blueprint Builder**

This Pillar transforms the approved, risk-hardened requirements into a complete, testable specification package. It produces no implementation code.

#### 4.2.1 System Specification Document (SSD) Generation

**Input**: Approved `unified_context_contract` + `risk_advisory_report` (with all binding advisories).

**Process**: The `architect_node` generates the SSD. Every binding advisory from `risk_advisory_report` is embedded as a non-negotiable constraint — not a suggestion, not a note.

**SSD Contents**:
- System context diagram (C4 Level 1, Mermaid syntax)
- Bounded contexts and service decomposition
- Complete API specification (OpenAPI 3.0 JSON)
- Data model and entity-relationship design
- AuthN/AuthZ strategy (derived from Security Intel advisory)
- Accessibility requirements per component (derived from Accessibility Intel advisory)
- Non-functional requirements with measurable SLAs (response time in ms, uptime %, error rate %)
- Regulatory compliance requirements (derived from Governance advisory)

---

#### 4.2.2 Implementation Plan Generation

**Process**: The SSD is decomposed into granular, trackable Task IDs by the `engineering_contract_node`.

**Task ID schema**:
```json
{
  "task_id": "TASK-003",
  "title": "Implement QR code HMAC validation endpoint",
  "pillar": 3,
  "depends_on": ["TASK-001", "TASK-002"],
  "advisory_refs": ["ADV-001"],
  "acceptance_criteria": [
    "Returns 401 for expired QR tokens",
    "Returns 400 for tampered HMAC signatures",
    "Validates within 50ms at P99"
  ],
  "status": "pending | in_progress | tdd_green | nfr_green | done"
}
```

**Traceability**: Every Task ID traces back to at least one requirement in the `capabilities` graph and at least one advisory in the `risk_advisory_report`. No orphan tasks. No untraced requirements.

---

#### 4.2.3 TDD Contract Generation

**Process**: For every Task ID, the platform generates failing test scripts **before any implementation code exists**. These tests form the immutable engineering contract.

**Test types generated per Task ID**:
- **Unit tests**: Isolated function/method level. Generated in the target language of the project's tech stack.
- **Integration tests**: Service boundary level. Tests the interaction between the component and its dependencies (database, external APIs).
- **E2E tests**: User journey level. Generated for flows described in acceptance criteria.

**Contract immutability**: Once approved at HITL Checkpoint 2, the test suite is hashed. Any modification to a test file after approval invalidates that Task ID's contract and requires re-approval. The coding agent cannot modify tests to make code pass — only the code can change.

---

#### 4.2.4 Portable Handoff Bundle

Upon generation, all artifacts are bundled into a structured, portable delivery:

```
/handoff-bundle/
  spec.md                        # Full System Specification Document
  tasks.json                     # All Task IDs with status, dependencies, acceptance criteria
  risk_advisories.json           # Carried from Pillar 1B — binding constraints
  tests/
    unit/
      TASK-001_test.py
      TASK-002_test.spec.ts
      ...
    integration/
      TASK-003_integration_test.py
      ...
    e2e/
      checkout_flow_e2e.spec.ts
      ...
  bundle_manifest.json           # SHA-256 hashes of every file in the bundle
```

**HITL Checkpoint 2**: The user reviews the full bundle — SSD, Implementation Plan, and TDD test suite — together. Approval is explicit. This checkpoint also presents the option to:
- Proceed with the platform's internal Forge (Pillar 3 uses internal code generation)
- Export the bundle to an external coding agent (Devin, Cursor, Aider, human developer)

Both paths converge at Pillar 3's validation gate.

---

### Pillar 3: Execution Array
**Domain: Codebase Linkage & Continuous TDD Validation**
**Role: The Live Integration and Test Enforcement Hub**

This Pillar is a net-new capability — it requires dedicated infrastructure not present in the current platform. It connects the governance artifacts from Pillars 1 and 2 to a live codebase.

#### 4.3.1 Codebase Linkage

The platform establishes a direct link to the working codebase via a file-watcher service. **V1 scope**: local folder monitoring using a file-system watcher (Python `watchdog` library). Git webhook integration is a V2 capability.

**Configuration**: The user points the platform at a local folder path. The watcher service registers on that path and listens for file modification events.

**Debounce strategy**: File events are batched with a 2-second debounce window. A coding agent writing 40 files in a single generation pass triggers one evaluation cycle, not 40.

**Scope filtering**: Only files matching the project's source extensions are watched (`.py`, `.ts`, `.tsx`, `.js`, etc.). Build artifacts, `node_modules`, and `.git` directories are explicitly excluded.

---

#### 4.3.2 TDD Execution Loop

On every debounced file change event, the platform:

1. Identifies which Task IDs are affected by the changed files (via import graph analysis or path-to-task mapping from `tasks.json`)
2. Runs the test suite for those specific Task IDs via the existing `/execute-sandbox` endpoint
3. Streams stdout/stderr back to the Mission Feed in real time

**Feedback on failure**: A failing test produces a structured diagnostic posted to the Mission Feed:
```
TASK-003 | UNIT TEST FAILED
Test: test_qr_hmac_validation_rejects_tampered_signature
Expected: HTTP 400
Received: HTTP 200
Stack trace: [...]
Suggested fix: HMAC comparison is using == instead of hmac.compare_digest() — timing attack vulnerability
```

The suggested fix is generated by the `repairman_node`, which receives the stack trace and the original acceptance criteria as context — not the full codebase.

---

#### 4.3.3 TDD Blocking Gate

The pipeline **cannot advance to Pillar 4** while any TDD test in the approved bundle is red. This is enforced deterministically:

```python
all_tests_green = all(
    task.tdd_status == "GREEN" 
    for task in mission.tasks
)
# Pillar 4 entry is gated on all_tests_green == True
```

**Partial progress**: Individual Task IDs transition to `tdd_green` status as their tests pass. The overall gate requires all tasks to reach `tdd_green` before Pillar 4 begins. Tasks with unresolved dependencies cannot start until their prerequisite Task IDs are `tdd_green`.

---

### Pillar 4: NFR & Guards
**Domain: Code-Level Assurance & Zero-Trust Audit**
**Role: The Post-Code Audit Gateway**

This Pillar is the code-facing counterpart to Pillar 1B. The same agent roster runs again — but against the generated code, not the requirements text. The distinction is fundamental and must never be collapsed:

| Dimension | Pillar 1B | Pillar 4 |
|---|---|---|
| Target artifact | Requirements text | Generated code |
| Purpose | Attach binding constraints | Verify constraints were honored |
| Output | `risk_advisory_report` | `nfr_clearance_report` |
| Failure consequence | Constraints added to spec | Code blocked from review |
| Timing | Before spec exists | After all TDD tests pass |

#### 4.4.1 Security Audit

Scope: Generated code scanned against OWASP Top 10. AuthN/AuthZ implementation verified against the strategy specified in `risk_advisory_report.ADV-xxx` items with `category: "security"`. Specific checks derived from Pillar 1B advisories — not a generic scan.

For AmereyConnect specifically, this includes: HMAC validation of QR tokens, OTP brute-force protection, commission manipulation prevention, GSTIN/Drug Licence data handling, PII encryption at rest.

#### 4.4.2 Accessibility Audit

Scope: Generated UI code scanned for WCAG AA compliance. Checks derived from Pillar 1B `accessibility_intel` advisories. ARIA labels, contrast ratios, keyboard navigation, screen reader compatibility.

#### 4.4.3 Performance Audit

Scope: Generated code analyzed for N+1 query patterns, Big-O complexity of core algorithms, missing database indexes (cross-referenced against Pillar 2's data model), unoptimized asset sizes in frontend code.

#### 4.4.4 Green Flag Gate

```python
nfr_gate_passed = all(
    agent.status == "GREEN"
    for agent in [security_audit, accessibility_audit, performance_audit]
)
```

This is a deterministic boolean AND. If any single agent returns RED or YELLOW, the entire gate fails. The code does not proceed to Pillar 5 under any circumstances until the gate is GREEN across all agents. There is no override mechanism — only remediation and re-execution.

**Cross-check mechanism**: Each Pillar 4 check maps back to a specific `pillar_4_check_id` in `risk_advisory_report`. If an advisory said "must implement HMAC validation" and the security scan confirms it's present and correctly implemented, that advisory is marked `verified: true`. If absent or incorrectly implemented, it is marked `verified: false` and contributes to a RED status.

---

### Pillar 5: Reliability & Continuity
**Domain: Human Review & Operational Readiness**
**Role: The Final Sign-off and Production Certification Hub**

#### 4.5.1 Readiness Report

The `optimizer_node` synthesizes the complete mission journey into a single document for the human code reviewer:

- Original PRD → clarified requirements delta (what changed during the clarification loop)
- All binding advisories from Pillar 1B and their Pillar 4 verification status
- Implementation Plan with Task ID completion status
- TDD execution summary (tests run, pass rate, execution time)
- NFR audit results per agent
- Any open warnings (non-blocking advisories not yet remediated)

The reviewer receives the full context of every decision made since the PRD was ingested — not just the final code.

#### 4.5.2 Final V&V Sign-off

Complete traceability validation:

```
PRD Requirement ID → Capability ID → Task ID → Test ID → Test Result → NFR Check ID → NFR Result
```

Every requirement must have an unbroken trace to a passing test and a passing NFR check. Any gap in the trace is a V&V failure and blocks sign-off.

#### 4.5.3 Observability Scaffolding

Before the mission is marked Done, the `tracing_node` and `sre_node` verify that the generated codebase contains:
- OpenTelemetry instrumentation on all service entry points
- Structured logging with correlation IDs
- Health check endpoints
- Prometheus metrics exposure
- Alerting rule definitions

These are not suggestions — they are exit criteria. Missing observability is a blocking condition.

#### 4.5.4 Cryptographic V&V Passport

The final artifact of the entire pipeline:

```json
{
  "passport_id": "VVP-2026-001",
  "mission_id": "MISSION-UUID",
  "issued_at": "2026-06-22T10:00:00Z",
  "prd_hash": "sha256:abc123...",
  "ssd_hash": "sha256:def456...",
  "bundle_hash": "sha256:ghi789...",
  "tdd_execution_hash": "sha256:jkl012...",
  "nfr_clearance_hash": "sha256:mno345...",
  "traceability_complete": true,
  "all_advisories_verified": true,
  "signed_by": "traceability_auditor_node",
  "signature": "sha256:pqr678..."
}
```

This passport is immutable. It proves the code reached production through the full SDD/TDD lifecycle. It is the artifact attached to every PR, deployment, and audit record.

---

## 5. State Schema Reference

Key state fields introduced or modified by this architecture:

| Field | Type | Owner Pillar | Description |
|---|---|---|---|
| `open_questions` | `List[Dict]` | Pillar 1A | Gap tracking with open/resolved status |
| `unified_context_contract` | `Dict` | Pillar 1A | Resolved requirements after clarification loop |
| `risk_advisory_report` | `Dict` | Pillar 1B | Binding constraints from proactive risk assessment |
| `system_specification` | `Dict` | Pillar 2 | Full SSD including API spec, data model, NFR SLAs |
| `tasks` | `List[Dict]` | Pillar 2 | Per-Task-ID engineering contracts with status |
| `handoff_bundle_path` | `str` | Pillar 2 | File path to the portable handoff bundle |
| `tdd_execution_report` | `Dict` | Pillar 3 | Per-Task-ID test results |
| `nfr_clearance_report` | `Dict` | Pillar 4 | Per-agent GREEN/RED status with advisory cross-references |
| `vv_passport` | `Dict` | Pillar 5 | Final cryptographic passport |

---

## 6. Artifact Lineage Map

Every artifact in the platform traces directly to its source and its consumer:

```
PRD Input
    │
    ▼
capabilities_graph ──────────────────────────────┐
    │                                             │
    ▼                                             ▼
open_questions ──(resolved)──► unified_context_contract
                                        │
                                        ▼
                              risk_advisory_report
                                        │
                              [HITL CHECKPOINT 1]
                                        │
                                        ▼
                              system_specification
                                        │
                                        ▼
                                tasks (per Task ID)
                                        │
                                        ▼
                              tdd_contracts (per Task ID)
                                        │
                              [HITL CHECKPOINT 2]
                                        │
                                        ▼
                              handoff_bundle
                                        │
                              ┌─────────┴──────────┐
                              ▼                     ▼
                    Internal Forges         External Agent
                              └─────────┬──────────┘
                                        ▼
                              tdd_execution_report
                                        │
                                        ▼
                              nfr_clearance_report
                                        │
                                        ▼
                              readiness_report
                                        │
                                        ▼
                              vv_passport
```

---

## 7. Agent Roster by Pillar

| Pillar | Agent | Class | Primary Output |
|---|---|---|---|
| 1A | `repository_intelligence_node` | Deterministic | `repo_intelligence_context` |
| 1A | `ingestor_node` | Sequential | `capabilities_graph` |
| 1A | `clarifier_node` | Sequential (loop) | `open_questions`, `unified_context_contract` |
| 1B | `security_intel_node` | Parallel | `risk_advisory_report.advisories[security]` |
| 1B | `governance_node` | Parallel | `risk_advisory_report.risk_tier`, `data_classification` |
| 1B | `accessibility_intel_node` | Parallel | `risk_advisory_report.advisories[accessibility]` |
| 2 | `architect_node` | Sequential | `system_specification` |
| 2 | `service_architecture_mesh_node` | Sequential | `api_design_spec`, `db_schema_design` |
| 2 | `engineering_contract_node` | Sequential | `tasks`, `tdd_contracts` |
| 3 | File-watcher service | Continuous | Triggers TDD execution |
| 3 | `repairman_node` | Reactive | Structured fix suggestions |
| 4 | `security_audit_node` | Parallel | `nfr_clearance_report.security` |
| 4 | `accessibility_audit_node` | Parallel | `nfr_clearance_report.accessibility` |
| 4 | `performance_audit_node` | Parallel | `nfr_clearance_report.performance` |
| 5 | `optimizer_node` | Sequential | `readiness_report` |
| 5 | `tracing_node` | Sequential | Observability verification |
| 5 | `traceability_auditor_node` | Sequential | `vv_passport` |

---

## 8. What This Platform Is Not

To prevent scope creep and maintain architectural integrity:

- **Not a code editor**: The platform does not provide an IDE or inline code editing capability
- **Not a deployment engine**: The platform generates deployment artifacts (Dockerfiles, CI/CD YAML, K8s manifests) but does not execute deployments
- **Not a project management tool**: Task IDs are engineering contracts, not sprint tickets — they do not replace JIRA, Linear, or equivalent tools
- **Not a mandatory coding agent**: The platform's internal Forge capability is optional; the portable handoff bundle is a first-class output path
- **Not an LLM judgment layer**: Every gate in the pipeline is deterministic. No LLM is asked "is this good enough?" — only specialized tools with binary outputs are used at gate boundaries
