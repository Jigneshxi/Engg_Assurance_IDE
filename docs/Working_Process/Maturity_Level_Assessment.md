# Maturity Level Assessment

## Purpose

This document defines a reusable framework for assessing the maturity of a product, platform, engineering organization, or delivery program.

It is designed to work alongside the Working Process documents without changing them:

- `Working_Process/WoW_Process.md` defines how work is planned, implemented, verified, reviewed, and governed.
- `Working_Process/V_and_V_Process.md` defines how proof, coverage, and release evidence are established.
- `Working_Process/Production_Readiness_Checklist.md` defines the production-readiness reminder checklist.
- `Maturity_Level_Assessment.md` defines how to assess maturity level, identify systemic gaps, and recommend a prioritized improvement action list.

This assessment should be optional and permission-based. It should not run automatically after every task. It is most useful after production-readiness review, before a major release, after repeated defects, during modernization, or when leadership wants a clear view of current engineering maturity.

## Governance Rule

The maturity assessment must not create scope creep.

The agent or team must:

- Complete the requested job first.
- Run agreed verification first.
- Ask permission before running a maturity assessment.
- Ask permission before adding maturity gaps to a project tracker.
- Avoid changing project files while assessing unless explicitly asked.
- Separate findings from implementation.

Suggested prompt after production-readiness recommendations:

```text
Do you want me to run an optional Maturity Level Assessment using the maturity framework and identify systemic improvement areas?
```

If the user says no, stop.

If the user says yes, run the assessment and present findings. Ask again before adding tracker items.

## Fast Project Activation Protocol

Use this protocol when applying the maturity framework to a new or unfamiliar project. The goal is to provide fast, useful feedback by inspecting the project first instead of asking broad questions.

The agent should:

1. Inspect the repository and available documents.
2. Fingerprint the project type and technology stack.
3. Identify high-risk surfaces.
4. Detect existing controls and missing controls.
5. Produce a concise discovery summary.
6. Ask only focused questions that cannot be safely inferred.
7. Run the maturity assessment only after permission.

### Minimal-Question Rule

Inspect first, ask later.

- Prefer zero questions during initial discovery.
- Ask only when the answer cannot be inferred from the repository and a wrong assumption would create meaningful risk.
- Ask at most 1-3 focused questions after inspection.
- Avoid broad questions such as "What should I do?" when project context can be discovered locally.
- Record assumptions instead of interrupting the user for low-risk details.

### Repository Discovery Checklist

Inspect the available project structure before assessing maturity.

Look for:

- README, product docs, user manuals, engineering guides, and runbooks.
- Package files, dependency manifests, lockfiles, and language/runtime versions.
- Build, test, lint, format, type-check, and code-generation commands.
- CI/CD configuration, deployment scripts, Docker files, infrastructure code, and release notes.
- Environment examples, configuration files, secret-handling patterns, and feature flags.
- API schemas, OpenAPI files, GraphQL schemas, SDKs, message contracts, or integration specs.
- Frontend routes, screens, menus, components, and design-system patterns.
- Backend entry points, service boundaries, jobs, queues, schedulers, and workers.
- Database schemas, migrations, seed data, import/export paths, and backup/restore scripts.
- Test folders, test reports, coverage files, V&V artifacts, and visual evidence.
- Security, dependency, license, code owner, and policy configuration.
- Existing trackers, project boards, production-readiness notes, and incident records.

### Project Fingerprinting

Classify the project so the right maturity domains and guardrails are activated.

Common fingerprints:

- Frontend application.
- API or backend service.
- Full-stack application.
- Data platform or analytics system.
- CLI, automation, or developer tool.
- Mobile application.
- AI/ML or AI-assisted product.
- Legacy monolith.
- Migration or modernization project.
- Regulated, tenant-sensitive, financial, healthcare, legal, or privacy-sensitive system.

If multiple fingerprints apply, use the highest-risk combination.

### Risk Surface Detection

Automatically flag high-risk surfaces found in the repository.

Examples:

- Authentication, authorization, RBAC, users, sessions, or identity.
- Tenants, organizations, accounts, projects, workspaces, or customer boundaries.
- Billing, payments, financial approvals, healthcare, legal, compliance, or regulated data.
- Admin actions, destructive actions, deletion, import/export, reporting, or downloads.
- Workflow execution, background jobs, queues, schedulers, retries, or async operations.
- Database migrations, seed scripts, rollback paths, or data repair scripts.
- Secrets, credentials, tokens, keys, certificates, or environment files.
- Third-party integrations, webhooks, files, email, messaging, or external APIs.
- AI runtime behavior, model calls, prompts, tools, generated actions, or evaluations.
- Production deployment, caching, release, rollback, or feature flag controls.

Detected risk surfaces should activate the relevant guardrails in `WoW_Process.md`.

### Existing Control Detection

Identify controls that already exist before recommending new work.

Look for:

- `Rules.md`, `AGENTS.md`, coding standards, or contributor guidance.
- Test suites, coverage reports, V&V matrices, and release evidence.
- CI/CD gates, branch protections, code owners, and review rules.
- Secret scanning, dependency scanning, SAST, DAST, container scanning, IaC scanning, or license checks.
- Accessibility checks, visual tests, E2E tests, and performance tests.
- Observability: logs, metrics, traces, dashboards, alerts, audit events, and runbooks.
- Production readiness tracker, support notes, release checklist, or incident history.
- ADRs, architecture docs, data classification notes, and technical debt register.

Do not recommend creating a control until checking whether an equivalent control already exists.

### First-Pass Output Template

After discovery, provide a concise summary before scoring maturity.

```markdown
## Project Discovery Summary

Detected project type:
Detected stack:
Key entry points:
Build command:
Test command:
Run command:
Existing docs:
Existing tests:
Existing CI/CD:
High-risk areas:
Existing controls:
Missing controls:
Assumptions made:
Questions requiring user decision:
Recommended assessment mode:
Recommended next action:
```

### Default Evidence By Project Type

Use the project fingerprint to set evidence expectations quickly.

| Project Type | Default Evidence |
|--------------|------------------|
| Frontend application | Type-check, component tests, route smoke tests, visual checks, accessibility checks, responsive layout review |
| API or backend service | Contract tests, positive/negative API tests, auth/RBAC tests, error payload checks, observability checks |
| Full-stack application | Frontend evidence, backend evidence, E2E journeys, API/UI contract alignment, deployment smoke test |
| Data platform | Data integrity tests, migration tests, reconciliation checks, export/import checks, rollback or recovery proof |
| CLI or developer tool | Command help, input validation, exit codes, file safety, dry-run behavior, cross-platform checks |
| Mobile application | Device coverage, offline behavior, accessibility, crash handling, backend contract compatibility |
| AI/ML or AI product | Evaluation suite, prompt/model versioning, safety checks, human review thresholds, data usage boundaries |
| Legacy monolith | Smoke tests, characterization tests, module map, risk surface inventory, safety rails before refactor |
| Migration project | Baseline proof, parity checks, rollback plan, dual-run or shadow-run evidence, data reconciliation |
| Regulated or tenant-sensitive system | Security/RBAC/privacy proof, tenant isolation, audit events, data classification, compliance evidence |

### Reusable Project-Type Assessment Examples

Use these examples to make the first-pass assessment faster and more consistent across project types.

| Project Type | Typical First Checks | Common Stop-the-Line Risks | Practical Good Outcome |
|--------------|----------------------|----------------------------|------------------------|
| Frontend application | Routes, state management, API calls, design system, accessibility, visual tests, cache strategy | Broken critical journey, inaccessible flow, stale UI after release, sensitive data in browser storage | Key journeys pass, UI is accessible, visual drift is tracked, runtime errors are user-actionable |
| API or backend service | OpenAPI/schema, auth/RBAC, error contracts, data access, logs, tests, health checks | Broken auth, tenant leak, undocumented contract drift, missing rollback | Contracts are tested, error responses are stable, auth is enforced, observability is useful |
| Full-stack application | API/UI alignment, E2E journeys, session behavior, deployment smoke tests, data flow | Frontend assumes unavailable backend behavior, stale data, inconsistent tenant/session state | Major journeys work end-to-end with clear recovery paths and shared API contracts |
| AI-assisted product | Prompt/tool boundaries, model/version control, evals, human approval thresholds, generated action safety | Excessive agency, unsafe output, untraceable decision, missing human review | AI behavior is evaluated, bounded, auditable, and recoverable |
| Regulated or tenant-sensitive system | Data classification, tenant isolation, audit events, exports, role permissions, privacy boundaries | Cross-tenant exposure, unapproved export, audit gap, destructive action without confirmation | Sensitive flows have direct proof, clear audit trail, and permission-aware UI/API behavior |
| Legacy monolith | Module map, characterization tests, data dependencies, release process, rollback notes | Unmapped side effect, unsafe refactor, no test baseline, no owner | Safe baseline exists before modernization, changes are sliced, rollback is understood |
| Migration project | Source/target parity, dual-run, reconciliation, cutover, rollback, data repair path | Data loss, incomplete parity, one-way cutover, unclear ownership | Migration is reversible or recoverable, reconciled, and proven before cutover |

### Missing Governance Artifacts

If governance artifacts are missing, recommend them clearly but do not create them without permission.

Common recommendations:

- Create or update `Rules.md`.
- Create or update `AGENTS.md`.
- Create a project tracker.
- Create a V&V coverage matrix.
- Create a production-readiness tracker.
- Create an architecture decision log.
- Create a risk register or technical debt register.
- Create runbooks or support notes for production operations.

## When To Use This Assessment

Use this framework when:

- Preparing for production go-live.
- Assessing whether a project is ready for enterprise or regulated use.
- Reviewing a legacy, monolithic, migration, or ad-hoc project.
- Investigating repeated regressions or recurring production incidents.
- Measuring quality after a large modernization effort.
- Evaluating whether current engineering practices match world-class standards.
- Creating a prioritized improvement backlog for product, platform, security, reliability, or delivery maturity.
- Comparing project reality against `WoW_Process.md`, `V_and_V_Process.md`, and the production-readiness checklist.

Do not use it as a blocker for small, low-risk tasks unless the user explicitly asks.

## Assessment Modes

Choose the smallest mode that fits the decision being made. The default expectation is fast, evidence-led feedback, not a long audit cycle.

| Mode | Purpose | Output |
|------|---------|--------|
| Quick Scan | Lightweight review after a feature, bug fix, or readiness pass | Key gaps, obvious blockers, recommended next actions |
| Standard Assessment | Focused maturity review for a project or release area | Domain scores, evidence strength, prioritized action list |
| Release-Gate Assessment | Go/no-go focused review before launch | Release blockers, risk acceptance, launch readiness |

### Small Task Lightweight Mode

Use this mode when the requested work is small, local, and low-risk, such as a copy edit, minor UI polish, isolated test update, small documentation change, or targeted bug fix with limited blast radius.

The goal is to avoid process heaviness while still preserving safety.

Lightweight mode should include only:

- Confirm the task scope and risk tier.
- Identify whether any stop-the-line guardrail is triggered.
- Run the smallest relevant verification.
- Report proof, residual risk, and whether a broader assessment is not required.

Do not run the full maturity assessment for small tasks unless the user explicitly asks or the task reveals systemic risk.
| Post-Incident Assessment | Review after outage, breach, repeated defect, or quality failure | Root maturity gap, prevention actions, controls to improve |
| Legacy/Migration Assessment | Review existing or ad-hoc systems before modernization | Baseline, safety rails, migration risk, prioritized stabilization actions |

## Maturity Levels

Use a six-level model. The goal is not to "score high" but to make reality visible.

| Level | Name | Description |
|-------|------|-------------|
| L0 | Ad Hoc | Work depends on individual memory, manual heroics, and inconsistent practices. Evidence is missing or unreliable. |
| L1 | Aware | Risks are known and discussed, but controls are inconsistent. Some checklists or tests exist, but coverage is partial. |
| L2 | Defined | Core processes, ownership, guardrails, and repeatable workflows exist. Evidence exists for important paths but is incomplete. |
| L3 | Managed | Processes are followed consistently. V&V, security, release readiness, and incident learning are active and tracked. |
| L4 | Measured | Quality, delivery, reliability, security, and supportability are measured with objective metrics and release gates. |
| L5 | Optimizing / World-Class | Continuous improvement is institutionalized. Evidence, automation, reliability, security, accessibility, and product quality are proactively improved. |

## Default Scoring Rules

Score each domain from 0 to 5 using the maturity levels above.

Recommended interpretation:

- `0.0 - 0.9`: Ad Hoc
- `1.0 - 1.9`: Aware
- `2.0 - 2.9`: Defined
- `3.0 - 3.9`: Managed
- `4.0 - 4.6`: Measured
- `4.7 - 5.0`: Optimizing / World-Class

Use evidence over opinion. If evidence is missing, the score should be lower even if the team believes the behavior exists.

### Score Calibration Examples

Use calibration examples to keep scoring consistent across reviewers.

| Level | Calibration Example |
|-------|---------------------|
| L0 | Work depends on memory or individual heroics. Tests, ownership, release evidence, and support paths are missing or unreliable. |
| L1 | Some risks are known and some checks exist, but execution is inconsistent and evidence is not tied to current release behavior. |
| L2 | Core processes, owners, tests, and documents exist for important areas, but coverage is partial and still depends on manual review. |
| L3 | The team follows repeatable processes. Key journeys, security-sensitive paths, release readiness, and incident learning are tracked with evidence. |
| L4 | Objective metrics, release gates, automated proof, SLOs, rollback proof, security evidence, and supportability signals are routinely measured. |
| L5 | Continuous improvement is proven. Incidents, defects, metrics, customer feedback, and AI-assisted reviews automatically improve rules, tests, docs, and operations. |

Domain score should be based on the weakest important behavior, not the best-looking artifact. For example, strong documentation cannot offset missing release proof for a release-critical system.

### Evidence Confidence By Domain

Every domain should carry its own evidence confidence level instead of relying only on one overall confidence statement.

Use these confidence levels:

- Strong: current automated proof, release evidence, tracker evidence, or operational evidence exists and is directly tied to the domain.
- Moderate: partial proof exists, but it is incomplete, manual, stale, or not fully mapped to current behavior.
- Weak: evidence is mostly narrative, inferred, outdated, missing, or not independently verifiable.

Domain scoring should be reduced when confidence is weak. A high maturity score with weak evidence is not acceptable without explicit explanation and risk acceptance.

Example:

| Domain | Score | Evidence Confidence | Reason |
|--------|-------|---------------------|--------|
| V&V and Quality Engineering | 3.8 | Strong | Current automated tests and release evidence exist. |
| Secure SDLC and Privacy | 2.6 | Moderate | Security scans exist, but threat-model evidence is incomplete. |
| Observability and Supportability | 2.1 | Weak | Logging exists, but dashboards and alert proof are missing. |

## Maturity Caps

Some missing controls should cap the overall score because they represent systemic risk.

| Condition | Maximum Overall Maturity |
|-----------|--------------------------|
| No repeatable build/test/release process | L2 |
| No critical user journey proof | L2 |
| No security/RBAC/privacy evidence for sensitive systems | L2 |
| No rollback or recovery path for production changes | L3 |
| No observability for production-impacting systems | L3 |
| No ownership for critical modules or incidents | L3 |
| No evidence retention for release decisions | L3 |
| Repeated unresolved stop-the-line guardrails | L2 |
| Known data-loss or tenant-isolation risk without acceptance | L1 |
| Critical tests absent for release-critical behavior | L3 |
| Production rollback or recovery proof is untested | L3 |
| Security evidence is narrative-only for sensitive systems | L2 |
| Ownership is unclear for critical services, modules, or incidents | L3 |
| Evidence is stale and not revalidated by current CI or release proof | L3 |
| Customer-facing or sensitive AI behavior lacks evaluation evidence | L3 |
| Agentic or privileged AI behavior lacks approval, audit, or rollback controls | L2 |
| AI use case, model, prompt, tool, data, or memory boundaries are undefined | L2 |

Maturity caps should be explained clearly in the assessment output.

### Anti-Gaming Rules

The maturity score must reflect real operational capability, not process theater.

Apply these rules:

- A project cannot score L4 or higher if release-critical tests are absent.
- A project cannot score L4 or higher if production rollback, restore, or recovery behavior is unproven.
- A project cannot score L4 or higher if ownership is unclear for critical modules, services, or incident response.
- A sensitive system cannot score above L2 in security maturity when security evidence is narrative-only.
- A tenant-sensitive or customer-boundary system cannot score above L2 without tenant-isolation or data-boundary proof.
- A project cannot score L5 based only on documentation; it must show automated proof, operational metrics, and continuous-improvement evidence.
- A score must be lowered when evidence is stale, unverifiable, or disconnected from the current release.
- An AI product cannot score L4 or higher in AI Runtime Governance without evaluation evidence tied to the current prompt/model/tool behavior.
- Agentic AI cannot score L4 or higher without least-privilege tool controls, approval thresholds, audit evidence, and rollback or disable behavior.
- Sensitive AI use cases cannot score above L2 when data boundaries, memory behavior, or human approval thresholds are undefined.

If a team disagrees with a cap, record the disagreement as risk acceptance rather than inflating the score.

## Control-To-Automation Mapping

Critical controls should eventually map to executable or reviewable proof. This prevents maturity assessment from becoming a document-only exercise.

Use this template when a maturity gap needs durable enforcement:

| Control Area | Expected Automation or Evidence | Owner | Current State | Gap | Next Action |
|--------------|----------------------------------|-------|---------------|-----|-------------|
| Build and test | CI build, unit tests, integration tests, type-check, lint | Engineering | Present / Partial / Missing | | |
| API contracts | Contract tests, schema checks, backward compatibility checks | Backend/API owner | Present / Partial / Missing | | |
| UI journeys | E2E tests, visual tests, accessibility checks | Frontend/QA owner | Present / Partial / Missing | | |
| Security and privacy | SAST, dependency scan, secret scan, RBAC tests, threat model | Security owner | Present / Partial / Missing | | |
| Data and migration | Migration tests, reconciliation, backup/restore, rollback proof | Data owner | Present / Partial / Missing | | |
| Observability | Logs, metrics, traces, audit events, dashboards, alert proof | Operations/SRE owner | Present / Partial / Missing | | |
| Release safety | Feature flags, deployment smoke, rollback rehearsal, release checklist | Release owner | Present / Partial / Missing | | |
| AI governance | Eval suite, prompt/model versioning, human approval, unsafe-action checks | AI/product owner | Present / Partial / Missing | | |
| AI tool safety | Tool allowlist, least-privilege credentials, dry-run proof, approval logs, audit assertions | AI/security owner | Present / Partial / Missing | | |
| AI runtime monitoring | Prompt/model/tool telemetry, safety events, refusals, escalations, cost, latency, drift signals | AI/operations owner | Present / Partial / Missing | | |

If a control cannot be automated yet, record the manual evidence required, the reviewer, and the plan to automate or simplify it later.

## Ownership and Decision Matrix

Every material finding should have an owner and a decision path.

Use this lightweight ownership model:

| Area | Primary Owner | Consulted Owners | Decision Needed When |
|------|---------------|------------------|----------------------|
| Product and user journey | Product owner | UX, engineering, support | User behavior, scope, or customer impact changes |
| Frontend and UX | Frontend owner | UX, accessibility, QA | UI behavior, accessibility, visual quality, or client-side state changes |
| Backend and API | Backend/API owner | Frontend, QA, operations | API contract, auth, data, performance, or integration behavior changes |
| Security and privacy | Security owner | Engineering, legal/compliance, product | Sensitive data, auth, RBAC, tenant, secrets, or threat model risk appears |
| Data and migration | Data owner | Backend, operations, product | Schema, migration, import/export, retention, backup, or data repair changes |
| Reliability and operations | Operations/SRE owner | Engineering, support, release owner | Availability, SLO, incident, monitoring, or rollback risk appears |
| Release readiness | Release owner | Product, QA, security, operations | Go/no-go, rollback, residual risk, or production-readiness decision is needed |
| AI behavior | AI/product owner | Security, legal/compliance, engineering, UX | AI-generated actions, model changes, tool use, or human approval thresholds change |

If ownership is unclear, maturity should be capped until ownership is assigned or risk is accepted.

## Maturity Upgrade Path

Use the current maturity level to choose the smallest useful next step. The goal is practical progress, not score chasing.

| Current Level | Primary Goal | First Actions |
|---------------|--------------|---------------|
| L0: Ad Hoc | Make reality visible | Identify entry points, critical journeys, owners, run/build/test commands, and immediate stop-the-line risks. |
| L1: Aware | Create repeatable basics | Add tracker discipline, basic tests, release notes, coding rules, ownership, and a minimum support/runbook path. |
| L2: Defined | Turn process into evidence | Map user journeys to tests, add API/UI/data/security proof, define release gates, and record residual risks. |
| L3: Managed | Make quality measurable | Add CI gates, SLOs, dashboards, rollback proof, incident learning, coverage ownership, and evidence retention. |
| L4: Measured | Optimize from signals | Use delivery metrics, reliability signals, support data, defect trends, AI review, and user feedback to improve rules and automation. |
| L5: Optimizing / World-Class | Sustain improvement | Continuously refine controls, reduce toil, improve developer experience, and prevent recurring defects through automated prevention. |

### First 60-Minute Assessment Flow

Use this flow for fast project activation. It is designed for AI agents or project teams working in unfamiliar repositories.

1. Inspect repository structure, docs, build files, tests, CI, deployment, and risk-sensitive folders.
2. Fingerprint the project type: frontend, backend, full-stack, data, AI, migration, legacy, regulated, or mixed.
3. Identify the top risk surfaces: auth, tenants, data, workflows, jobs, AI actions, exports, migrations, secrets, deployment, or integrations.
4. Detect existing controls: tests, scans, CI gates, code owners, runbooks, release notes, dashboards, trackers, and rules.
5. Produce the `Project Discovery Summary`.
6. Choose the smallest assessment mode that fits the decision.
7. Produce `Top 5 Findings` before detailed scoring.
8. Recommend a short action list with owners and proof expectations.
9. Ask permission before adding any tracker items or changing files.

### Project Archetype Playbooks

Use these playbooks to make the assessment intuitive for common project situations.

| Archetype | Main Objective | First Maturity Moves |
|-----------|----------------|----------------------|
| Migration or modernization | Change safely without losing behavior | Add characterization tests, module map, parity checks, data reconciliation, rollback plan, and cutover evidence. |
| Ad-hoc or unmanaged project | Move from heroics to repeatable delivery | Document run/build/test, identify owners, add basic CI, create tracker, define release steps, and capture known risks. |
| New product or platform | Avoid maturity debt early | Establish folder structure, coding rules, V&V strategy, CI gates, observability, accessibility, security, and release checklist from the start. |
| Regulated or tenant-sensitive product | Protect users, customers, and auditability | Add data classification, RBAC/tenant tests, audit events, export controls, privacy checks, and reviewer approval gates. |
| AI-assisted product | Bound and verify AI behavior | Add prompt/model/tool versioning, evals, human approval thresholds, unsafe-action checks, audit logs, and fallback behavior. |
| Full-stack SaaS | Keep UI, API, data, and operations aligned | Add API contract tests, E2E journeys, session handling proof, health checks, deployment smoke tests, and support runbooks. |
| Developer tool or automation | Make commands safe and predictable | Add help text, dry-run mode, file safety checks, exit codes, cross-platform tests, and clear error handling. |

### Example Assessment Output

Use this abbreviated example to show teams what good output looks like.

```markdown
## Executive Summary Card

Overall maturity: L2.7 / 5
Release posture: Yellow
Evidence confidence: Moderate
Top risk: Rollback proof is missing for database changes.
Most important improvement: Add migration reconciliation and rollback verification.
Stop-the-line status: No active stop-the-line issue, but release should not proceed without rollback evidence.
Recommended next action: Create a two-item hardening slice for migration tests and rollback rehearsal.

## Top 5 Findings

| Rank | Finding | Severity | Why It Matters | Recommended Action |
|------|---------|----------|----------------|--------------------|
| 1 | Rollback proof missing | High | Failed migration could cause data loss | Add rollback rehearsal and reconciliation proof |
| 2 | Critical journeys only manually tested | Medium | Regression risk is high | Add E2E/API owner tests |
| 3 | Observability is partial | Medium | Support cannot diagnose failures quickly | Add dashboards, correlation IDs, and alert proof |
| 4 | Ownership unclear for release failure | Medium | Incident response may stall | Assign release and operations owners |
| 5 | Security evidence is narrative-only | High | Sensitive paths are not independently proven | Add RBAC/privacy tests and scan evidence |
```

### Team Enablement Actions

After assessment, convert findings into action without creating uncontrolled scope.

- Turn each high-priority finding into a tracker item with owner, risk, proof required, and expected outcome.
- Convert repeated defects into coding rules, tests, CI gates, or checklist updates.
- Convert release gaps into production-readiness checklist items.
- Convert architecture gaps into ADR-style notes or module ownership updates.
- Convert supportability gaps into runbooks, logs, metrics, traces, alerts, or user-facing recovery paths.
- Convert security/privacy gaps into threat-model updates, RBAC tests, scan gates, or data-classification rules.
- Convert UX/accessibility gaps into visual tests, accessibility gates, and user-journey proof.
- Ask permission before adding tracker items or starting follow-up implementation.

### Common Maturity Improvement Patterns

Use these patterns when teams ask, "What should we do next?"

| Gap Pattern | Improvement Pattern |
|-------------|---------------------|
| No safe baseline | Add smoke tests, characterization tests, and current-behavior documentation before refactor. |
| Unknown ownership | Add module owners, release owner, incident owner, and decision path. |
| Manual-only release confidence | Add CI gates, deployment smoke tests, rollback proof, and release evidence package. |
| Fragile API/UI alignment | Add contract tests, generated types where useful, E2E journeys, and error-state proof. |
| Weak migration confidence | Add parity checks, reconciliation, backup/restore proof, rollback rehearsal, and dry-run mode. |
| Poor production diagnosis | Add structured logs, metrics, traces, correlation IDs, audit events, dashboards, and runbooks. |
| Security is narrative-only | Add threat model, RBAC tests, secret/dependency scans, privacy checks, and audit evidence. |
| UX quality is subjective | Add journey criteria, visual tests, accessibility checks, responsive checks, and support feedback review. |
| AI behavior is opaque | Add evals, prompt/model versioning, tool-call audit, human approval thresholds, and unsafe-action tests. |
| AI use cases are undocumented | Add AI use-case records with purpose, users, data, model, tools, autonomy level, risk tier, owner, and fallback path. |
| AI tools are over-privileged | Add least-privilege tool scopes, dry-run mode, confirmation gates, sandboxing, and audit assertions. |
| AI evals are manual or missing | Add golden scenarios, negative prompts, prompt-injection checks, task-success metrics, and regression evals. |
| AI memory is unclear | Add memory scope, retention, deletion, tenant isolation, provenance, and poisoning checks. |
| AI incidents do not improve controls | Add AI incident playbook, rollback path, postmortem, eval update, rule update, and readiness follow-up. |
| Repeated defects recur | Add root-cause notes, regression tests, rule updates, code review checklist updates, and CI enforcement. |

## Assessment Domains

Use these domains for a complete assessment. For smaller assessments, select only the relevant domains.

### 1. Governance and Operating Model

Assessment questions:

- Is `WoW_Process.md` adopted and understood?
- Are guardrails, risk tiers, Definition of Done, and release readiness used consistently?
- Are decision rights and approvals clear?
- Are trackers updated as work progresses?
- Are production-readiness reminders permission-based and useful?

Evidence:

- WoW usage examples.
- Tracker history.
- Review notes.
- Risk acceptance records.
- Release readiness evidence.

World-class signal:

- The process is used naturally by the team, not treated as paperwork.

### 2. Product and User Journey Maturity

Assessment questions:

- Are key personas, journeys, and expected outcomes clear?
- Can users complete end-to-end workflows without support dependency?
- Are empty, loading, error, offline, and recovery states designed?
- Are product decisions reflected in user documentation?

Evidence:

- User manual.
- Journey maps.
- E2E tests.
- UX review.
- Support or training feedback.

World-class signal:

- The product explains itself through intuitive journeys, not only feature lists.

### 3. Delivery Performance and Flow

Assessment questions:

- Are lead time, deployment frequency, change failure rate, and recovery time tracked?
- Are builds and deployments automated?
- Is continuous integration used?
- Are branches short-lived and conflicts managed?
- Are tests fast enough to support frequent delivery?

Evidence:

- CI logs.
- Release history.
- Deployment records.
- Test duration reports.
- Change failure records.

World-class signal:

- The team can ship frequently with low risk and fast recovery.

### 4. V&V and Quality Engineering

Assessment questions:

- Is `V_and_V_Process.md` used as the proof model?
- Are critical journeys mapped to tests and evidence?
- Are API, UI, integration, security, performance, and data tests owned?
- Are skipped, flaky, and live-gated tests tracked honestly?
- Is coverage measured by behavior ownership, not only line coverage?

Evidence:

- V&V tracker.
- Coverage ownership matrix.
- Test reports.
- Visual evidence.
- Risk acceptance notes.

World-class signal:

- Quality proof is traceable from requirement to test to release evidence.

### 5. Secure SDLC and Privacy

Assessment questions:

- Are secure design and threat modeling used for sensitive changes?
- Are authentication, authorization, RBAC, tenant isolation, and privacy enforced in the backend?
- Are secrets, PII, customer data, and regulated data handled safely?
- Are vulnerabilities managed and tracked?
- Are security tests part of normal delivery?

Evidence:

- Threat models.
- Security tests.
- Secret scans.
- Dependency scans.
- Audit trails.
- Privacy reviews.

World-class signal:

- Security is built into design, implementation, testing, and release decisions.

### 6. Supply Chain, Dependency, and Artifact Integrity

Assessment questions:

- Are new dependencies reviewed for license, vulnerabilities, maintenance health, and transitive risk?
- Are builds reproducible or traceable?
- Is SBOM, artifact provenance, signing, or attestation considered?
- Are lockfiles reviewed?
- Are generated artifacts and release packages traceable to source?

Evidence:

- Dependency review.
- Lockfile diff.
- SCA reports.
- SBOM.
- Build provenance.
- Signed artifact or release evidence.

World-class signal:

- The team can prove where release artifacts came from and what they contain.

### 7. Reliability, SLOs, and Incident Management

Assessment questions:

- Are SLIs, SLOs, and error budgets defined for critical services?
- Are incidents classified by severity?
- Are incident roles clear?
- Are postmortems blameless and action-oriented?
- Are repeated incidents converted into rules, tests, runbooks, and monitoring?

Evidence:

- SLO definitions.
- Error budget reports.
- Incident records.
- Postmortems.
- Runbooks.
- Alert history.

World-class signal:

- Reliability decisions are data-driven, not hope-driven.

### 8. Observability and Supportability

Assessment questions:

- Are logs, metrics, traces, correlation IDs, and audit events useful?
- Can operators diagnose failures without asking users to reproduce repeatedly?
- Are user-facing errors actionable?
- Are runbooks and support paths clear?

Evidence:

- Logs.
- Dashboards.
- Trace examples.
- Audit events.
- Support runbooks.
- Failure simulation evidence.

World-class signal:

- Production failures are diagnosable, recoverable, and explainable.

### 9. Accessibility and UX Quality

Assessment questions:

- Is there an accessibility target such as WCAG 2.2 AA where applicable?
- Are keyboard flow, labels, focus states, contrast, and status messages verified?
- Does the product avoid cognitive overload?
- Are screens responsive, readable, and consistent?
- Are UX regressions treated as release risks?

Evidence:

- Accessibility checks.
- Keyboard walkthrough.
- Visual tests.
- Design review.
- User journey review.

World-class signal:

- Accessibility and usability are built into the release gate, not added late.

### 10. Data Governance, Migration, and Recovery

Assessment questions:

- Is data classified and protected?
- Are migrations tested and reversible where possible?
- Are backup and recovery expectations defined?
- Are exports, imports, deletes, and reconciliation tested?
- Is data retention understood?

Evidence:

- Migration tests.
- Rollback notes.
- Data reconciliation proof.
- Backup/recovery plan.
- Data classification record.

World-class signal:

- Data changes are safe, traceable, reversible where possible, and auditable.

### 11. Architecture and Technical Debt

Assessment questions:

- Are architecture boundaries clear?
- Are major decisions documented with ADR-style notes?
- Are dependencies and abstractions intentional?
- Is technical debt tracked with owner, risk, impact, and target milestone?
- Is legacy modernization slice-based and protected by safety rails?

Evidence:

- Architecture guide.
- ADRs.
- Dependency map.
- Debt register.
- Migration plan.

World-class signal:

- Architecture evolves intentionally instead of drifting silently.

### 12. Release, Deployment, and Operations

Assessment questions:

- Is deployment automated and repeatable?
- Are release gates clear?
- Are rollback and feature flag controls tested?
- Are release notes, owners, and operational contacts defined?
- Are environments consistent enough to support reliable delivery?

Evidence:

- Deployment pipeline.
- Release checklist.
- Rollback proof.
- Feature flag review.
- Environment smoke tests.

World-class signal:

- Releases are routine, observable, and reversible.

### 13. AI Runtime Governance

Use this domain when the product itself uses AI, not only when AI assists coding.

Assessment questions:

- Are model, prompt, tool, and policy versions tracked?
- Is there an AI use-case record for material AI behavior?
- Is the AI risk tier clear and justified?
- Are evaluations defined for quality, safety, hallucination, bias, and task success?
- Are human approval thresholds defined?
- Are data usage and privacy boundaries enforced?
- Is model drift monitored?
- Are AI-generated actions auditable?
- Are tool permissions least-privilege and bounded by confirmation or approval controls?
- Are memory, retrieval, and context provenance governed?
- Can unsafe AI behavior be disabled, rolled back, or routed to fallback?

Evidence:

- Eval suites.
- Prompt/version registry.
- Safety tests.
- Human review rules.
- Audit trails.
- Model monitoring.
- AI use-case register or records.
- Tool allowlist and permission scope.
- Prompt-injection, unsafe-action, and refusal tests.
- Memory, retrieval, data-boundary, and tenant-isolation evidence where relevant.
- AI incident or repeated-defect follow-up evidence.

World-class signal:

- AI behavior is measured, governed, auditable, and safe for the domain.

AI maturity evidence examples:

| Level | AI Runtime Governance Evidence |
|-------|--------------------------------|
| L1 | AI behavior exists, but prompts, models, data boundaries, and approval thresholds are informal or inconsistently reviewed. |
| L2 | AI use cases, owners, risk tiers, and basic prompt/model/tool records exist, but evals and runtime monitoring are partial. |
| L3 | AI evals, approval thresholds, audit events, tool boundaries, and release checks are consistently used for important AI behavior. |
| L4 | AI quality, safety, cost, drift, refusal, tool-call, and incident signals are measured and used in release and operational decisions. |
| L5 | AI incidents, user feedback, eval drift, and runtime telemetry continuously improve prompts, models, tools, policies, tests, and user experience. |

### 14. Cost, Capacity, and Resource Governance

Assessment questions:

- Are cloud, compute, storage, AI, logging, and integration costs visible?
- Are performance and cost tradeoffs reviewed?
- Are quotas, budgets, and alerts configured?
- Are expensive jobs, exports, retries, and polling controlled?

Evidence:

- Cost dashboards.
- Budget alerts.
- Capacity plan.
- Usage reports.
- Quota tests.

World-class signal:

- The team can scale without uncontrolled cost or resource waste.

### 15. People, Onboarding, and Continuous Improvement

Assessment questions:

- Are new contributors onboarded into WoW, V&V, guardrails, and project architecture?
- Are review standards calibrated?
- Are repeated mistakes turned into rules and tests?
- Are owners clear for product, engineering, QA, security, design, support, and operations?
- Does the team periodically review maturity progress?

Evidence:

- Onboarding checklist.
- Review examples.
- Training notes.
- Ownership matrix.
- Retrospective actions.

World-class signal:

- Process maturity survives team changes and does not depend on a few heroes.

## Default Domain Weights

Use equal weights for a first assessment. For release-critical assessments, use these suggested weights:

| Domain | Suggested Weight |
|--------|------------------|
| Governance and Operating Model | 7% |
| Product and User Journey Maturity | 8% |
| Delivery Performance and Flow | 7% |
| V&V and Quality Engineering | 10% |
| Secure SDLC and Privacy | 10% |
| Supply Chain and Artifact Integrity | 7% |
| Reliability, SLOs, and Incident Management | 8% |
| Observability and Supportability | 8% |
| Accessibility and UX Quality | 7% |
| Data Governance, Migration, and Recovery | 8% |
| Architecture and Technical Debt | 6% |
| Release, Deployment, and Operations | 6% |
| AI Runtime Governance | 3% |
| Cost, Capacity, and Resource Governance | 3% |
| People, Onboarding, and Continuous Improvement | 2% |

Adjust weights only with permission and explain the reason.

## Assessment Process

### Step 1: Ask Permission and Define Scope

Before assessing, confirm:

- Assessment mode.
- Project or release scope.
- Timebox.
- Evidence sources.
- Whether tracker updates are allowed after findings are reviewed.

### Step 2: Collect Evidence

Review:

- WoW usage.
- V&V evidence.
- Production readiness tracker.
- User manual and engineering guide.
- Tests and reports.
- CI/CD history.
- Security and dependency scans.
- Incident and support history.
- Architecture and runbooks.
- Release notes and rollback plans.

Mark evidence as current, stale, or missing.

Evidence should be considered stale when:

- It belongs to an older release, branch, environment, or product version than the one being assessed.
- It predates a major architecture, dependency, API, UI, data, security, or deployment change.
- It is not produced by current CI, release gates, operational dashboards, or recent review evidence.
- It cannot be traced to the current codebase, configuration, runtime, or release artifact.

Stale evidence may still be useful context, but it should not be treated as release proof unless it has been revalidated by current CI, targeted testing, release evidence, or an explicit reviewer check.

### Step 3: Score Each Domain

For each domain:

- Assign level 0-5.
- Explain evidence.
- Assign evidence confidence: Strong, Moderate, or Weak.
- Identify stale evidence and whether it was revalidated.
- List gaps.
- Identify risk.
- Identify maturity cap if applicable.

### Step 4: Identify Stop-the-Line Risks

Call out:

- Security exposure.
- Tenant or customer data leak.
- Data-loss risk.
- Broken auth/RBAC/session behavior.
- Failed migration or rollback uncertainty.
- Release-critical failed gate.
- Undefined ownership for critical areas.

### Step 5: Build Heatmap

Use this format:

| Domain | Score | Level | Evidence Strength | Risk | Key Gap |
|--------|-------|-------|------------------|------|---------|

Evidence strength:

- Strong
- Moderate
- Weak
- Missing

Risk:

- Low
- Medium
- High
- Critical

### Step 6: Create Prioritized Action List

Group recommendations into:

- Critical: stop-the-line issues or release blockers.
- Important: hardening needed before broad production use.
- Improve: maturity upgrades that increase scale, speed, reliability, security, or user trust.

Recommended action format:

| Priority | Domain | Recommendation | Why It Matters | Evidence Needed | Owner/Module |
|----------|--------|----------------|----------------|-----------------|--------------|

### Step 7: Ask Before Tracker Updates

After presenting findings, ask:

```text
Do you want me to add these maturity improvement items to the Project Tracker?
```

Do not add items until approved.

### Step 8: Reassess When Triggered

Recommended reassessment triggers:

- Before major release.
- After major incident.
- After major migration milestone.
- After repeated defects in the same area.
- After major architecture, security, data, or reliability changes.
- When production-readiness review shows broad or repeated gaps.

## Output Template

Use this structure for assessment results:

```markdown
# Maturity Level Assessment Result

## Executive Summary Card

Overall maturity:
Release posture:
Evidence confidence:
Top risk:
Most important improvement:
Stop-the-line status:
Recommended next action:

## Scope

## Executive Summary

Overall maturity: Lx.x / 5
Evidence confidence: Strong / Moderate / Weak
Release posture: Green / Yellow / Red

## Top 5 Findings

| Rank | Finding | Severity | Why It Matters | Recommended Action |
|------|---------|----------|----------------|--------------------|

## Maturity Caps

## Domain Heatmap

| Domain | Score | Level | Evidence Confidence | Evidence Freshness | Risk | Key Gap |
|--------|-------|-------|---------------------|--------------------|------|---------|

## Stop-the-Line Findings

## Top Recommendations

## Prioritized Action List

## Tracker Items Proposed

## Residual Risks

## Evidence Reviewed
```

## Assessment Principles

- Be evidence-led, not opinion-led.
- Prefer clear gaps over inflated scores.
- Do not punish teams for honest visibility.
- Separate release blockers from maturity improvements.
- Avoid turning maturity assessment into bureaucracy.
- Make recommendations practical, sequenced, and owned.
- Keep production-readiness and maturity assessment permission-based.

## Optional Integration With Production Readiness

When `Production_Readiness_Checklist.md` identifies broad or repeated gaps, the agent may ask:

```text
The production-readiness review found systemic gaps across multiple categories. Do you want me to run the optional Maturity Level Assessment and provide a maturity heatmap with a prioritized action list?
```

Only run the assessment after approval.

Only add findings to a tracker after a second approval.
