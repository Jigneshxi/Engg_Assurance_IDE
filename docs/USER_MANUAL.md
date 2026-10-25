# CONVERGE User Manual v4.0.0

## 1. What is CONVERGE?
CONVERGE is a 59-node autonomous agent mesh that transforms any engineering input into a tested, compliant, and financially-justified release decision.

## 2. Getting Started

### Backend
    python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

### Frontend
    cd frontend && npm install && npm run dev

## 3. The 4-Module Workflow

**Module 1 - Ingest:** Paste PRD or connect ALM sources. Mesh extracts modules, workflows, and ACs.
**Module 2 - Forge:** Generates test cases, automation scripts, API mocks, synthetic data.
**Module 3 - Certify:** Runs performance, security, reliability, SLO, chaos. Produces Resilience Certificate.
**Module 4 - Decide:** Go/No-Go decision with composite score, revenue-at-risk, ROI, RCA.

## 4. Key UI Views

**Mission Launchpad** - Module selector, depth picker (Rapid/Standard/Full), role selector, PRD input, launch button.
**Mesh Observatory** - Live 59-node canvas with 4 color-coded module lanes, animated active nodes, click-to-inspect.
**Release Command Center** - Go/No-Go card, revenue guard, compliance status, resilience certificate, ROI economics.
**History & Trends** - Sprint analytics, sparklines, heatmap, audit log with filter/delete.

## 5. Execution Depth

| Depth | Nodes | Time |
|---|---|---|
| Rapid | ~18 | ~3 min |
| Standard | ~35 | ~8 min |
| Full | 59 | ~20 min |

## 6. API Endpoints

All under /api/converge/: mission, ingest, forge, certify, decide, release-decision/{id}, economics/{id}, compliance-pack/{id}, knowledge-graph, mesh-profile

## 7. Troubleshooting

| Issue | Fix |
|---|---|
| Mission stuck at PENDING | Add Groq key in Settings > Vault & AI |
| Mesh Observatory empty | Launch from Mission Launchpad first |
| Release Command shows PENDING | Wait for full mesh completion |

## 8. Dark/Light Mode

Click the sun/moon icon in the header to toggle. Preference persists in localStorage.

---
*CONVERGE v4.0.0 | VV&T Certified | AI-4-VVNT Ecosystem*