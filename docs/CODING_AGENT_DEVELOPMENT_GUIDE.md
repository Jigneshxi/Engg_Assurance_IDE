# Development Guide

## Prerequisites

- **Node.js** >= 20.x (tested with v24.19.0)
- **Python** >= 3.11 (tested with 3.12.10)
- **Git** >= 2.x
- **LLM API Keys** (at least one provider)

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd VVnT AI Coding Agent_test_13
npm install

# 2. Copy environment template and configure
cp .env.example .env
# Edit .env with your API keys (see Environment Variables below)

# 3. Build and start development servers
npm run build
npm run dev        # Frontend + Backend
# or
npm run dev:all    # Frontend + Backend + Python Engine
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required (at least one provider)
```bash
# Groq (recommended - free tier available)
LLM_ENABLE_GROQ=true
GROQ_API_KEY_1=gsk_your_key_here

# Google Gemini
LLM_ENABLE_GOOGLE=true
GOOGLE_API_KEY_1=your_key_here

# OpenRouter
LLM_ENABLE_OPENROUTER=true
OPENROUTER_API_KEY_1=sk-or-v1_your_key_here

# OpenAI
LLM_ENABLE_OPENAI=true
OPENAI_API_KEY_1=sk-your_key_here

# Ollama (local)
LLM_ENABLE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
```

### Optional
```bash
# Frontend URL for generated apps
FRONTEND_URL=http://127.0.0.1:5173

# Database URL for generated apps
DATABASE_URL=sqlite:///./app.db

# LLM Settings
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=8192
LLM_MAX_PRD_CHARS=95000
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend (5174) + backend (3001) |
| `npm run dev:all` | Start frontend + backend + Python engine |
| `npm run dev:frontend` | Start Vite dev server only |
| `npm run dev:server` | Start Express backend only |
| `npm run dev:python` | Start Python engine only |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm run preview` | Preview production build |
| `npm run lint` | Run oxlint |

## Testing

```bash
# All tests (recommended)
npm run test:all

# Unit tests only
npm run test

# Engine/repair/validator tests
npm run test:engine

# Python environment tests
npm run test:python

# Forensic regression tests
npm run test:forensic
```

## Generating an Application

### Via API (SSE)
```bash
POST http://localhost:3001/api/openclaw/execute
Content-Type: application/json

{
  "prd": "# Your PRD content here...",
  "generationMode": "new",
  "projectName": "my-app",
  "autoApprove": true
}
```

### Via Frontend IDE
1. Open http://localhost:5174
2. Paste PRD in the editor
3. Click "Generate"
4. Monitor progress in real-time

## Project Structure

```
├── apps/ide-frontend/     # React IDE frontend
├── server/                # Express backend + orchestrator
│   ├── orchestrator/      # Modular generation phases
│   │   ├── contracts.js   # Requirement/Architecture contracts
│   │   ├── manifest.js    # Generation manifest
│   │   ├── index.js       # Re-exports
│   └── *.js               # Validators, repair engine, etc.
├── packages/python-engine/ # Python FastAPI engine
├── tests/                  # Test suites
├── fixtures/               # Test PRDs
└── docs/                   # Documentation
```

## Generated Output

Generated applications are created in `workspaces/{project-name}/`:

```
workspaces/my-app/
├── backend/
│   ├── app/
│   │   ├── db/            # Database layer
│   │   ├── api/           # API routes
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── main.py        # FastAPI entrypoint
│   │   └── config.py      # Configuration
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/         # Page components
    │   ├── components/    # UI components
    │   ├── api/client.ts  # Axios client
    │   └── App.tsx        # Root component
    ├── package.json
    └── .env.example
```

## Running Generated App

```bash
cd workspaces/my-app

# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # Port 5173
```

## Vulnerability Scanning

```bash
# Node.js dependencies
npm audit
npm audit fix

# Python dependencies
pip-audit -r packages/python-engine/requirements.txt
pip-audit -r packages/python-engine/requirements-validation.txt
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Python not found | Ensure Python 3.11+ is on PATH or set `PYTHON_PATH` |
| LLM rate limits | Use multiple API keys (GROQ_API_KEY_1, _2, _3...) |
| Generation stalls | Check `.openclaw/execution.log` in workspace |
| Port conflicts | Change ports in `.env` (`PORT`, `OPENCLAW_FRONTEND_PORT`) |

## Architecture Overview

The generator follows a **contract-first** approach:

1. **Requirement Contract** - Normalized PRD → structured requirements
2. **Architecture Contract** - Stack decisions, module definitions
3. **Generation Manifest** - Dependency-ordered file plan
4. **Phased Generation** - DATABASE → BACKEND_FOUNDATION → BACKEND → FRONTEND → TESTS
5. **Validation Gates** - Syntax, semantic, import closure, security, workflow
6. **Repair Engine** - Auto-fix with bounded retries and rollback

## Key Files

| File | Purpose |
|------|---------|
| `server/orchestrator/contracts.js` | Requirement/Architecture contract generation |
| `server/orchestrator/manifest.js` | Manifest generation & validation |
| `server/llmRouter.js` | Multi-provider LLM routing with fallback |
| `server/repairEngine.js` | Automated defect repair |
| `server/workspaceScaffolds.js` | Deterministic file scaffolding |
| `server/validationSetup.js` | Validation environment setup |

## License

Internal use only.