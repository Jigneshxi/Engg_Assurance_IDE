# Dashboard Issues — Audit & Implementation Log

> Last Updated: 2026-04-23
> Total Issues: 13 | Phase 1 Fixed: 8 | Phase 2: Pending | Phase 3: Pending

---

## Issue Registry

| ID | Title | Severity | Phase | Status |
|----|-------|----------|-------|--------|
| DASH-001 | Operational ID regenerates on every render | Medium | 1 | 🟢 Fixed |
| DASH-002 | "LIVE MESH" label always static | Low | 2 | 🟢 Fixed |
| DASH-003 | Intelligence Nodes hardcoded "59" | High | 1 | 🟢 Fixed |
| DASH-004 | Synthesized Tests shows "0" after Phase 1 | High | 1 | 🟢 Fixed |
| DASH-005 | SLA Confidence shows "Awaiting..." in live mode | High | 1 | 🟢 Fixed |
| DASH-006 | Risk Hotspots shows "0" when risks exist | High | 1 | 🟢 Fixed |
| DASH-007 | Requirement Coverage progress bar broken | Medium | 1 | 🟢 Fixed |
| DASH-008 | Mesh Confidence shows "Awaiting..." after Phase 1 | High | 1 | 🟢 Fixed |
| DASH-009 | Execution Readiness bar always grey | Medium | 1 | 🟢 Fixed |
| DASH-010 | Test Nexus empty after Phase 1 | High | 1 | 🟢 Fixed |
| DASH-011 | Test case fields don't match LLM output schema | High | 1 | 🟢 Fixed |
| DASH-012 | Synopsis shows generic fallback text | Medium | 1 | 🟢 Fixed |
| DASH-013 | Demo Mode data bleeds into live runs | High | 2 | 🔴 Open |

---

## Detailed Issue Cards

### DASH-001 — Operational ID regenerates on every render
**Root Cause:** `Math.random()` called inside JSX — new ID on every re-render.
**Fix:** Use `taskId` prop (real task UUID from current mission). Derived as first 9 chars of task_id with dashes removed.

### DASH-002 — "LIVE MESH" label always static
**Root Cause:** Hardcoded string `"LIVE MESH"` on all stat cards.
**Fix:** Shows `"SIMULATION"` when `demoMode=true`, `"LIVE MESH"` otherwise.

### DASH-003 — Intelligence Nodes hardcoded "59"
**Root Cause:** `meshAnalytics?.intelligence_nodes_count || '59'` — `meshAnalytics` is null in Phase 1, always falls back to `'59'`.
**Fix:** Count nodes from `topology.nodes` where `status === 'completed' || status === 'active'`. Falls back to `meshAnalytics` count, then `'—'`.

### DASH-004 — Synthesized Tests shows "0" after Phase 1
**Root Cause:** `test_cases` only exist in Phase 2. Phase 1 has no test cases.
**Fix:** Priority chain: `meshAnalytics.synthesized_tests_count` → `test_cases.length` → `gherkin_scenarios.length` (Phase 1 proxy) → `'0'`.

### DASH-005 — SLA Confidence shows "Awaiting..." in live mode
**Root Cause:** `intelligence_metrics.sla_confidence` not always populated by LLM. No fallback to SLO agent output.
**Fix:** Priority chain: `intelligence_metrics.sla_confidence` → `sla_slo_audit.sla_targets[0].target` → `reasoning_audit.confidence_score` → `mesh_confidence` → `'Awaiting...'`.

### DASH-006 — Risk Hotspots shows "0" when risks exist
**Root Cause:** Filter only checked `'H'` but LLM sometimes returns `'High'`. Also missed quarantine count from reliability agent.
**Fix:** Case-insensitive check for both `'H'` and `'HIGH'` in impact/likelihood. Also adds `reliability_eng.quarantine_count` from fullAgentState.

### DASH-007 — Requirement Coverage progress bar broken
**Root Cause:** Non-percentage strings (e.g., `"Pending"`, `"Awaiting..."`) used directly as CSS `width` — renders as 0.
**Fix:** Regex validates `^\d+(\.\d+)?%$` before using as CSS width. Falls back to `'0%'` for invalid values.

### DASH-008 — Mesh Confidence shows "Awaiting..." after Phase 1
**Root Cause:** `finalState.mesh_confidence` only set in Phase 2. Phase 1 confidence stored in `reasoning_audit.confidence_score` inside `analysis_payload`.
**Fix:** Priority chain: `finalState.mesh_confidence` → `analysis_payload.reasoning_audit.confidence_score` → `'Awaiting...'`.

### DASH-009 — Execution Readiness bar always grey
**Root Cause:** Condition `metrics.logic_stability === 'Stable'` too narrow — `'Exceptional'`, `'High'`, `'Operational'` all rendered grey.
**Fix:** `READY_STATES = Set(['stable', 'exceptional', 'high', 'operational', 'ready', 'active'])` — case-insensitive check.

### DASH-010 — Test Nexus empty after Phase 1
**Root Cause:** `test_cases` only generated in Phase 2. No Phase 1 fallback.
**Fix:** When `test_cases` is empty, use `testing_points` from `analysis_payload` as Phase 1 test vectors. Tab label changes to "Test Vectors" with note "Full test cases available after Phase 2".

### DASH-011 — Test case fields don't match LLM output schema
**Root Cause:** Table reads `tc.id`, `tc.title`, `tc.expected` but LLM returns `tc.test_id`, `tc.name`, `tc.expected_behavior`.
**Fix:** `normalizeTestCase()` function tries multiple field name variants: `id || test_id || tc_id`, `title || name || scenario || description`, `expected || expected_behavior || expected_result || success_criteria`.

### DASH-012 — Synopsis shows generic fallback text
**Root Cause:** `abstract_summary` and `strategic_approach` are not standard fields. `final_synthesis` only exists in Phase 2.
**Fix:** Priority chain: `final_synthesis.summary.description` → `executive_summary.description` (always populated after Phase 1) → `abstract_summary` → generic fallback.

---

## Phase 1 Implementation — 2026-04-23

**Files changed:** `frontend/src/components/TestDeliveryDashboard.tsx`, `frontend/src/App.tsx`

**All 8 critical fixes implemented in a single rewrite of `TestDeliveryDashboard.tsx`:**

### Changes in `TestDeliveryDashboard.tsx`

1. **New props added:** `topology?: any`, `taskId?: string`
2. **`computeActiveNodeCount()`** — counts completed/active nodes from topology
3. **`synthesizedTestCount`** — priority chain with gherkin_scenarios fallback
4. **`computeSlaConfidence()`** — 4-level fallback chain
5. **`computeMeshConfidence()`** — reads from reasoning_audit.confidence_score in Phase 1
6. **`highRisks`** — case-insensitive H/High check + quarantine count
7. **`coverageBarWidth`** — regex-validated CSS-safe percentage
8. **`READY_STATES` Set** — expanded readiness condition
9. **`normalizeTestCase()`** — maps all LLM field name variants
10. **`normalizeTestingPoint()`** — converts testing_points to table rows
11. **`nexusRows`** — uses test_cases if available, falls back to testing_points
12. **`execSummary`** — uses executive_summary.description as Phase 1 source
13. **`operationalId`** — derived from real taskId prop
14. **Demo badge** — shows "SIMULATION" vs "LIVE MESH" based on demoMode

### Changes in `App.tsx`

- Added `topology={liveTopology}` and `taskId={currentTaskId || ''}` props to `<TestDeliveryDashboard>`

**Build verification:** `npm run build` — ✅ 0 TypeScript errors, built in 867ms

---

## Remaining Issues

### DASH-013 — Demo Mode data bleeds into live runs (Phase 2)
When `demoMode` is toggled off after being on, `planPayload` may still be null if no real run has completed. The `effectivePayload` correctly switches to `payload` (real data) but the UI shows empty state rather than a clear "run a mission first" message.

**Planned fix:** Add an empty state guard when `!demoMode && !payload` — show a prompt to start a mission instead of blank metrics.

---

## Phase 2 — Pending

| # | Issue | Fix |
|---|-------|-----|
| 1 | DASH-013 | Empty state guard when demoMode=false and no payload |

## Phase 3 — Pending (Backend)

| # | Issue | Fix |
|---|-------|-----|
| 1 | DASH-005/006/008 | `GET /api/tasks/metrics/{task_id}` — server-side KPI computation from stored task result |

---

## Orchestration Screen Audit & Fix — 2026-04-23

The Orchestration Hub (`OrchestrationHub.tsx`) had the **same class of problems** as the Dashboard — same stat cards, same analytics grid, same synopsis — but with different hardcoded fallback values.

### Issues Found & Fixed

| # | Location | Problem | Fix |
|---|----------|---------|-----|
| ORCH-001 | Intelligence Nodes card | `|| '44'` hardcoded fallback | Counts actual completed/active nodes from `topology.nodes` |
| ORCH-002 | Synthesized Tests card | `|| '0'` — no Phase 1 proxy | Priority chain: `meshAnalytics` → `test_cases.length` → `gherkin_scenarios.length` |
| ORCH-003 | SLA Confidence card | `|| 'High'` hardcoded string | 4-level fallback: `intelligence_metrics` → `sla_slo_audit` → `reasoning_audit` → `mesh_confidence` |
| ORCH-004 | Risk Hotspots card | `?? '0'` — no fallback to risk_matrix | Case-insensitive H/High check + reliability quarantine count |
| ORCH-005 | Mesh Confidence | `\|\| 0.982` — **always showed 98.2%** | Removed hardcoded fallback; shows `'—'` when no data |
| ORCH-006 | Requirement Coverage | `\|\| '94%'` hardcoded + unsafe CSS width | Removed fallback; regex-validated CSS width |
| ORCH-007 | Execution Readiness bar | All 5 bars always blue (no condition) | Uses `READY_STATES` set + `readinessColor` variable |
| ORCH-008 | Collective Mesh Synopsis | No `executive_summary.description` fallback | Priority chain: `final_synthesis` → `executive_summary.description` → generic |
| ORCH-009 | Test Nexus tab count | `fullAgentState?.final_synthesis?....` — same as stat card | Uses `synthesizedTestCount` computed value |
| ORCH-010 | "44 specialized agents" text | Hardcoded `44` in Phase 2 loading | Uses `activeNodeCount` |
| ORCH-011 | "59-node intelligence mesh" text | Hardcoded `59` in Mission Accomplished | Uses `activeNodeCount` |
| ORCH-012 | "Autonomous 59-node" header | Hardcoded `59` in header description | Uses `activeNodeCount` |

**File changed:** `frontend/src/components/OrchestrationHub.tsx`

**Build:** `npm run build` — ✅ 0 TypeScript errors, built in 1.04s

---

## Phase 2 & Phase 3 Implementation — 2026-04-23

### Phase 2 — Quality Fixes (DASH-001, 002, 007, 009)

All Phase 2 fixes were already implemented during the Phase 1 rewrite of `TestDeliveryDashboard.tsx`. Verified present:

| Fix | Implementation |
|-----|---------------|
| DASH-001 | `operationalId = taskId.replace(/-/g,'').substring(0,9).toUpperCase()` — uses real `taskId` prop |
| DASH-002 | `{demoMode ? 'SIMULATION' : 'LIVE MESH'}` — dynamic badge per data source |
| DASH-007 | `coverageBarWidth` — regex `/^\d+(\.\d+)?%$/` validates before using as CSS width |
| DASH-009 | `READY_STATES = new Set(['stable','exceptional','high','operational','ready','active'])` — expanded condition |

---

### Phase 3 — Backend Metrics Endpoint (DASH-005/006/008)

**New endpoint:** `GET /api/tasks/metrics/{task_id}`

**File:** `backend/api/routes/tasks.py`

**What it computes server-side:**

| Metric | Computation Logic |
|--------|------------------|
| `intelligence_nodes_count` | Count completed/active nodes in stored mesh_topology → active_agents count fallback |
| `synthesized_tests_count` | `test_cases.length` → `gherkin_scenarios.length` (Phase 1 proxy) → 0 |
| `sla_confidence` | `intelligence_metrics.sla_confidence` → `sla_slo_audit.sla_targets[0].target` → `reasoning_audit.confidence_score` → `mesh_confidence` |
| `risk_hotspots` | `mesh_analytics.risk_hotspots` (normalized: list→count, str→int) → count H/High risks + quarantine_count |
| `requirement_coverage` | `intelligence_metrics.requirement_coverage` → `mesh_analytics.requirement_coverage` |
| `mesh_confidence` | `mesh_confidence` float → `reasoning_audit.confidence_score` |
| `execution_readiness` | `intelligence_metrics.logic_stability` → `mesh_analytics.execution_readiness` |
| `executive_summary` | `final_synthesis.summary.description` → `executive_summary.description` → `abstract_summary` |

**Bug fixed during testing:** `risk_hotspots` could be a list (e.g., `['Security', 'Performance']`) from some LLM outputs. Added normalization: `list → len(list)`, `str → int(str)`.

**Frontend integration:** `TestDeliveryDashboard.tsx` now fetches from this endpoint on mount (when `taskId` is available and not in demo mode). `serverMetrics` is the top priority source for all 8 KPIs — client-side extraction is the fallback.

**Verification test:** `backend/scratch/test_metrics_endpoint.py`
```
intelligence_nodes_count: 59
synthesized_tests_count: 100
sla_confidence: '85%'
risk_hotspots: 2
requirement_coverage: '80%'
mesh_confidence: '85.0%'
execution_readiness: 'High'
executive_summary: 'Consolidated STLC package...'
✅ All expected metric fields present
404 for unknown task_id ✅
```

**Build:** `npm run build` — ✅ 0 TypeScript errors, built in 326ms

---

## Full Re-Audit — 2026-04-23

Comprehensive scan of all three screens (Dashboard, Orchestration, Artifact Factory) and all workspace sub-components after all previous fixes.

---

### Audit Results — All Screens

| ID | Screen / File | Value | Type | Status |
|----|--------------|-------|------|--------|
| **DASH-R01** | `KnowledgeCenter.tsx` | `"98.4%"` (Reciprocal Recall) | Hardcoded metric | 🔴 **Regression** — was flagged, never fixed |
| **DASH-R02** | `OrchestrationHub.tsx` | `"v4.4.6 · Stable"` badge | Hardcoded version | 🔴 **Regression** — still present after Orch fixes |
| **DASH-R03** | `OrchestrationHub.tsx` | `"59-node mesh"` in narrative log interpreter | Hardcoded count | 🔴 **Regression** — other instances fixed, this one missed |
| **DASH-N01** | `AgentRegistry.tsx` | `"v4.4.01 // Stable Protocol"` | Hardcoded version (different from DASH-R02) | 🆕 **New** — version inconsistency |
| **DASH-N02** | `AgentRegistry.tsx` | `"59-node agent ecosystem"` in header description | Hardcoded count | 🆕 **New** |
| **DASH-N03** | `AgentRegistry.tsx` | `"59-node mesh monitoring"` in agent mission text | Hardcoded count | 🆕 **New** |
| **DASH-N04** | `TestCaseFactoryWorkspace.tsx` | `"Mesh Integrity: 100%"` badge | Hardcoded metric — always 100% | 🆕 **New** |
| **DASH-N05** | `TestCaseFactoryWorkspace.tsx` | `"44 specialized nodes"` in synthesis description | Hardcoded count | 🆕 **New** |
| **DASH-N06** | `App.tsx` | `"59-node intelligence mesh"` in Phase 2 init log | Hardcoded count | 🆕 **New** |
| **DASH-N07** | `ExecutionLog.tsx` | `"59-node synthesis mesh"` in idle state | Hardcoded count | 🆕 **New** |
| **DASH-N08** | `OrchestrationHub.tsx` | `Math.random()` in equalizer bar heights | Non-deterministic render | 🆕 **New** — causes flicker on re-render |

---

### Screens Confirmed Clean ✅

| Screen / File | Status |
|--------------|--------|
| `TestDeliveryDashboard.tsx` | ✅ All metrics dynamic after Phase 1–3 fixes |
| `GenericTelemetryWorkspace.tsx` | ✅ Clean — shows "Awaiting Live Data" when null |
| `PlanningAgentWorkspace.tsx` | ✅ Clean — all metrics from telemetry |
| `SecurityWorkspace.tsx` | ✅ Clean — all threat/compliance data from telemetry |
| `ReliabilityWorkspace.tsx` | ✅ Clean — flakiness/health from telemetry |
| `PerformanceWorkspace.tsx` | ✅ Clean — defaults are user-configurable controls, not display metrics |
| `AgentWorkspace.tsx` | ✅ Clean — AGENT_TRIVIA is contextual help text (acceptable) |

---

### Detailed Issue Cards

#### DASH-R01 — "98.4% Reciprocal Recall" in KnowledgeCenter (Regression)
**File:** `frontend/src/components/KnowledgeCenter.tsx` line 89–91
**Value:** `<span className="value">98.4%</span>` under label "Reciprocal Recall"
**Problem:** This metric has no backend source. ChromaDB doesn't expose a recall rate. The value is permanently hardcoded and misleads users about RAG quality.
**Fix:** Remove the stat pill entirely, or replace with the actual count of real documents in the knowledge base (from `/api/knowledge/list` → `real_count`).

#### DASH-R02 — "v4.4.6 · Stable" version badge in OrchestrationHub (Regression)
**File:** `frontend/src/components/OrchestrationHub.tsx` line 937
**Value:** `v4.4.6 · Stable` badge in Intelligence Command Center header
**Problem:** Hardcoded version string. Will be wrong after any update.
**Fix:** Read from `package.json` version via Vite's `import.meta.env` or a shared constants file.

#### DASH-R03 — "59-node mesh" in narrative log interpreter (Regression)
**File:** `frontend/src/components/OrchestrationHub.tsx` line 119
**Value:** `"the entire 59-node mesh"` in `interpretMissionLog()`
**Problem:** Other instances of "59-node" were fixed in OrchestrationHub but this one in the narrative interpreter was missed.
**Fix:** Replace with dynamic count from topology or remove the specific number.

#### DASH-N01 — "v4.4.01 // Stable Protocol" in AgentRegistry (New)
**File:** `frontend/src/components/AgentRegistry.tsx` line 216
**Value:** `Revision: v4.4.01 // Stable Protocol`
**Problem:** Different version string from OrchestrationHub's `v4.4.6`. Two different hardcoded versions in the same app.
**Fix:** Same as DASH-R02 — use shared version constant.

#### DASH-N02/N03 — "59-node" in AgentRegistry (New)
**File:** `frontend/src/components/AgentRegistry.tsx` lines 32, 223
**Values:** `"59-node mesh monitoring"` and `"59-node agent ecosystem"`
**Problem:** Hardcoded mesh size in descriptive text.
**Fix:** Replace with dynamic count from `MASTER_AGENTS.length` (already available in the codebase).

#### DASH-N04 — "Mesh Integrity: 100%" in TestCaseFactoryWorkspace (New)
**File:** `frontend/src/components/workspaces/TestCaseFactoryWorkspace.tsx` line 46
**Value:** `<div className="tf-sync-badge">Mesh Integrity: 100%</div>`
**Problem:** Always shows 100% regardless of actual mesh state. No data source.
**Fix:** Compute from `fullMeshState` — ratio of completed nodes to total nodes, or remove if no meaningful data source exists.

#### DASH-N05 — "44 specialized nodes" in TestCaseFactoryWorkspace (New)
**File:** `frontend/src/components/workspaces/TestCaseFactoryWorkspace.tsx` line 98
**Value:** `"Consolidating reasoning from 44 specialized nodes"`
**Problem:** Hardcoded count. Actual active node count varies per run.
**Fix:** Use `fullMeshState` node count or `MASTER_AGENTS.length`.

#### DASH-N06 — "59-node intelligence mesh" in App.tsx Phase 2 init log (New)
**File:** `frontend/src/App.tsx` line 575
**Value:** `"Activating 59-node intelligence mesh..."` in Phase 2 init log message
**Problem:** Hardcoded in the initial log entry created before the real topology arrives.
**Fix:** Use a generic message or read from `MASTER_AGENTS.length`.

#### DASH-N07 — "59-node synthesis mesh" in ExecutionLog.tsx (New)
**File:** `frontend/src/components/ExecutionLog.tsx` line 680
**Value:** `"Initializing 59-node synthesis mesh..."` in idle state
**Problem:** Hardcoded count in idle state message.
**Fix:** Use generic message or dynamic count.

#### DASH-N08 — Math.random() in equalizer animation (New)
**File:** `frontend/src/components/OrchestrationHub.tsx` line ~194
**Value:** `height: \`${Math.random() * 40 + 10}px\`` and `animation: \`equalizer ${0.5 + Math.random()}s...\``
**Problem:** `Math.random()` called in JSX causes different values on every re-render, creating visual flicker and making the component non-deterministic.
**Fix:** Pre-compute fixed values outside JSX, e.g. `const BAR_HEIGHTS = [28, 42, 15, 38, 22]`.

---

### Priority Fix Order

| Priority | ID | Reason |
|----------|-----|--------|
| 1 | DASH-R01 | Misleads users about RAG quality — active regression |
| 2 | DASH-R02 + DASH-N01 | Version inconsistency — two different wrong versions shown |
| 3 | DASH-N04 | False "100%" metric — misleads users about mesh health |
| 4 | DASH-R03 + DASH-N02/N03/N05/N06/N07 | Hardcoded "59"/"44" counts — cosmetic but incorrect |
| 5 | DASH-N08 | Math.random() flicker — UX quality issue |

---

## Re-Audit Fix Log — 2026-04-23

All 8 issues from the re-audit fixed. Build: ✅ 0 TypeScript errors, 1.04s.

| ID | File | Fix Applied |
|----|------|------------|
| DASH-R01 | `KnowledgeCenter.tsx` | Removed `"98.4%"` Reciprocal Recall stat pill. Replaced with `"Real Documents"` count derived from `knowledgeList.filter(n => n.type !== 'synthesis_sample' && n.type !== 'test_plan').length` |
| DASH-R02 | `OrchestrationHub.tsx` | Removed `"v4.4.6 · Stable"` badge from Intelligence Command Center header |
| DASH-R03 | `OrchestrationHub.tsx` | Changed `"entire 59-node mesh"` → `"intelligence mesh"` in `interpretMissionLog()` |
| DASH-N01 | `AgentRegistry.tsx` | Replaced `"Revision: v4.4.01 // Stable Protocol"` → `"Mesh Registry"` |
| DASH-N02 | `AgentRegistry.tsx` | Removed `"59-node agent ecosystem"` from header description |
| DASH-N03 | `AgentRegistry.tsx` | Changed `"59-node mesh monitoring"` → `"agent mesh monitoring"` in Lifecycle Tracker mission |
| DASH-N04 | `TestCaseFactoryWorkspace.tsx` | `"Mesh Integrity: 100%"` → dynamic: shows `"Mesh Synced"` when telemetry present, `"Awaiting Synthesis"` otherwise |
| DASH-N05 | `TestCaseFactoryWorkspace.tsx` | `"44 specialized nodes"` → `"the specialist mesh"` (×2 occurrences) |
| DASH-N06 | `App.tsx` | `"59-node intelligence mesh"` → `"intelligence mesh"` in Phase 2 init log |
| DASH-N07 | `ExecutionLog.tsx` | `"59-node synthesis mesh"` → `"synthesis mesh"` in idle state |
| DASH-N08 | `OrchestrationHub.tsx` | `Math.random()` equalizer heights → pre-computed `[28, 42, 15, 38, 22]` with deterministic animation durations `0.6 + i * 0.15s` |

---

## Second Re-Audit — 2026-04-24

Comprehensive scan of all three screens after all previous fixes. Every finding verified directly in code.

---

### Audit Results

| ID | Screen / File | Value | Severity | Status |
|----|--------------|-------|----------|--------|
| **DASH-REG-01** | `OrchestrationHub.tsx` line 686 | `"A.N.T. Protocol v4.4"` badge | Medium | 🔴 **Regression** |
| **DASH-REG-02** | `OrchestrationHub.tsx` line 535 | `"The 59-node mesh has completed..."` in demo summary | High | 🔴 **Regression** |
| **DASH-REG-03** | `TestDeliveryDashboard.tsx` line 53 | `"The 59-node mesh has completed..."` in demo summary | High | 🔴 **Regression** |
| **DASH-NEW-01** | `SimulationEngine.ts` line 541 | `intelligence_nodes_count: "59"` in MOCK_MESH_ANALYTICS | High | 🆕 **New** |
| **DASH-NEW-02** | `SimulationEngine.ts` line 542 | `synthesized_tests_count: "124"` in MOCK_MESH_ANALYTICS | High | 🆕 **New** |
| **DASH-NEW-03** | `SimulationEngine.ts` line 543 | `sla_confidence: "98.4%"` in MOCK_MESH_ANALYTICS | High | 🆕 **New** |
| **DASH-NEW-04** | `SimulationEngine.ts` line 544 | `risk_hotspots: "2"` in MOCK_MESH_ANALYTICS | High | 🆕 **New** |
| **DASH-NEW-05** | `SimulationEngine.ts` line 545 | `requirement_coverage: "96.2%"` in MOCK_MESH_ANALYTICS | High | 🆕 **New** |
| **DASH-NEW-06** | `SimulationEngine.ts` line 115 | `readiness_index: "98.2%"` in release_risk_decision | Medium | 🆕 **New** |
| **DASH-NEW-07** | `SimulationEngine.ts` line 116 | `"Regression coverage at 98.4%"` in justification text | Medium | 🆕 **New** |
| **DASH-NEW-08** | `SimulationEngine.ts` line 116 | `"0.02% risk exposure"` in justification text | Medium | 🆕 **New** |
| **DASH-NEW-09** | `OrchestrationHub.tsx` line 928 | `V4.4.6 HI-FI` in code comment (cosmetic) | Low | 🆕 **New** |

---

### Screens Confirmed Clean ✅

| Screen / File | Status |
|--------------|--------|
| `KnowledgeCenter.tsx` | ✅ "98.4% Reciprocal Recall" still removed |
| `AgentRegistry.tsx` | ✅ "v4.4.01 // Stable Protocol" still removed |
| `AgentRegistry.tsx` | ✅ "59-node agent ecosystem" still removed |
| `TestCaseFactoryWorkspace.tsx` | ✅ "Mesh Integrity: 100%" still dynamic |
| `TestCaseFactoryWorkspace.tsx` | ✅ "44 specialized nodes" still removed |
| `OrchestrationHub.tsx` equalizer | ✅ Math.random() still replaced with `[28, 42, 15, 38, 22]` |
| `App.tsx` Phase 2 init log | ✅ "59-node intelligence mesh" still removed |
| `ExecutionLog.tsx` idle state | ✅ "59-node synthesis mesh" still removed |

---

### Detailed Issue Cards

#### DASH-REG-01 — "A.N.T. Protocol v4.4" badge (Regression)
**File:** `OrchestrationHub.tsx` line 686
**Value:** `A.N.T. Protocol v4.4`
**Root Cause:** The `v4.4.6 · Stable` badge was removed in a previous fix, but a new `A.N.T. Protocol v4.4` badge was added in the same area — still a hardcoded version string.
**Fix:** Remove the version number from the badge. Change to `A.N.T. Protocol` (no version) or derive from a config constant.

#### DASH-REG-02 + DASH-REG-03 — "59-node mesh" in demo summaries (Regression)
**Files:** `OrchestrationHub.tsx` line 535, `TestDeliveryDashboard.tsx` line 53
**Value:** `"High-Fidelity Simulated Analysis: The 59-node mesh has completed a comprehensive audit..."`
**Root Cause:** This string is in the `demoMode` finalState object — it was never changed in the previous fix (only the narrative log interpreter was fixed). The demo summary still hardcodes "59-node mesh".
**Fix:** Replace `"59-node mesh"` with `"intelligence mesh"` in both demo summary strings.

#### DASH-NEW-01 to DASH-NEW-05 — MOCK_MESH_ANALYTICS hardcoded values (New)
**File:** `SimulationEngine.ts` lines 541-545
**Values:** `intelligence_nodes_count: "59"`, `synthesized_tests_count: "124"`, `sla_confidence: "98.4%"`, `risk_hotspots: "2"`, `requirement_coverage: "96.2%"`
**Root Cause:** These are demo mode values — intentionally static for presentations. However, they are shown with "SIMULATION" badge so users know they're not real. These are **acceptable for demo mode** but should be clearly documented as simulation-only.
**Assessment:** These are by design for demo mode. The "SIMULATION" badge already distinguishes them. Not a code fix — acceptable as-is.

#### DASH-NEW-06 to DASH-NEW-08 — Release decision hardcoded percentages (New)
**File:** `SimulationEngine.ts` lines 115-116
**Values:** `readiness_index: "98.2%"`, `"Regression coverage at 98.4%"`, `"0.02% risk exposure"`
**Root Cause:** Demo mode simulation data — intentionally static for presentations.
**Assessment:** Same as above — demo mode data, acceptable with "SIMULATION" badge.

#### DASH-NEW-09 — "V4.4.6 HI-FI" in code comment (New)
**File:** `OrchestrationHub.tsx` line 928
**Value:** `PHASE 2 - INTELLIGENCE COMMAND CENTER (V4.4.6 HI-FI)` in a code comment
**Assessment:** Code comment only — not shown to users. Low priority cosmetic cleanup.

---

### Fix Plan (Only Real Issues)

| Priority | ID | Fix |
|----------|-----|-----|
| 1 | DASH-REG-02/03 | Change `"59-node mesh"` → `"intelligence mesh"` in demo summary strings in both files |
| 2 | DASH-REG-01 | Remove version number from `"A.N.T. Protocol v4.4"` badge → `"A.N.T. Protocol"` |
| 3 | DASH-NEW-09 | Update code comment (cosmetic, low priority) |

DASH-NEW-01 to DASH-NEW-08 are **acceptable** — they are demo mode simulation data shown with the "SIMULATION" badge. No fix needed.
