# Verification and Validation Process

## Purpose

This companion guide expands the V&V strategy referenced by `WoW_Process.md`. It defines how any project can build a reusable evidence system that proves product behavior, API contracts, user journeys, security boundaries, operational resilience, and release readiness.

Use this guide when a team needs deeper detail than the main Way of Working process should carry.

## Relationship to WoW_Process

- `WoW_Process_v0.1.md` defines the overall delivery process.
- `V_and_V_Process.md` defines the deeper verification and validation operating model.
- Project trackers, test reports, and coverage matrices provide the release evidence.
- CI and release gates enforce the critical checks.

The V&V process should not become a disconnected QA activity. It should run in the same delivery slice as planning, implementation, review, documentation, and release readiness.

## Guardrail Evidence Expectations

Triggered guardrails in `WoW_Process.md` define additional evidence expectations. Use `WoW_Process.md` for governance, pause conditions, approvals, and risk tiering. Use this file to define the proof strategy for those guardrails.

When a guardrail is triggered, V&V should answer:

- What evidence proves the guardrail is satisfied?
- What test, review, visual proof, audit event, log, trace, metric, or manual evidence is needed?
- What residual risk remains if full evidence cannot be collected?
- Who accepts the risk if the guardrail cannot be fully closed before release?

## V&V Philosophy

Verification confirms that the product was built correctly. Validation confirms that the product solves the right user and business problem.

A strong V&V system answers:

- What user journeys are supported?
- What business outcomes are protected?
- What APIs, screens, jobs, data flows, and integrations own each behavior?
- What can fail, and how does the product recover?
- Who is authorized to perform each action?
- What evidence proves the behavior works now?
- What risk remains before release?

Avoid claiming quality only from line coverage, test count, or green builds. Those signals are useful, but incomplete without journey, contract, security, data, operational, and usability proof.

## Standard V&V Workspace Structure

Each project should maintain a dedicated verification folder or equivalent test area.

Recommended structure:

```text
project_tests/
  api/              # API, service, contract, schema, RBAC, and error-path tests
  unit/             # Code-level unit tests if not already colocated with source
  integration/      # Module-to-module or service-to-service tests
  e2e/              # End-to-end business journey tests
  ui/               # Browser, mobile, visual, accessibility, and navigation tests
  performance/      # Load, concurrency, latency, quota, retry, and resilience tests
  security/         # Auth, authorization, tenant isolation, injection, and exposure tests
  data/             # Migration, integrity, import/export, and reconciliation tests
  helpers/          # Shared fixtures, clients, auth helpers, report builders
  reports/          # Generated JUnit, HTML, screenshots, videos, matrices
  COVERAGE_PROGRESS.md
  COVERAGE_OWNERSHIP_MATRIX.md
  JOURNEY_COVERAGE_MAP.md
```

Project teams may rename folders, but the responsibilities should remain visible.

## Ad-Hoc Project V&V Bootstrap Mode

Use this mode when a project starts with manual testing only, no reliable automated tests, no dedicated V&V folder, weak evidence history, or an ad-hoc codebase that has grown without a clear quality system.

This mode does not require separate specialist agents. A single AI collaborator can perform each pass sequentially. The bracketed agent name is the responsibility lens for that pass, not a requirement that a project has a real specialized agent installed.

### 1. Discovery Pass [Discovery Agent]

Understand the project before proposing or writing tests.

Actions:

- Scan source folders, entry points, frontend routes, backend APIs, jobs, workers, configs, scripts, migrations, deployment files, and documentation.
- Identify frameworks, package managers, runtime commands, test frameworks, CI/CD setup, database usage, and integration points.
- Find manual test notes, screenshots, issue reports, README files, user manuals, API docs, and workflow descriptions.
- Record what evidence already exists and what is missing.

Outputs:

- Feature inventory
- API, screen, job, worker, and integration inventory
- Known commands and environment assumptions
- Existing evidence summary
- Missing V&V infrastructure summary

### 2. Risk Classification Pass [Risk Classifier Agent]

Prioritize the first validation work by user impact and failure risk.

Actions:

- Classify each feature, API, screen, job, data flow, and integration as `Low`, `Medium`, `High`, or `Critical`.
- Mark sensitive flows such as login, permissions, tenant isolation, payments, approvals, exports, data deletion, admin actions, background jobs, external integrations, and production configuration.
- Identify data-loss, security, privacy, compliance, operational, and rollback risks.

Outputs:

- Risk-ranked coverage backlog
- Critical journey list
- First test priorities

### 3. Traceability Pass [Traceability Agent]

Connect behavior to proof.

Actions:

- Map user journeys, business rules, APIs, UI screens, roles, permissions, jobs, data flows, and integrations to expected validation evidence.
- Convert manual test steps into automation candidates.
- Mark each item as `Verified`, `Manual Only`, `Reviewed`, `Blocked`, `Not Covered`, or `Not Required`.

Outputs:

- Requirement-to-evidence matrix
- Manual-flow-to-automation candidate list
- Missing evidence list

### 4. V&V Bootstrap Pass [Test Strategy Agent]

Create the minimum practical V&V structure from zero.

Actions:

- Detect the right test location based on project stack and existing conventions.
- If no test folder exists, create or propose a lightweight structure such as `project_tests/`, `tests/`, `e2e/`, `api/`, `ui/`, or framework-native folders.
- Define the first useful layers: smoke, regression, API, integration, UI/E2E, accessibility, security, and performance only where relevant.
- Avoid overengineering the first structure. Start small enough that it will actually be used.

Minimum bootstrap structure:

```text
project_tests/
  README.md
  COVERAGE_PROGRESS.md
  COVERAGE_OWNERSHIP_MATRIX.md
  MANUAL_FLOWS.md
  api/
  ui/
  e2e/
  evidence/
```

Outputs:

- Test folder strategy
- Initial command list
- Bootstrap tracker
- First coverage matrix

### 5. Characterization Test Pass [Test Generation Agent]

Protect current important behavior before changing it.

Actions:

- Add tests that capture current behavior for critical paths, even if the legacy implementation is imperfect.
- Prioritize the active bug reproduction, critical happy paths, known risky workflows, and previously manual smoke checks.
- Do not claim correctness from generated tests until they are executed and reviewed.

Outputs:

- First smoke tests
- First regression tests for active issues
- Baseline behavior proof

### 6. Execution Pass [Execution Agent]

Run safe commands and collect real results.

Actions:

- Run allowed unit, API, UI, E2E, lint, type-check, coverage, or build commands.
- Capture pass, fail, skipped, deselected, blocked, and warning counts.
- Separate `Not Run`, `Manual Only`, `Reviewed`, and `Verified` evidence.
- If execution is blocked, document the blocker and the impact on release confidence.

Outputs:

- Test execution results
- Logs and reports
- Failure list
- Blocked test list

### 7. Evidence Capture Pass [Evidence Agent]

Make validation auditable.

Actions:

- Store or reference screenshots, videos, logs, JUnit reports, HTML reports, coverage reports, API responses, console output, traces, and manual verification notes.
- Link evidence to the coverage matrix.
- Mark stale, partial, indirect, missing, or blocked evidence explicitly.

Outputs:

- Evidence package
- Coverage proof references
- Stale or missing evidence list

### 8. Gap Review Pass [Gap Review Agent]

Compare expected coverage against actual proof.

Actions:

- Compare the inventory against tests and evidence.
- Identify missing positive, negative, permission, tenant, data, error, edge, accessibility, usability, performance, recovery, and security coverage.
- Prioritize gaps by risk and release impact.

Outputs:

- Coverage gap list
- Next automation backlog
- Risk-based hardening plan

### 9. Release Gate Pass [Release Gate Agent]

Give a truthful go/no-go position.

Actions:

- Summarize what is verified, partially verified, manually checked, reviewed only, blocked, or not covered.
- Call out critical residual risks and release conditions.
- Recommend `Go`, `Limited Go`, `No-Go`, or `Blocked` based on evidence, not optimism.
- Never mark release-ready based only on code review or generated tests.

Outputs:

- Go/no-go recommendation
- Residual risk list
- Required approvals
- Next hardening items

### Minimum First-Day Bootstrap Target

For a project starting with manual testing only, the first practical target is:

- Create one coverage matrix.
- Document one critical manual flow.
- Add one executable smoke test.
- Add one regression test for the active issue.
- Automate one critical API or UI journey.
- Create one evidence location.
- Produce one gap list.

### Bootstrap Operating Rules

- Discover from the project before asking broad questions.
- Ask only when credentials, secrets, destructive actions, production access, or business decisions are required.
- Do not say `100% covered` unless the evidence matrix proves it.
- Manual evidence is allowed initially, but it must be labeled `Manual Only`.
- Generated tests are not proof until executed.
- Every bug fix should add or update at least one regression test where practical.
- Every release-readiness statement must distinguish `Verified`, `Reviewed`, `Manual Only`, `Blocked`, and `Not Covered`.

## Coverage Inventory

Create an inventory before claiming coverage completeness.

Inventory sources should include:

- Product requirements and acceptance criteria
- User manual or operator guide
- Engineering guide and architecture notes
- API schema, OpenAPI contract, GraphQL schema, message contracts, or SDK surface
- UI navigation map, screen inventory, menu tree, and command palette
- Jobs, workers, schedulers, queues, and workflow engines
- Database schemas, migrations, import/export flows, and retention policies
- Integrations, webhooks, files, events, and third-party services
- Security, RBAC, tenant, privacy, compliance, and audit requirements
- Production incidents, support tickets, defect history, and known risk areas

For each inventory item, record whether it has direct proof, indirect proof, partial proof, or no proof.

## Coverage Dimensions

Every important behavior should be evaluated across multiple dimensions.

Minimum dimensions:

- Positive path: intended use works.
- Negative path: invalid, missing, unauthorized, or malformed input fails safely.
- RBAC and permission path: allowed and denied users are handled correctly.
- Isolation path: tenant, account, project, workspace, organization, or customer boundaries hold.
- Data integrity path: saved, updated, deleted, exported, and reconciled data is correct.
- Idempotency path: retries, duplicate clicks, duplicate requests, and replays do not corrupt state.
- Audit path: security-sensitive and business-sensitive changes produce usable evidence.
- Error path: users and operators see clear recovery guidance.
- Performance path: volume, latency, concurrency, quota, and retry behavior meet expectations.
- Accessibility path: keyboard, focus, labels, contrast, and announcements work for supported surfaces.
- Observability path: logs, metrics, traces, and correlation IDs support production diagnosis.

Not every dimension needs the same depth for every feature, but skipped dimensions should be explicit.

## Coverage Ownership Matrix

Build a matrix that maps each operation, screen, or user journey to test ownership.

Recommended columns:

```text
Area | Behavior | Source | Owner | Positive | Negative | RBAC | Isolation | Audit | Idempotency | Performance | UI/E2E | Evidence | Risk | Status
```

Status values:

- Covered: direct automated or documented manual proof exists.
- Partial: only some dimensions are covered.
- Indirect: covered through a broader journey, not directly.
- Gap: no proof yet.
- Blocked: dependency, environment, data, or product decision is missing.
- Not Required: intentionally excluded with reason.
- Roadmap: valuable but outside the current release scope.

The matrix should be a release artifact, not a one-time audit.

## Test Layers

Use layered tests so failures are fast to diagnose.

### Unit Tests

Use unit tests for deterministic logic:

- Validation
- Formatting
- Permission calculations
- Policy evaluation
- State transitions
- Data transformations
- Error classification

### Contract and API Tests

Use API and contract tests for service behavior:

- Schema shape
- Required fields
- Status codes
- Auth and RBAC
- Tenant or account isolation
- Idempotency
- Audit events
- Error messages
- Pagination, filtering, sorting, and exports

### Integration Tests

Use integration tests when behavior crosses modules:

- API plus database
- API plus background job
- Workflow plus task execution
- Scheduler plus due trigger
- File upload plus parser
- Export plus artifact download
- Auth plus permission enforcement

### End-to-End Tests

Use E2E tests for critical business journeys:

- First login
- Create, edit, execute, and monitor workflows
- Create role, assign skills, assign user, and verify access
- Upload or configure assets, approve, publish, and consume downstream
- Review approval, inspect evidence, and complete recovery
- Export report and verify artifact availability

### UI and Visual Tests

Use UI tests to protect user experience:

- Navigation and workspace routing
- Button and form behavior
- Empty, loading, error, offline, and partial-data states
- Responsive layout and panel containment
- Visual layout drift for high-risk screens
- Keyboard and focus journeys
- Theme contrast and readability

### Performance and Resilience Tests

Use performance tests for production confidence:

- Load and concurrency
- Duplicate submissions
- Retry and polling behavior
- Rate limit and quota behavior
- Export polling
- Scheduler polling
- Long-running jobs
- Reconnect and stale-state recovery

## API Coverage Standard

For each API operation, define the expected coverage level.

High-risk operations should include:

- Positive request
- Negative validation request
- Unauthorized request
- Wrong-role request
- Wrong-tenant or wrong-account request
- Duplicate or retry request where relevant
- Audit event assertion where relevant
- Error payload assertion
- Performance or concurrency owner where relevant

Do not claim full API coverage only because every endpoint has one happy-path test. Full API coverage means the operation is covered across the dimensions that matter for its risk profile.

## UI and Journey Coverage Standard

For every user-facing module, screen, or command, define:

- Purpose of the screen
- Primary persona
- Main user task
- Entry points and navigation paths
- Required controls and states
- Expected success outcome
- Expected empty, loading, partial, offline, and error states
- Related downstream screens or reports
- Accessibility and keyboard expectations
- Visual layout risk

UI tests should verify behavior, not only text presence.

## Data and Migration Coverage

Data changes require explicit proof.

Cover:

- Schema migrations
- Backward compatibility
- Seed data and fixture integrity
- Tenant or account scoping
- Deletion and soft-delete behavior
- Export and import reconciliation
- Data retention and archival
- Rollback or recovery path

When data loss is possible, include review proof and rollback notes.

## Security and Privacy Coverage

Security-sensitive flows require negative proof, not only positive proof.

Cover:

- Authenticated and unauthenticated access
- Allowed and denied roles
- Tenant, organization, account, or project isolation
- Header, token, or context spoofing
- Sensitive data masking
- Secrets handling
- Audit events
- Rate limiting and abuse behavior
- Export and download permissions

Frontend hiding is usability support. Backend enforcement is the security control.

## Accessibility Coverage

Accessibility proof should be included for production UI.

Cover:

- Keyboard navigation
- Focus order and focus visibility
- Form labels and validation messages
- Dialogs, menus, dropdowns, and modals
- Color contrast and theme readability
- Screen reader names for controls
- Dynamic updates and loading states
- Error announcements and recovery actions

Accessibility issues should be treated as release risks when they block primary journeys.

## Observability Coverage

A feature is not production-ready if it cannot be diagnosed.

Verify:

- Logs include meaningful events without leaking sensitive data.
- Metrics capture success, failure, latency, volume, saturation, and retries.
- Traces or correlation IDs connect UI, API, jobs, and integrations.
- Audit events exist for sensitive actions.
- User-facing errors include clear next steps.
- Operators can distinguish backend unavailable, backend not ready, permission denied, validation failed, and partial-data states.

## AI Verification and Evaluation Coverage

Use this section when the product includes AI features, model calls, prompts, tools, memory, retrieval, recommendations, AI-generated actions, or agentic workflows.

AI verification should prove that the AI behavior is useful, bounded, auditable, and recoverable. Do not claim AI readiness only from manual demos or happy-path prompt checks.

### AI Evaluation Dimensions

Evaluate AI behavior across the dimensions relevant to the use case:

- Task success: the output helps complete the intended user or business task.
- Grounding: generated output is supported by available context, source data, or traceable evidence.
- Hallucination resistance: unsupported claims, invented APIs, fake data, or false citations are detected or prevented.
- Safety: unsafe, destructive, policy-violating, or excessive-agency behavior is blocked or routed to approval.
- Privacy: sensitive, tenant, customer, regulated, or secret data is not exposed in prompts, logs, memory, outputs, or third-party calls.
- Bias and fairness: sensitive user-impacting decisions are reviewed where the domain requires it.
- Refusal behavior: the system safely refuses or escalates unsupported, unsafe, or unauthorized requests.
- Recovery: users can inspect, correct, reject, retry, or escalate AI output.

### Prompt, Model, Tool, and Policy Version Coverage

AI release evidence should identify:

- Prompt version.
- Model or provider version where available.
- Tool definitions and permission scope.
- Retrieval source and memory scope.
- Policy or approval rules.
- Evaluation dataset or scenario set.
- Known limitations and residual risk.

Changes to prompts, model routing, tool permissions, memory behavior, or policy rules should be treated as behavior changes and should trigger targeted regression evaluation.

### Agent Tool-Call Coverage

For AI agents with tools, verify:

- Tool allowlist and least-privilege permissions.
- Dry-run or preview behavior for risky actions.
- Confirmation gates for destructive, privileged, or customer-visible actions.
- Tenant, workspace, project, customer, and data-boundary enforcement.
- Failure, retry, timeout, unavailable-backend, and partial-result behavior.
- Audit events for tool calls, inputs, outputs, approvals, failures, retries, and operator overrides.
- Rollback, disable, or kill-switch behavior for unsafe tool paths.

### AI Safety and Abuse Coverage

High-risk AI systems should include negative and abuse-oriented checks:

- Prompt injection.
- Jailbreak attempts.
- Data exfiltration attempts.
- Tool misuse.
- Privilege escalation.
- Memory poisoning or stale memory use.
- Retrieval poisoning or untrusted context use.
- Cascading hallucination across multi-step or multi-agent workflows.
- Unauthorized action attempts.

### AI Runtime Observability Evidence

AI runtime evidence should support production diagnosis and incident response.

Capture where appropriate:

- Prompt, model, policy, tool, and memory version identifiers.
- Request IDs, tenant or workspace context, and correlation IDs.
- Approval events and human override events.
- Refusal, escalation, fallback, and recovery events.
- Tool-call success, failure, latency, retry, and quota signals.
- Safety filter, policy decision, and blocked-action counts.
- Cost, token, latency, drift, and quality signals where applicable.

## Gated Test Strategy

Separate fast deterministic tests from environment-dependent tests.

Recommended gates:

- Fast local gate: unit, component, static, and contract tests.
- API deterministic gate: API tests with controlled fixtures or in-memory services.
- Integration gate: real database, jobs, queues, or services.
- Live service gate: deployed or locally running full stack.
- UI gate: browser-driven journeys and visual checks.
- Performance gate: load, concurrency, polling, quota, and resilience.
- Security gate: auth, RBAC, isolation, injection, and exposure checks.

Use environment flags for expensive or live tests so they can run intentionally without slowing every local iteration.

## TDD Bug-Fix Workflow

For each bug:

1. Capture the right behavior.
2. Reproduce the observed behavior.
3. Write failing proof when practical.
4. Identify root cause.
5. Assess change impact and regression risk.
6. Implement the smallest complete fix.
7. Run targeted tests.
8. Run adjacent regression tests.
9. Re-audit when risk is high.
10. Update tracker, docs, and coverage matrix.

If automated proof is not practical, capture a reproducible manual or visual proof.

## Visual Testing Workflow

Use visual testing when UI behavior, layout, or user journey clarity is part of the risk.

Visual proof should include:

- Browser and viewport settings
- Theme or mode used
- Starting route
- Steps performed
- Scroll position when relevant
- Screenshots or video evidence
- Expected visible state
- Any known limitations

Visual testing should not replace automated assertions. It complements them for usability and layout confidence.

## Release Evidence Package

Before release, collect evidence in a predictable place.

Recommended package:

- Coverage progress tracker
- Ownership matrix
- Test command summary
- Pass/fail/skip counts
- JUnit or HTML reports
- Screenshots or videos for critical UI flows
- API coverage inventory
- Known warnings and their release impact
- Residual risks and owners
- Manual verification notes where automation is not practical

The evidence package should allow a reviewer to understand release confidence without re-running every test.

## Release Readiness Criteria

A project is release-ready when:

- Critical user journeys have executable proof.
- Critical APIs or contracts have direct owners.
- Security, RBAC, isolation, data, and audit risks have explicit evidence.
- Live or environment-dependent suites are green or explicitly risk-accepted.
- UI and UX critical paths are visually and functionally verified.
- Documentation, tracker, and test evidence agree with the current product.
- Residual risks are documented and acceptable for the release.

## Reusable Adoption Steps

For a new project:

1. Create the V&V folder structure.
2. Inventory user journeys, APIs, screens, jobs, integrations, and data flows.
3. Build a coverage ownership matrix.
4. Add fast deterministic tests for core contracts.
5. Add live or integration tests for the most valuable journeys.
6. Add UI or visual tests for high-risk screens.
7. Add security, isolation, and permission tests for sensitive flows.
8. Add performance and resilience tests for production-critical paths.
9. Generate reports and update the tracker.
10. Make the V&V tracker part of release readiness.

Start small, but keep the structure honest from day one.
