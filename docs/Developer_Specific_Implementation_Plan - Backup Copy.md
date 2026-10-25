# Final Implementation Plan: Enterprise Development Assistance Platform (v3)

## Executive Vision
This document is the definitive, trackable implementation roadmap for transforming the 59-agent LangGraph mesh into a **Proactive Enterprise Development Assistance Platform**. 

Instead of a fragmented code generator, this platform acts as an **Enterprise Development Operating System**. By deploying specialized "Forges", Adversarial AI Guardrails, and Context-Aware agents, the platform solves the core issues of AI-assisted development: **Trust, Monolithic Hallucinations, and Context Drift**. It physically executes tests, simulates chaos, and cryptographically certifies code within a real-time workspace.

---

## 🕹️ UX & Engagement Strategy (Preventing Fragmentation)
*To ensure the platform feels like a cohesive intelligence rather than a fragmented set of tools, the Orchestrator and UI must maintain continuous developer engagement.*

*   **"Auto-Pilot" vs. "Co-Pilot" Modes:** A toggle in the Orchestration Hub. **Auto-Pilot** runs the entire mesh end-to-end for routine tasks. **Co-Pilot** pauses at checkpoints for complex architectural approvals.
*   **Unified Mission Feed:** All agents report their actions and diagrams into a single, persistent conversational feed. The developer never switches tabs or tools, retaining complete context.
*   **Conversational Checkpoints:** Instead of rigid approval forms, the mesh pauses by pinging the developer in the Mission Feed (e.g., *"Security flagged missing HMAC. Should I fix and proceed?"*). 

---

## 🚧 Adversarial AI Guardrails (Maximizing the 59 Agents)
*Agents are deployed as active safety gateways that audit the Developer (and each other) to prevent bad code from ever being written.*

*   **1. The Context & IP Guardrail:** `Repository Intelligence` scans the existing codebase to enforce legacy patterns. `Governor` ensures no restrictive GPL licenses or insecure packages are hallucinated. 
*   **2. The Architectural Drift Guardrail:** The `Service Architecture Mesh` enforces strict boundaries. If the platform dictates a CQRS pattern, it rejects any downstream Forge code that violates the boundary.
*   **3. The Contract & TDD Guardrail:** The `Engineering Contract Agent` generates strict Acceptance Criteria and Unit Tests. The `Frontend/Backend Forges` are physically blocked from running until these contracts are accepted.
*   **4. The Data & Zero-Trust DevOps Guardrail:** `Database Architect` forces transaction blocks and indexes. `EnvOps` rejects Dockerfiles that run as root, enforcing multi-stage builds.
*   **5. The Chaos & Blast-Radius Guardrail:** `Performance` flags O(n²) loops. `TestImpact` analyzes the AST to mathematically prove new code hasn't broken an unrelated module.

---

## Step 0: Core Architecture Migration (Prerequisites)
**Goal:** Restructure the underlying LangGraph topology, database schemas, and tool tiers *before* altering prompt behavior to ensure a stable execution environment.

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 0.1: Database Schema Migration (`AgentOutput`)**
  - Migrate the `AgentOutput.output_payload` column from a strict test-report shape to a Typed Discriminated Union handling specific phase outputs (Unified Context Contract, OpenAPI specs, Dockerfiles).
- `[ ]` **Task 0.2: LangGraph Topology Rewire (`backend/agents/workflow.py`)**
  - Rewrite `add_edge` and `add_conditional_edges` to replace the old QA pipeline with the new Enterprise SDLC flow (e.g., `Clarifier -> Service Architecture Mesh -> Engineering Contract -> Forges`).
- `[ ]` **Task 0.3: Tool Tier Reclassification (`backend/tools/ToolOrchestrator.py`)**
  - **Tier A (Sync, Fast):** Map `openapi-validator`, `eslint`, and `faker` to run instantly without approval.
  - **Tier B (Async, Dangerous):** Map `docker-compose up`, `terraform apply`, and CI triggers to mandate explicit developer approval.
- `[ ]` **Task 0.4: Sidebar Subgraph for Phase 5 (Continuous Execution)**
  - Build a secondary, decoupled LangGraph subgraph for execution/monitoring agents (Performance, Chaos, Refactoring) triggered reactively on webhooks (file saves, git commits) rather than in the main DAG.
- `[ ]` **Task 0.5: SpecialistRouter Pattern for Agents 40-58**
  - Consolidate undefined domain nodes into a single `SpecialistRouter` node that reads the PRD for keywords (Blockchain, IoT) and dynamically loads the required specialized context.

---

## Phase 1: Discovery & Requirements Validation
**Goal:** Prevent logical flaws, scan existing codebases, and establish tech stacks.
*Agents: Repository Intelligence, Ingestor, Clarifier, Logician, Governor, Security*

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 1.1: State Schema Enrichment (`backend/agents/state.py`)**
  - Add `repo_intelligence_context`, `tech_stack_advisory`, and `threat_model_advisories` to `AgentState(TypedDict)`.
- `[ ]` **Task 1.2: Implement Repository Intelligence Agent**
  - Create a new node that uses tools to read the user's existing Git repository, extracting folder structures, coding conventions, and existing dependencies into `repo_intelligence_context`.
- `[ ]` **Task 1.3: Repurpose Security Node (`backend/agents/nodes.py`)**
  - Rewrite prompt: "Act as a Principal AppSec Engineer. Output a JSON Threat Model (STRIDE framework) and define AuthN/AuthZ strategies."
- `[ ]` **Task 1.4: Update UI Telemetry (`frontend/src/components/OrchestrationHub.tsx`)**
  - Map `security_intel` to `state.threat_model_advisories` and render with an `AlertBanner` component.

---

## Phase 2: Architecture & Design
**Goal:** Generate rock-solid architecture and enforce Architectural Drift Guardrails.
*Agents: Architect, Service Architecture Mesh, DB Architect, UXIntelligence*

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 2.1: Schema Updates (`backend/agents/state.py`)**
  - Add `api_design_spec`, `db_schema_design`, and `visual_architecture` (Mermaid.js).
- `[ ]` **Task 2.2: Repurpose Architect Node (`backend/agents/nodes.py`)**
  - Rewrite prompt: "Output pure `Mermaid.js` syntax for C4 System Context diagrams representing the PRD."
- `[ ]` **Task 2.3: Implement Service Architecture Mesh**
  - Consolidate the old `API Designer`, `GraphQL`, and `Microservices` agents into a single `service_architecture_mesh_node`. Prompt it to dynamically select REST vs GraphQL and output the strict OpenAPI/GraphQL spec.
- `[ ]` **Task 2.4: Interactive UI Integration (`frontend/src/components/OrchestrationHub.tsx`)**
  - Integrate `mermaid` and `swagger-ui-react`. Create `<ArchitectureDiagram />` and `<ApiPlayground />` components.

---

## Phase 3: The Development Forge
**Goal:** Auto-generate TDD contracts, then use specialized Forges for decentralized code generation.
*Agents: Engineering Contract, Frontend Forge, Backend Forge, Database Forge, APIValidation*

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 3.1: Enforce Engineering Contract Lock (`backend/agents/workflow.py`)**
  - Rename the `Creator` node to `engineering_contract_node`. Prompt it to output strict Acceptance Criteria, Definition of Done, and TDD Unit Tests.
  - Modify routing logic so that no **Forge** node executes until `engineering_contract_node` populates `state['test_cases']`.
- `[ ]` **Task 3.2: Implement The Specialized Forges (`backend/agents/nodes.py`)**
  - Delete the monolithic `Coder` agent.
  - Create parallel LangGraph nodes: `frontend_forge_node`, `backend_forge_node`, and `database_forge_node`. 
  - Restrict their inputs so the `backend_forge_node` only receives the DB schema and OpenAPI spec to prevent token overflow and monolithic hallucinations.
- `[ ]` **Task 3.3: API Contract Guardrail**
  - Update `api_validation_node` to cross-check the Frontend Forge's API calls against the Service Architecture Mesh's spec.
- `[ ]` **Task 3.4: Red-Green-Refactor UI (`frontend/src/components/OrchestrationHub.tsx`)**
  - Build `<TDDStatusIndicator />` that glows RED when contracts exist but Forge code is missing/failing.

---

## Phase 4: Delivery & Operations
**Goal:** Enforce Zero-Trust DevOps Guardrails and provision environments.
*Agents: EnvOps, Delivery, SRE, Tracing*

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 4.1: DevOps Payload Definitions (`backend/agents/state.py`)**
  - Add `devops_manifests: Annotated[Dict, _merge_dict]`.
- `[ ]` **Task 4.2: Repurpose EnvOps/Delivery Nodes (`backend/agents/nodes.py`)**
  - Update `env_ops_node`: "Generate a multi-stage, zero-trust `Dockerfile` (non-root) and a `devcontainer.json`."
  - Update `progressive_delivery_node`: "Generate GitHub Actions YAML with mandatory Snyk/Dependabot security scans."
- `[ ]` **Task 4.3: Actionable UI Code Blocks (`frontend/src/components/OrchestrationHub.tsx`)**
  - Render Phase 4 outputs using `<SyntaxHighlighter language="yaml">` with a custom "Copy to Clipboard" hook.

---

## Phase 5: Quality Engineering & Continuous Assurance
**Goal:** Live V&V execution, Legacy Refactoring, and Cryptographic Passports.
*Agents: Performance, Chaos, TestImpact, Refactoring, Migration, Auditor*

### 🛠️ Actionable Execution Tasks:
- `[ ]` **Task 5.1: In-Workspace Execution API (`backend/api/routes/tools.py`)**
  - Create `@router.post("/execute-sandbox")` to run `npm test` or `pytest` via Python `subprocess`/Docker API.
- `[ ]` **Task 5.2: Refactoring & Migration Agents (`backend/agents/nodes.py`)**
  - Create `refactoring_node` to read legacy code, highlight code smells, and suggest architectural modernizations.
  - Create `migration_node` to output safe SQL migrations (e.g., Alembic) and API deprecation strategies.
- `[ ]` **Task 5.3: Cryptographic V&V Passports (`backend/core/audit.py` & `nodes.py`)**
  - Update `traceability_auditor_node`. Use `hashlib` to generate an immutable JSON "V&V Passport" containing the SHA-256 hash of execution logs.
- `[ ]` **Task 5.4: Execution UX (`frontend/src/components/OrchestrationHub.tsx`)**
  - Build `<ExecutionPanel />` to call `/execute-sandbox` and `<RefactoringSuggestions />` panel.
