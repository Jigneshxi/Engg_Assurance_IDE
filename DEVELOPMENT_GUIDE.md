# Engg Assurance_IDE — Development Guide

## Overview
This guide details environment setup, configuration, running servers, testing, and debugging the unified **Engg Assurance_IDE** platform.

---

## 1. Prerequisites
- **Node.js**: >= 20.x (Recommended: v24.x)
- **Python**: >= 3.11 (Configured in `.venv-ide` with Python 3.12)
- **Package Manager**: npm and uv

---

## 2. Configuration (`.env`)
The platform uses a consolidated `.env` in the root of `Engg Assurance_IDE/`.
Both services read the configuration seamlessly:
- **LLM Keys**: `GROQ_API_KEY` / `GROQ_API_KEY_1`, `GEMINI_API_KEY` / `GOOGLE_API_KEY_1`, `OPENROUTER_API_KEY`
- **Database Engine**: `DB_ENGINE=sqlite` (default local SQLite zero-dependency mode)
- **Local Fallback**: `OLLAMA_URL=http://localhost:11434` / `OLLAMA_BASE_URL`

---

## 3. Running Services

### All Services Concurrently
```bash
npm run dev:all
```
This launches concurrently:
1. `IDE-UI` on `http://localhost:5174`
2. `IDE-API` on `http://localhost:3001`
3. `ASSURE-UI` on `http://localhost:5173`
4. `ASSURE-API` on `http://localhost:8000`

### Running Subsystems Separately
- **Coding Agent IDE Only**:
  ```bash
  npm run dev:ide
  ```
- **Engineering Assurance Only**:
  ```bash
  npm run dev:assurance
  ```

---

## 4. Test Verification
All test suites can be executed from the root:
```bash
# Run IDE test suite (contracts, ORM, hardening, repairs)
npm run test

# Run Assurance core tests
npm run test:assurance

# Run bi-directional assurance bridge tests
npm run test:bridge

# Run full cross-platform test suite
npm run test:all
```
