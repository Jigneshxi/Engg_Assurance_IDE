# Project Architectural Structure and Placement Rules

When reading, creating, or modifying code in this repository, strictly adhere to the established modular architecture:

## 1. Directory Ownership & Placement
* **`apps/ide-frontend/`**: The developer UI (React 19 / Monaco / Vite). All frontend pages, components, CSS, and UI state belong exclusively here.
* **`packages/python-engine/`**: The Python analysis and validation toolchain. Manages the Python bridge, `.venv`, and `requirements-validation.txt`.
* **`server/core/`**: Core orchestrator, LLM router (`llmRouter.js`), scaffolding (`workspaceScaffolds.js`), architecture contracts, foundation templates, and dynamic path resolution (`projectPaths.js`).
* **`server/validators/`**: Deterministic quality gates (security, DB, runtime, API authz, frontend contracts, manifest, workflow, stack allowlist).
* **`server/agents/`**: Autonomous repair engine (`repairEngine.js`) and AST endpoint guards.
* **`server/runtime/`**: Execution sandboxing (`validationRuntime.js`), dependency provisioning (`validationSetup.js`), and Python discovery.
* **`tests/`**: Maintained unit, repair, and validator regression test suites.
* **`workspaces/`**: All generated customer web applications (e.g. `quickcart-ecommerce-platform`). Never place transient test files directly in root.
* **`scripts/`**: Standalone developer tools, diagnostics, and scenario runners.

## 2. Path Resolution Rule
Never assume fixed directory depth (e.g. `../../..`). Always use `findProjectRoot()` or canonical constants exported from `server/core/projectPaths.js` (`PROJECT_ROOT`, `WORKSPACES_DIR`, `PACKAGES_DIR`, `APPS_DIR`, etc.).

## 3. Backward Compatibility
The root of `server/` exposes barrel re-exports (`server/index.js` and module shims) so that both legacy relative imports and modern modular imports (`server/core`, `server/validators`) resolve seamlessly.
