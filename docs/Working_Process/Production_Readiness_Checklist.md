# Production Readiness Checklist

## Purpose

This companion checklist supports the post-completion production-readiness reminder in `WoW_Process.md`.

Use it after the requested job is complete and verified, and only when the user approves a readiness reminder pass. The checklist is reusable across projects. A project-specific tracker records which items are Done, Risk Accepted, Not Required, Roadmap, Blocked, or still pending.

## Usage Rules

- Do not use this checklist to interrupt the requested job.
- Run the reminder pass only after the requested job is complete and verified.
- Identify only checklist items relevant to the completed work.
- Ask permission before adding anything to a project tracker.
- Avoid duplicate tracker entries by checking existing tracker items first.
- Use `V_and_V_Process.md` to define the evidence needed for each readiness item.
- Do not run every checklist item for every small task. Select items by risk profile and triggered guardrails.
- For release go-live, major migration, security-sensitive, tenant-sensitive, data-sensitive, or production-impacting work, review all relevant checklist categories.

## Release Gate Severity

Use severity to separate blockers from hardening work.

- P0 blocker: security exposure, data loss, tenant/customer leak, broken auth/RBAC/session behavior, no rollback for critical change, no owner for critical failure path, no critical journey proof, or unresolved stop-the-line guardrail.
- P1 release risk: missing SLO/health objective, weak observability, partial disaster recovery proof, unproven third-party fallback, incomplete support path, or material residual risk without owner.
- P2 hardening: cost optimization, documentation polish, non-critical visual evidence, non-blocking accessibility improvement, or longer-term maturity improvement.

## Checklist Use Guidance

- Use only impacted items for small verified changes.
- Use impacted items plus triggered guardrails for medium-risk work.
- Use all relevant categories for high-risk work, release hardening, production go-live, migrations, security-sensitive changes, tenant-sensitive changes, data changes, and AI runtime changes.
- Record risk acceptance explicitly when a relevant item cannot be completed before release.

## Project Tracker Recommendation

Each project should maintain a tracker such as:

```text
docs/Production_Readiness_Tracker.md
```

Recommended tracker columns:

```markdown
| ID | Category | Gap | Priority | Owner/Module | Evidence Needed | Status | Date Added | Last Updated |
|----|----------|-----|----------|--------------|-----------------|--------|------------|--------------|
```

Recommended statuses:

- Not Started
- In Progress
- Done
- Risk Accepted
- Not Required
- Roadmap
- Blocked

## Master Checklist

### PR-FUNC: Functional Completeness

Readiness question:

- Does the feature or fix fully support the intended user and business outcome?

Why it matters:

- Incomplete behavior creates support burden, user distrust, and hidden release risk.

Evidence expected:

- Acceptance criteria proof.
- Positive and negative behavior checks.
- Known limitations documented.
- User-facing behavior aligned with current documentation.

Typical validation:

- Unit, integration, API, UI, or manual journey proof depending on the surface.

### PR-JOURNEY: User Journey Coverage

Readiness question:

- Can the target user complete the full journey from entry point to expected outcome?

Why it matters:

- Features are experienced as workflows, not isolated functions.

Evidence expected:

- Journey map or scenario.
- End-to-end test or documented manual proof.
- Empty, loading, error, and recovery state review where relevant.

Typical validation:

- E2E test, guided visual test, or manual verification with screenshots.

### PR-API: API and Contract Coverage

Readiness question:

- Are API contracts, schemas, status codes, validation paths, and error payloads covered?

Why it matters:

- API drift breaks UI, integrations, automation, and downstream services.

Evidence expected:

- Positive and negative API tests.
- Auth and permission checks.
- Schema or contract assertions.
- Error response validation.

Typical validation:

- API tests, contract tests, integration tests, OpenAPI or schema checks.

### PR-UI: UI, E2E, and Visual Coverage

Readiness question:

- Does the UI remain usable, consistent, responsive, and functionally correct?

Why it matters:

- Visual regressions and broken controls often escape backend-only testing.

Evidence expected:

- Critical UI controls tested.
- Layout and responsiveness reviewed.
- Visual drift checked for high-risk screens.
- Browser or device coverage noted where relevant.

Typical validation:

- Component tests, Playwright or browser tests, visual screenshots, manual walkthrough.

### PR-A11Y: Accessibility

Readiness question:

- Can users navigate and understand the feature with keyboard and assistive technology expectations?

Why it matters:

- Accessibility is a release-quality requirement, not optional polish.

Evidence expected:

- Keyboard flow review.
- Focus order and visible focus.
- Labels and accessible names.
- Contrast and theme readability.
- Error announcement and recovery behavior.

Typical validation:

- Accessibility checks, keyboard walkthrough, screen-reader-oriented review where practical.

### PR-SEC: Security, RBAC, Isolation, and Privacy

Readiness question:

- Are sensitive actions protected by backend enforcement and privacy-safe behavior?

Why it matters:

- UI hiding is not security. Authorization, tenant isolation, and privacy must be enforced by the system.

Evidence expected:

- Authenticated and unauthenticated checks.
- Allowed and denied role checks.
- Tenant, account, project, or organization isolation checks.
- Sensitive-data masking.
- Audit evidence for sensitive actions.

Typical validation:

- Security tests, RBAC tests, tenant isolation tests, audit assertions.

### PR-DATA: Data Integrity, Migration, Backup, and Rollback

Readiness question:

- Does the change preserve data correctness and provide recovery options?

Why it matters:

- Data loss, corruption, or unrecoverable migration failures are high-severity release risks.

Evidence expected:

- Migration and rollback notes.
- Data reconciliation checks.
- Import/export validation where relevant.
- Backup or recovery assumptions documented.
- Idempotency and retry behavior reviewed.

Typical validation:

- Migration tests, reconciliation tests, export/import tests, rollback proof, idempotency tests.

### PR-DR: Disaster Recovery, Restore, and Business Continuity

Readiness question:

- Can the team recover service and data within acceptable recovery expectations after a serious failure?

Why it matters:

- Production incidents can involve infrastructure failure, data corruption, regional outage, queue failure, failed migration, or dependency failure.
- Recovery confidence requires rehearsal, not only backup existence.

Evidence expected:

- RTO and RPO expectations documented where relevant.
- Backup, restore, failover, and recovery ownership defined.
- Restore or failover rehearsal completed for critical systems.
- Data reconciliation and integrity checks available after recovery.
- Business continuity or manual workaround path documented for critical user journeys.

Typical validation:

- Restore test, failover exercise, backup verification, recovery runbook review, data reconciliation check.

### PR-OBS: Observability, Logging, Metrics, Traces, and Audit

Readiness question:

- Can the team diagnose the behavior in production?

Why it matters:

- Production issues should be diagnosable without asking users to reproduce repeatedly.

Evidence expected:

- Logs for important state changes and failures.
- Metrics for success, failure, latency, volume, retries, and saturation where relevant.
- Traces or correlation IDs across UI, API, jobs, and integrations.
- Audit events for sensitive operations.
- User-facing errors with recovery guidance.
- Service health, SLI, or SLO signals identified where relevant.

Typical validation:

- Log review, metric assertion, trace walkthrough, audit test, simulated failure path.

### PR-SLO: Service Levels, Error Budgets, and Health Objectives

Readiness question:

- Are reliability expectations defined for the changed service, journey, API, job, or user-facing capability?

Why it matters:

- Teams need objective health targets to decide whether to ship, pause, roll back, or harden.
- Without SLOs or health objectives, release decisions rely on opinion instead of operational signals.

Evidence expected:

- Critical user journey, API, job, or workflow health objective documented.
- SLI or measurable health signal identified.
- SLO, error budget, or acceptable failure threshold defined where relevant.
- Alert or dashboard connected to the health signal.
- Release or rollback decision rule documented for SLO-impacting changes.

Typical validation:

- Dashboard review, alert review, SLI/SLO check, simulated failure, release decision review.

### PR-PERF: Performance, Load, Quotas, and Resilience

Readiness question:

- Does the system behave acceptably under expected load, concurrency, retries, and quota limits?

Why it matters:

- A feature can be functionally correct but production-unsafe under realistic usage.

Evidence expected:

- Latency and throughput expectations.
- Concurrency or duplicate-action behavior.
- Retry and timeout behavior.
- Rate limit or quota behavior.
- Graceful degradation or recovery.

Typical validation:

- Load tests, concurrency tests, polling tests, retry tests, quota simulations.

### PR-OPS: Deployment, Release, Rollback, and Feature Flags

Readiness question:

- Can the change be deployed, observed, rolled back, or disabled safely?

Why it matters:

- Release safety depends on operational control, not only code correctness.

Evidence expected:

- Deployment notes.
- Rollback or disablement path.
- Feature flag or staged rollout plan where relevant.
- Environment compatibility checks.
- Release notes and owners.
- Rollout strategy, blast-radius control, or post-release monitoring window noted where relevant.

Typical validation:

- Deployment dry run, environment smoke test, rollback rehearsal, feature flag verification.

### PR-ROLLOUT: Progressive Delivery, Change Management, and Post-Release Monitoring

Readiness question:

- Can the change be introduced gradually, monitored after release, and stopped before broad impact?

Why it matters:

- Production safety improves when releases control blast radius and include clear post-release observation.
- Large releases, migrations, AI behavior changes, and risky UI/API changes need controlled rollout rather than all-or-nothing deployment.

Evidence expected:

- Rollout mode selected: direct, canary, ring, staged tenant, feature flag, or limited beta.
- Blast radius and target audience understood.
- Post-release monitoring window defined.
- Owner assigned for rollout observation and rollback decision.
- Stakeholder communication or change notice prepared where relevant.

Typical validation:

- Rollout plan review, canary or staged release check, post-release dashboard review, rollback decision drill.

### PR-CACHE: Client Versioning, Cache, Storage, and Upgrade Compatibility

Readiness question:

- Will users receive the latest client behavior after deployment without stale assets, stale local state, or incompatible cached data?

Why it matters:

- Browser caches, service workers, local storage, session storage, mobile app state, and backward-incompatible API changes can keep users on broken or outdated behavior after release.

Evidence expected:

- Asset versioning or cache-busting strategy documented.
- Service worker or PWA update behavior checked where relevant.
- Local storage, session storage, cookies, and persisted client state reviewed for compatibility.
- Backend compatibility window documented when old clients may call new APIs.
- Forced refresh, user prompt, migration, or safe reset behavior available where needed.

Typical validation:

- Browser refresh/update test, stale-client simulation, storage migration test, API backward-compatibility check.

### PR-DOCS: User Manual, Engineering Guide, and Runbooks

Readiness question:

- Are users, developers, operators, and support teams able to understand and operate the change?

Why it matters:

- Undocumented behavior increases training cost and production support load.

Evidence expected:

- User-facing documentation updated where behavior changes.
- Engineering guide or architecture notes updated where implementation changes matter.
- Runbooks or support notes updated for operational behavior.
- Screens, routes, APIs, and workflows aligned with docs.

Typical validation:

- Documentation review against current UI/API behavior, operator walkthrough, support scenario review.

### PR-SUPPORT: Troubleshooting and Operational Ownership

Readiness question:

- Is ownership clear when the feature fails or users need help?

Why it matters:

- Production support fails when ownership, diagnostics, and escalation paths are unclear.

Evidence expected:

- Owner or module documented.
- Known failure modes documented.
- Recovery actions documented.
- Support-facing diagnostic data available.
- Escalation or handoff path identified.

Typical validation:

- Support scenario review, failure-mode walkthrough, incident-readiness review.

### PR-RISK: Known Risks, Residual Gaps, and Go/No-Go Readiness

Readiness question:

- Are remaining risks visible and acceptable for the target release?

Why it matters:

- Release decisions should be based on known risk, not hidden assumptions.

Evidence expected:

- Residual risks listed.
- Risk owner assigned.
- Risk status recorded as Done, Risk Accepted, Not Required, Roadmap, Blocked, or In Progress.
- Go/no-go recommendation documented for release-sensitive work.

Typical validation:

- Release readiness review, tracker review, code review, product/engineering sign-off where needed.

### PR-GOV: Governance and Guardrail Compliance

Readiness question:

- Were applicable guardrails identified, satisfied, or explicitly risk-accepted?

Why it matters:

- Governance gaps create hidden release risk even when implementation appears complete.

Evidence expected:

- Triggered guardrails listed.
- Risk tier recorded.
- Required approvals captured.
- Evidence or risk acceptance documented.

Typical validation:

- Guardrail review, Definition of Done review, release-readiness review.

### PR-SCOPE: Scope Containment and Approved Follow-Ups

Readiness question:

- Did the work stay within the requested scope, with adjacent follow-ups tracked only after permission?

Why it matters:

- Scope creep increases regression risk and makes delivery harder to verify.

Evidence expected:

- Requested scope summarized.
- Out-of-scope findings listed separately.
- User permission captured before tracker additions or extra implementation.

Typical validation:

- Final summary review, tracker review, production-readiness reminder review.

### PR-DESTRUCTIVE: Destructive Action Safety

Readiness question:

- Were destructive, irreversible, or high-blast-radius actions approved and recoverable?

Why it matters:

- Deletes, resets, migrations, mass updates, and secret/config changes can cause irreversible damage.

Evidence expected:

- Explicit approval.
- Preview or dependency check.
- Backup, rollback, or recovery path.
- Audit evidence where relevant.

Typical validation:

- Approval review, rollback proof, migration or deletion safety test, audit check.

### PR-DATA-CLASS: Data Classification and Privacy Handling

Readiness question:

- Was data classified and handled safely across code, tests, logs, exports, screenshots, docs, and AI prompts?

Why it matters:

- Sensitive data exposure can create legal, privacy, customer, and security risk.

Evidence expected:

- Data class identified.
- Sensitive data masked or excluded.
- Fixtures sanitized.
- Logs, telemetry, exports, and reports reviewed.

Typical validation:

- Privacy review, log review, artifact review, test fixture review.

### PR-COMPLIANCE: Legal, Regulatory, Contractual, and Data Residency

Readiness question:

- Are legal, regulatory, contractual, data residency, retention, and deletion obligations understood for the changed behavior?

Why it matters:

- Production readiness includes obligations beyond code correctness, especially for regulated data, customer contracts, audit evidence, exports, AI behavior, and retention/deletion workflows.

Evidence expected:

- Data residency, retention, deletion, legal hold, and export implications reviewed where relevant.
- Regulatory or contractual obligations identified.
- License, attribution, and third-party terms reviewed where relevant.
- Privacy notice, user consent, or disclosure updated where behavior changes.
- Compliance owner or legal reviewer identified for regulated or contractual risk.

Typical validation:

- Compliance review, privacy review, license review, retention/deletion test, export evidence review.

### PR-SECRETS: Secrets, Certificates, Keys, and Credential Lifecycle

Readiness question:

- Are secrets, certificates, keys, tokens, and credentials handled safely through release and operation?

Why it matters:

- Credential failures and leaked secrets can cause outages, breaches, tenant exposure, or irreversible compromise.

Evidence expected:

- No secrets committed, logged, exported, screenshotted, or embedded in test fixtures.
- Secret storage, rotation, expiry, and owner documented where relevant.
- Certificate and key validity checked before release.
- Scoped credentials and least privilege used.
- Emergency rotation or revocation path documented.

Typical validation:

- Secret scan, configuration review, certificate check, credential scope review, rotation drill where relevant.

### PR-SUPPLY: Dependency and Supply-Chain Review

Readiness question:

- Were new or upgraded dependencies reviewed before adoption?

Why it matters:

- Dependencies can introduce vulnerabilities, license issues, operational risk, and bundle or runtime regressions.

Evidence expected:

- License check.
- Vulnerability check.
- Maintenance health review.
- Transitive dependency and lockfile review.
- Runtime or bundle impact noted.
- SBOM, provenance, signing, or attestation reviewed for release-critical artifacts.

Typical validation:

- Dependency audit, security scan, lockfile review, build or bundle check.

### PR-ARTIFACT: Build Artifact Integrity, SBOM, Provenance, and Signing

Readiness question:

- Can the team prove what was built, from which source, by which pipeline, and with which dependency set?

Why it matters:

- Mature production releases require artifact traceability and tamper-resistance, not only source-code review.

Evidence expected:

- Build artifact linked to source revision, build pipeline, environment, and release version.
- SBOM generated or explicitly marked not required by risk profile.
- Artifact signing, provenance, or attestation considered for production-bound or external artifacts.
- Release package excludes unintended secrets, test data, debug files, or local artifacts.
- Artifact storage and retention path documented.

Typical validation:

- SBOM review, artifact checksum/signature review, provenance review, release package inspection, pipeline evidence review.

### PR-THIRD-PARTY: Runtime Dependencies, External APIs, and Vendor Resilience

Readiness question:

- Can the feature tolerate runtime dependency failures, external API issues, quota limits, and vendor incidents?

Why it matters:

- Production failures often come from services outside the codebase: payment providers, model providers, identity services, email, storage, maps, webhooks, queues, or SaaS APIs.

Evidence expected:

- Runtime dependencies and owners listed.
- External API SLA, quota, timeout, retry, and fallback behavior reviewed.
- Vendor incident or degradation path documented.
- User-facing error and recovery behavior defined for dependency failure.
- Monitoring or alerting exists for critical dependency health.

Typical validation:

- Dependency failure simulation, timeout/retry test, quota test, fallback walkthrough, vendor incident runbook review.

### PR-FLAGS: Feature Flag Lifecycle

Readiness question:

- Are feature flags owned, tested, observable, and scheduled for removal or review?

Why it matters:

- Permanent or unowned flags create hidden product states and release confusion.

Evidence expected:

- Owner.
- Purpose.
- Default state.
- Rollout plan.
- Kill switch behavior.
- Tests for enabled and disabled states.
- Expiry or removal date.

Typical validation:

- Feature flag review, enabled/disabled tests, rollout and rollback review.

### PR-OBS-GATE: Observability Acceptance

Readiness question:

- Is the change diagnosable in production?

Why it matters:

- Operators need logs, metrics, traces, audit events, and clear user-facing recovery to resolve incidents.

Evidence expected:

- Useful logs.
- Metrics where relevant.
- Correlation IDs or traces where flows cross components.
- Audit events for sensitive actions.
- User-facing recovery messages.
- Operator troubleshooting path.

Typical validation:

- Log and metric review, trace walkthrough, audit assertion, failure simulation.

### PR-PERF-BUDGET: Performance Budgets

Readiness question:

- Does the project define and respect performance budgets for the changed area?

Why it matters:

- Production quality includes speed, responsiveness, throughput, and resource discipline.

Evidence expected:

- Budget or target identified.
- Measurement performed where relevant.
- Regression risk documented.
- Follow-up created if no budget exists.

Typical validation:

- Performance test, build-size check, API latency check, job duration check, resource review.

### PR-COST: Cost, Capacity, Budget, and Resource Governance

Readiness question:

- Can the system operate within expected cost, capacity, quota, and resource limits after release?

Why it matters:

- A feature can pass functional and performance tests while creating uncontrolled cloud, AI, logging, storage, export, polling, or integration cost.

Evidence expected:

- Cost-impacting resources identified.
- Budget, quota, rate, or capacity assumptions documented.
- Expensive jobs, exports, polling, retries, logging, AI/token usage, and storage growth reviewed where relevant.
- Alerts or dashboards exist for material cost or quota risk.
- Owner assigned for cost anomaly response.

Typical validation:

- Cost estimate review, quota simulation, usage dashboard review, load/capacity review, alert threshold check.

### PR-FLAKY: Failed Gate and Flaky Test Handling

Readiness question:

- Were failed, skipped, or flaky tests classified and handled transparently?

Why it matters:

- Ignored flakes and skipped gates hide release instability.

Evidence expected:

- Failure classification.
- Owner.
- Reason.
- Remediation path or risk acceptance.
- Release impact noted.

Typical validation:

- Test report review, rerun evidence, flake tracker review, CI gate review.

### PR-INCIDENT: Incident Learning and Prevention

Readiness question:

- Did incidents or repeated bugs update the system of prevention?

Why it matters:

- World-class teams convert failures into rules, tests, runbooks, and monitoring.

Evidence expected:

- Updated rule, test, runbook, readiness item, or V&V expectation.
- Root cause and prevention note.
- Residual risk owner.

Typical validation:

- Post-incident review, repeated-bug review, tracker and rules review.

### PR-ADR: Architecture Decision Record

Readiness question:

- Were material architecture decisions documented with context and consequences?

Why it matters:

- Architecture drift creates long-term maintainability and operational risk.

Evidence expected:

- Context.
- Decision.
- Alternatives considered.
- Consequences.
- Migration or rollback path.
- Evidence required.

Typical validation:

- ADR review, architecture review, implementation alignment check.

### PR-UX-GATE: UX Degradation Prevention

Readiness question:

- Did the change preserve or intentionally improve the user experience?

Why it matters:

- Product trust depends on navigation clarity, readability, accessibility, responsiveness, and recovery.

Evidence expected:

- UX impact reviewed.
- Accessibility and responsiveness checked where relevant.
- Tradeoff approved if intentional.
- Follow-up tracked when degradation is temporary.

Typical validation:

- Visual test, UX review, accessibility check, product approval.

### PR-ABUSE: Abuse, Misuse, Fraud, Rate Limits, and Automation Safety

Readiness question:

- Could users, attackers, automation, or AI agents misuse the feature in ways that harm users, tenants, data, cost, trust, or operations?

Why it matters:

- Production systems need protection against misuse, not only classic security vulnerabilities.
- Public APIs, exports, workflow execution, approvals, AI tools, file uploads, and admin actions often need rate limits, abuse detection, and safe defaults.

Evidence expected:

- Abuse and misuse scenarios reviewed.
- Rate limits, quotas, throttling, duplicate-action protection, or fraud controls defined where relevant.
- Automation and bot behavior considered.
- High-impact actions have confirmation, idempotency, audit, and recovery behavior.
- Monitoring or alerting exists for suspicious volume, repeated failure, export spikes, or unusual automation.

Typical validation:

- Abuse-case review, rate-limit test, duplicate-action test, audit review, suspicious-volume simulation.

### PR-EVIDENCE: Release Evidence Retention and Audit Package

Readiness question:

- Is release evidence current, reviewable, retained, and easy to audit later?

Why it matters:

- Green builds are not enough if the team cannot later prove what was tested, reviewed, shipped, accepted as risk, or changed.
- Evidence retention supports audits, incident review, customer assurance, and future maturity assessment.

Evidence expected:

- Evidence location documented.
- Test reports, screenshots/videos, logs, dashboards, release notes, approvals, and risk acceptances stored where relevant.
- Evidence names include date, release, environment, feature, or scope where practical.
- Stale evidence identified and not treated as current proof.
- Retention expectation documented for release-sensitive, regulated, customer-facing, or audit-sensitive work.

Typical validation:

- Release evidence package review, tracker review, stale-evidence check, audit walkthrough.

### PR-AI-GOV: AI Output Governance

Readiness question:

- Was AI-assisted output inspected, verified, and kept within approved scope?

Why it matters:

- AI can accelerate delivery, but unreviewed output can invent behavior, miss context, or create unsafe changes.

Evidence expected:

- Relevant files inspected.
- Assumptions stated.
- Verification run.
- User work preserved.
- Residual risk reported.
- No invented APIs, data, routes, or product claims.
- AI use-case record exists when the product itself uses AI behavior.
- AI risk tier is assigned when prompts, models, tools, memory, retrieval, or AI-generated actions are involved.
- Prompt, model, tool, policy, retrieval, and memory versions are identified where applicable.
- Evaluation evidence exists for task success, safety, hallucination resistance, privacy, refusal, and recovery where relevant.
- Tool permissions are least-privilege and risky actions require confirmation or approval.
- Human approval thresholds are defined for sensitive, privileged, destructive, regulated, customer-visible, or production-impacting AI actions.
- AI runtime logs, audit events, and correlation IDs exist where production diagnosis or accountability is required.
- Fallback, rollback, disable, or kill-switch behavior exists for high-risk AI paths.
- User-facing AI disclosure exists where AI meaningfully affects user decisions, outputs, or actions.
- AI incident response path exists for unsafe output, tool misuse, privacy concern, hallucination, approval bypass, or repeated user confusion.
- Cross-check `PR-ABUSE`, `PR-COST`, `PR-THIRD-PARTY`, and `PR-EVIDENCE` when AI uses tools, model providers, memory, retrieval, automation, or high-volume execution.

Typical validation:

- Code review, test evidence, AI evaluation evidence, tool-call proof, audit review, final summary review, tracker or documentation review.

### PR-MATURITY: Optional Maturity Assessment

Readiness question:

- Should the team run an optional maturity assessment to identify systemic improvement areas?

Why it matters:

- Production-readiness gaps sometimes indicate a deeper maturity pattern, not just a task-level follow-up.
- Migration, modernization, repeated regressions, release-hardening, and broad quality issues benefit from a formal maturity view.
- The maturity assessment should remain permission-based so it supports release quality without creating scope creep.

Expected evidence:

- Indicative maturity signal clearly marked as non-formal, if provided.
- User approval before running the formal assessment.
- Formal assessment performed using `Working_Process/Maturity_Level_Assessment.md`, when approved.
- Separate user approval before adding maturity findings to any project tracker.

Typical validation:

- Confirm the requested task is complete first.
- Confirm production-readiness reminders have been considered.
- Ask whether to run the maturity assessment only when relevant.
- Record approved maturity findings as tracker items only after explicit permission.

Status options:

- Not needed
- Offered
- Approved
- Completed
- Tracker update approved

## Reminder Output Format

When the user approves a readiness reminder pass, summarize findings like this:

```markdown
| ID | Category | Suggested Follow-Up | Why It Matters | Priority | Evidence Needed |
|----|----------|---------------------|----------------|----------|-----------------|
```

Then ask:

```text
Do you want me to add these to the Project Tracker?
```

Do not write tracker items until the user approves.
