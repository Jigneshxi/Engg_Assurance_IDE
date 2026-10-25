# Server & Generation Engine Architecture

This directory contains the core AI Code Generator engine, modularized into 4 distinct architectural layers:

```text
server/
├── core/                        # Orchestration, LLM routing, contracts, and scaffolding
│   ├── orchestrator.js          # Pipeline orchestrator (PRD -> Contract -> Code -> Verify)
│   ├── llmRouter.js             # Multi-provider LLM gateway, token budgets, rate limits
│   ├── contractFirstEngine.js   # Upfront contract extraction and schema alignment
│   ├── integrationContract.js   # Cross-module import and interface integration
│   ├── foundationTemplates.js   # Deterministic foundation templates
│   ├── workspaceScaffolds.js    # Multi-tier workspace scaffolding engine
│   ├── projectArtifacts.js      # Artifact hashing and snapshot exports
│   ├── uiTruthfulness.js        # Strict UI truthfulness invariants
│   ├── projectPaths.js          # Dynamic root and directory discovery helper
│   └── index.js                 # Core barrel export
│
├── validators/                  # Deterministic static and runtime quality gates
│   ├── apiAuthzValidator.js     # JWT authentication and RBAC authorization validator
│   ├── backendRuntimeValidator.js # Startup health, route prefix, and schema checks
│   ├── dbValidator.js           # ORM models, relationships, and SQLite integrity
│   ├── fileSizeBudgetValidator.js # Per-file size budgets (pages <= 250 lines, routers <= 200)
│   ├── frontendContractValidator.js # Frontend API client to backend route contract check
│   ├── importClosureValidator.js # Resolves all module, CSS, and component imports
│   ├── manifestValidator.js     # Validates file manifest completeness and ownership
│   ├── prdCoverageValidator.js  # Maps requirements to generated modules
│   ├── projectContractValidator.js # Full project contract parser & AST analyzer
│   ├── securityValidator.js     # Secret scanner and sink detector
│   ├── workflowValidator.js     # Pytest and Playwright execution validator
│   ├── stackAllowlist.js        # Strict package and technology allowlist
│   └── index.js                 # Validators barrel export
│
├── agents/                      # Specialized agent personas
│   ├── repairEngine.js          # Autonomous patch generator and rollback engine
│   ├── javascriptEndpointGuards.js # AST security guards for Express / JS
│   ├── pythonEndpointGuards.js  # AST security guards for FastAPI / Python
│   ├── analyzeProjectContracts.py # Python contract analyzer bridge
│   ├── wireApplication.py       # Deterministic router wiring helper
│   └── index.js                 # Agents barrel export
│
├── runtime/                     # Isolated execution sandbox & environment
│   ├── validationRuntime.js     # Ephemeral temporary workspace sandbox manager
│   ├── validationSetup.js       # Dependency setup and cache provisioning
│   ├── pythonEnvironment.js     # Python virtualenv discovery and selection
│   ├── errorDiagnostic.js       # Bounded, redacted error diagnostic formatter
│   └── index.js                 # Runtime barrel export
│
├── server.js                    # Express HTTP API server (dev UI backend)
├── enterprise_mock.js           # Mock templates for testing
└── index.js                     # Unified server barrel export
```

### Conventions for Code Modifications
1. **Adding/Editing Validators**: Place all validation checks inside `server/validators/`.
2. **Adding/Editing Core Orchestration**: Place orchestrator and router changes inside `server/core/`.
3. **Adding/Editing Agent Personas**: Place autonomous repair and guard logic in `server/agents/`.
4. **Adding/Editing Sandbox Runtimes**: Place environment and execution helpers in `server/runtime/`.
5. **Path Resolution**: Always use `import { PROJECT_ROOT, WORKSPACES_DIR } from './core/projectPaths.js'` instead of hardcoding `../../` parent levels.
