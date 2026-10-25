# CONVERGE: Autonomous Engineering Intelligence & Assurance Platform
### [59-Node Sovereign Mesh | 4-Module Product Architecture | B.L.A.S.T. Reasoning]

**CONVERGE** is the world's first platform that takes any engineering input and autonomously produces a tested, compliant, financially-justified release decision.

> **Version:** v4.0.0-converge | **Mesh:** 59 Agents | **Modules:** 4 | **Backend:** FastAPI + LangGraph | **Frontend:** React + Vite

---

## The 4-Module Architecture

| Module | Endpoint | Purpose |
|---|---|---|
| **1 - Ingest & Synthesize** | POST /api/converge/ingest | Any input to hardened specification |
| **2 - Generate & Forge** | POST /api/converge/forge | Specification to production-ready test suite |
| **3 - Certify & Comply** | POST /api/converge/certify | Every sprint to audit-ready compliance pack |
| **4 - Decide & Optimize** | POST /api/converge/decide | Ship or hold with a dollar figure |
| **Full Mission** | POST /api/converge/mission | All 4 modules in one run (primary entry point) |

## Mission Routing Modes

| Mode | Input | Intent | Use Case |
|---|---|---|---|
| **A — Fresh** | `sources` provided, no `parent_task_id` | PHASE_1 | New requirement from any source |
| **B — Context** | `context` string, no sources | PHASE_1 | Paste PRD directly |
| **C — Chain** | `parent_task_id` set | PHASE_2 | Resume from prior run (SDET, Manager, CTO) |

## Role → Module Defaults

| Role | Auto-selects | Depth |
|---|---|---|
| QA Engineer | Ingest + Forge | Standard |
| SDET | Forge only | Standard |
| QA Lead | Ingest + Forge + Certify | Standard |
| Eng Manager | Decide only | Rapid |
| CISO | Certify only | Standard |
| CTO / VP Eng | Decide only | Rapid |

## Aggregation Endpoints (read-only)

| Endpoint | Powers |
|---|---|
| GET /api/converge/release-decision/{task_id} | Release Command Center — Go/No-Go card |
| GET /api/converge/economics/{task_id} | Engineering Economics Dashboard (CFO View) |
| GET /api/converge/compliance-pack/{task_id} | Compliance Evidence Package |
| GET /api/converge/remediation/{task_id} | Compliance Remediation PRs |
| GET /api/converge/resilience-inspector/{task_id} | Self-Healing Locator Artifacts |
| GET /api/converge/migration/{task_id} | Automation Migration Workspace |
| POST /api/converge/knowledge-graph | Semantic knowledge query |
| GET /api/converge/mesh-profile | Mission Launchpad agent preview |
| GET /api/converge/role-defaults/{role} | Role-driven module auto-configuration |
| GET /api/converge/recent-tasks | Prior-run selector for chaining |

## Conflict Detection (Phase 2.1)

| Endpoint | Purpose |
|---|---|
| POST /api/conflict/detect | Detect contradictions across ingested sources |
| POST /api/conflict/resolve | Apply user-selected resolution |

## History & Analytics (Phase 5)

| Endpoint | Purpose |
|---|---|
| GET /api/history/quarterly-report | 90-day executive health report data |
| GET /api/history/quarterly-report/export | PDF export of quarterly report |
| GET /api/history/knowledge-graph-growth | Knowledge graph growth over time |

---

## The HITL Flow (Human-in-the-Loop)

```
Mission Launchpad → Launch
        ↓
   PHASE 1 — Strategic Blitz (Ingestor → Clarifier → Planner)
   User watches: Mesh Observatory
        ↓
   ⏸ HITL — Approval Required (factoryStep = 3)
   WHERE: Amber banner on Mesh Observatory + sidebar footer
   ACTION: "Approve & Launch Phase 2" button
        ↓
   PHASE 2 — Full 59-Node Mesh (all specialist agents)
        ↓
   COMPLETE → Release Command Center (Go/No-Go + Economics)
```

---

## New UI Views (v3)

| View | Route Key | Description |
|---|---|---|
| **Mission Launchpad** | mission_launchpad | Role-aware module selector, depth picker, source tiles, PRD input |
| **Mesh Observatory** | mesh_observatory | Live 59-node canvas + HITL approval bar |
| **Mission Control** | orchestration | Full HITL editor — editable Intelligence Contract + Approve button |
| **Release Command Center** | release_command | Executive Go/No-Go + CFO View + Remediation PRs |
| **History & Trends** | history_trends | Quarterly report, Knowledge Graph growth, audit log |

---

## Execution Depth Profiles

| Depth | Nodes | Est. Time | Use Case |
|---|---|---|---|
| rapid | ~20 | ~3 min | Quick PRD validation |
| standard | ~40 | ~8 min | Sprint-level coverage |
| full | 59 | ~20 min | Enterprise full mesh |

---

## QuickStart

### Backend

    pip install -r requirements.txt
    python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

### Frontend

    cd frontend && npm install && npm run dev
    # Access at http://localhost:5173

### Environment
Copy `.env.example` to `.env` and set your API keys.
The vault seeder auto-populates all keys from `.env` on startup — no manual UI entry needed.

### Vault Auto-Seeding
On every startup, the system reads `GROQ_API_KEYS`, `GEMINI_API_KEYS`, and `OPENROUTER_API_KEYS` from `.env` and populates the vault DB in tier-wise order:

| Tier | Provider | Model |
|---|---|---|
| Strategic | Gemini | gemini-2.0-flash-exp |
| Primary | Groq | llama-3.3-70b-versatile |
| Economy | Groq + OpenRouter | llama-3.1-8b-instant + free tier |
| Local | Ollama | gemma3:4b (offline fallback) |

---

## What CONVERGE Replaces

| Category | Tools Displaced |
|---|---|
| Test Management | TestRail, Zephyr, qTest |
| Automation Generation | Copilot, Mabl, Testim |
| Compliance Evidence | Vanta, Drata, Tugboat Logic |
| Release Intelligence | Harness, LaunchDarkly, Spinnaker |
| Engineering Economics | No existing tool |

---

**VV&T Certified | CONVERGE v4.0.0 | AI-4-VVNT Ecosystem**
