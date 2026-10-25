# Repository Constitution & Engineering Standards

This document serves as the master engineering constitution for the repository. All contributors—both human engineers and AI agents—must adhere strictly to these principles.

---

## 1. Priority Order of Decisions

When architectural, implementation, or design requirements conflict, resolving them must follow this absolute priority order:

1.  **Security & Privacy**: Zero trust, data protection, prompt injection resistance, and secret prevention.
2.  **Regulatory Compliance**: GDPR, CCPA, SOC2, and industry-specific regulations.
3.  **Reliability & Resilience**: High availability, fault tolerance, graceful degradation, and error isolation.
4.  **Data Integrity**: Transaction safety, validation at boundaries, and crash-safe operations.
5.  **Observability & Maintainability**: Semantic structured logging, comprehensive metrics, tracing, clean code, and developer ergonomics.
6.  **Performance & Cost Control**: Resource optimization, request latency, and LLM/API cost management.
7.  **Developer Convenience**: Tooling, local execution speeds, and deployment simplicity.

---

## 2. Engineering Principles

Every pull request and commit must satisfy these five pillars of delivery:

*   **Secure**: Evaluated against the threat model, with inputs validated and outputs sanitized.
*   **Testable**: Supported by robust, automated tests at all levels (Unit, Integration, E2E) without relying on manual steps.
*   **Observable**: Instrumenting structured logs, performance metrics, and distributed tracing.
*   **Reviewable**: Broken down into small, logical, and self-documenting changes.
*   **Reversible**: Safely roll-backable in production via feature flags, migration compatibility, or immediate version reverts.

---

## 3. Definition of Done (DoD)

A task or feature branch is considered complete only when:

- [ ] **Functional Integrity**: The feature meets all specifications and handles edge/error cases.
- [ ] **Unit Tests**: Minimum 80% line and branch coverage; 100% on critical business logic.
- [ ] **Integration/Contract Tests**: Verified data flow between APIs, databases, and third-party gateways.
- [ ] **Security Scans**: Clean check from static analysis (SAST), secrets detection, and dependency vulnerability scanners.
- [ ] **Accessibility (a11y)**: Fully compliant with WCAG 2.1 AA standards.
- [ ] **Observability**: Structured logs in place with correlation IDs; custom Prometheus metrics exposed for key actions.
- [ ] **Performance Validation**: Verification that memory consumption, DB queries, and LLM call counts are within optimal bounds.
- [ ] **Documentation**: Updated API specifications (OpenAPI/Swagger), inline source code documentation, and relevant README updates.
- [ ] **Code Review**: Approved by at least one human owner according to `CODEOWNERS` guidelines.
- [ ] **CI/CD Pipelines**: Successful execution of all tests, linters, formatters, and builds.

---

## 4. Coding & Language Standards

### TypeScript Standards (Strict Mode)
*   **Strict Compiler Options**: Must compile with strict mode enabled (`noImplicitAny`, `strictNullChecks`, `noImplicitReturns`, `noFallthroughCasesInSwitch`).
*   **No `any` Types**: The use of `any` is strictly prohibited. Use `unknown` with type guards or design interfaces.
*   **Immutability**: Prefer `readonly` modifiers, `const`, and immutable data patterns to prevent side effects.

### Python Standards
*   **Strict snake_case**: All variable names, function names, and module names must use `snake_case`. Classes must use `PascalCase`.
*   **Typing**: Leverage Python type hints (`typing` module) to maintain high code safety.

### General Architectural Principles
*   **Single Responsibility Principle (SRP)**: Keep classes and functions small and focused on a single responsibility.
*   **Dependency Injection**: Dependencies must be explicitly injected rather than globally instantiated or imported as singletons, ensuring high testability.
*   **Clean Architecture / Domain-Driven Design (DDD)**: Separate business logic (domain layer) from transport (API), persistence (database), and third-party clients.

### Frontend Architecture Standards
*   **Component Isolation**: Strictly separate presentational components (dumb) from container components (smart/data-fetching).
*   **State Management**: Avoid global state unless absolutely necessary. Rely on server-state caching tools (e.g., React Query) and keep local state scoped.

### Database Operations Standards
*   **Zero-Downtime Migrations**: All schema changes must be backward-compatible. Use the "Expand and Contract" pattern.
*   **Destructive Actions**: Never drop a column or table in a single release. Deprecate first, remove usage, and drop in a subsequent release.

---

## 5. Security Rules

### Secrets Management
*   **Zero Hardcoding**: Never hardcode credentials, tokens, API keys, certs, or private keys.
*   **Environment Variables**: Inject configuration dynamically via `.env` (using `.env.example` as a safe local reference) or cloud secrets managers (e.g., Vault, AWS Secrets Manager).

### Input/Output Validation
*   **Boundary Validation**: Treat every external input (API payloads, database outputs, files, third-party responses, and LLM outputs) as untrusted. Validate payloads immediately at the network boundary using libraries like Zod or Pydantic.
*   **Sanitization**: Sanitize output strings before outputting to UI (prevent XSS), generating SQL queries (prevent SQL injection), or interpreting as executable code.

---

## 6. Git & Branching Strategy

*   **Trunk-Based Development**: Short-lived feature branches branching off `main`/`master` are preferred.
*   **Protected Branches**: Branch policies enforce that `main`, `master`, and `release/*` require:
    *   No direct commits allowed.
    *   Signed commits (`gpg-signed`).
    *   Passing status checks in the CI/CD pipeline.
    *   Approved PR reviews.
*   **Change Risk Levels**:
    *   **Low**: Non-functional, doc changes, comment updates.
    *   **Medium**: Standard feature additions, refactoring.
    *   **High**: Architectural changes, critical dependencies, system integration updates. Requires design review.
    *   **Critical**: Major migrations, core security protocol revisions, breaking changes. Requires multi-stakeholder sign-off and an explicit rollback verification runbook.
