
## UI Alignment: Execution Phases vs. Logical Phases
Currently, the Orchestration Hub UI groups the execution into **2 Macro-Execution Phases** separated by a **Human-In-The-Loop (HITL)** checkpoint. Here is how the 6 logical phases detailed above align with the physical UI design:

### UI Phase 1: "Strategic Blitz Analysis"
* **Covers Logical Phases:** Phase 1 (Strategic Intelligence) and the early parts of Phase 2 (Architecture).
* **Execution:** The mesh automatically runs the `ingestor`, `clarifier`, `architect`, and `governor` nodes.
* **The HITL Pause:** Execution **halts**. The UI presents the generated `Unified Context Contract` and any "Stop-The-Line" alerts (e.g., HIPAA triggers). Developers *must* explicitly approve the architectural constraints before code scaffolding begins.

### UI Phase 2: "Intelligence Command Center"
* **Covers Logical Phases:** Phase 3 (Forges), Phase 4 (QA), Phase 5 (SRE), and Phase 6 (Observability).
* **Execution:** Once the developer clicks "Approve," the mesh executes the remaining ~50 agents in massive parallel branches.
* **UI Representation:** You will see the UI dynamically render "Phase 4: EnvOps" and "Phase 5: V&V Compliance Passport" blocks as the intelligence streams in.

### UI Evolution Roadmap (v8 Codebase)
As we transition to the Enterprise OS defined in the implementation plan, the UI will evolve to match these deeper logical phases:
1. **Red-Green-Refactor Dashboards:** The UI will introduce a `<TDDStatusIndicator />` to visually show how the generated code is failing/passing the Phase 4 automation scripts in real-time.
2. **In-Workspace Sandbox Execution:** We are planning to introduce an `<ExecutionPanel />` that doesn't just show the code, but physically calls a `/execute-sandbox` backend API to run `npm test` or `pytest` directly in the browser.
3. **Conversational Guardrails:** Instead of a single static HITL pause between Phase 1 and 2, the UI will implement dynamic "Micro-Checkpoints". For example, if the `traceability_auditor` detects a destructive database command during Phase 3, it will inject a mid-flight HITL prompt directly into the UI feed.
