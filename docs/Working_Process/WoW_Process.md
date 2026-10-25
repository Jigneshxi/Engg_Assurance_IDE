# Way of Working Process

## Purpose

This document defines a reusable way of working for product, engineering, QA, and AI-assisted delivery teams. It is designed to be portable across future projects while preserving practices that support clear planning, TDD-driven development (features, enhancements, and fixes), strong verification, release-quality UX, and disciplined Git hygiene.

Use this process as the default operating model whenever the team is building, hardening, debugging, documenting, or preparing a product for release.

## Scope

This file applies to:

- feature development and bug fixes
- UI, backend, data, infrastructure, and automation work
- product, platform, API, mobile, cloud, and embedded domains
- cross-tenant and RBAC-sensitive work
- documentation updates
- AI-assisted and autonomous agent workflows

## Interaction Mode

When starting the process, the agent will prompt you to choose **Automated** (full-pipeline execution) or **Human-In-The-Loop (HITL)** (step-by-step confirmations).

### How it works

1. **Initial Prompt** - At the beginning of the workflow the agent asks:
   *"Select interaction mode: (A)utomated - run all SDLC steps sequentially, or (H)ITL - require your confirmation after each milestone."*
2. **Milestone confirmations** - In HITL mode, after each key step the agent presents a Yes/No prompt covering:
   - Requirement understanding
   - Bug understanding
   - Implementation approach
   - Additional bugs list
   - Whether to perform another round of code review
   - Whether to re-run the flow in visual-testing mode, etc.
3. **User response** - Reply **Yes** to proceed, **No** to pause and adjust the plan.
4. **Automatic mode** - If you choose Automated, the agent proceeds through all milestones without intermediate prompts, only reporting final outcomes.

### Benefits
- **Flexibility** - Teams can switch between fast-forward execution and careful, gated progress.
- **Transparency** - Each milestone's status is explicitly confirmed, reducing misalignment.
- **Control** - You retain the ability to intervene at any point by selecting HITL.

> **Note:** The chosen mode is remembered for the current run. You can change it by restarting the process.

It is intended to be modular so teams can reuse sections for tickets, sprints, and handoffs.
Sections are also designed to be adapted for plans, training, audits, or other reusable reference purposes.

This process is written for the broader developer community: individual contributors, cross-functional teams, open source projects, and enterprise delivery groups. It should work across languages, platforms, deployment models, and project sizes.

## How to use this file

- Use this as a delivery framework, not a rigid checklist.
- Apply only the sections relevant to the current work.
- Reuse sections as bite-sized guidance for tickets, teams, or handoffs.
- Keep the process visible in trackers, docs, and handoffs.
- Adapt the language to your team's tools, operating model, and domain.

## Mandatory Companion Controls

This Way of Working process has mandatory companion controls that must be consulted whenever this process is used.

Required companion documents:

- `V_and_V_Process.md` - mandatory verification and validation control model.
- `Production_Readiness_Checklist.md` - reusable master checklist for post-completion production-readiness reminders.
- `Rules.md` - canonical engineering behavior and coding governance.
- `AGENTS.md` - repository-specific AI execution adapter, when available.

`V_and_V_Process.md` is not optional. Any feature, bug fix, UI change, API change, data change, security-sensitive change, or release-hardening task must use the V&V process to define proof, coverage, evidence, residual risk, and release readiness.

Before implementation begins, the team or AI agent must answer:

- Which V&V dimensions apply?
- What proof is required?
- Which tests, visual checks, API checks, security checks, performance checks, or manual evidence are needed?
- What residual risk will remain if some evidence cannot be collected?

A task cannot be marked Done or release-ready unless the applicable `V_and_V_Process.md` expectations are satisfied or explicitly risk-accepted.

`Production_Readiness_Checklist.md` must be used when the user approves a post-completion readiness reminder pass. It provides the reusable master checklist; the project tracker records which items are already done, accepted as risk, not required, or still pending.

## Guardrail Framework

Guardrails are mandatory controls that protect users, data, security, quality, release safety, and delivery integrity. They are not suggestions. If a guardrail triggers, the team or AI agent must pause, clarify, approve, test, or risk-accept before proceeding.

Guardrails should be enforced through process, automation, review, and evidence. The strongest guardrails should become tests, CI gates, branch protections, checklists, tracker controls, or approval requirements.

### Guardrail Format

Every guardrail should be written so it can be audited.

Each guardrail should define:

- Trigger.
- Required behavior.
- Approval required.
- Evidence required.
- Stop condition.
- Tracker requirement.

### Stop-the-Line Guardrails

Stop-the-line guardrails are non-negotiable pause conditions.

Pause work immediately when any of these conditions appear:

- Possible data loss or data corruption.
- Security exposure or secret leakage.
- Cross-tenant, cross-customer, or cross-account data visibility.
- Broken authentication, authorization, RBAC, or session behavior.
- Failed migration or unclear rollback path.
- Failed release gate or failed critical test.
- Unclear expected behavior for a high-risk change.
- Destructive command, database operation, or irreversible admin action.
- Production outage, partial outage, repeated service instability, or missing recovery path.
- Compliance, privacy, financial, healthcare, legal, or regulated-data risk.
- User journey degradation in a critical workflow.

If a stop-the-line guardrail triggers, do not continue implementation until the issue is clarified, approved, tested, or explicitly risk-accepted.

### Risk Tier Model

Classify work before implementation so the required proof and approval level are clear.

- Low: local or simple change with limited blast radius. Targeted verification is usually enough.
- Medium: one module, screen, endpoint, job, or workflow. Targeted regression and review are required.
- High: cross-module, data, auth, tenant, workflow, migration, integration, or release risk. TDD proof, impact assessment, adjacent regression, and reviewer approval are required.
- Critical: data loss, security breach, tenant leak, production outage, compliance risk, financial approval risk, or irreversible operation. Stop-the-line, explicit approval, rollback plan, and evidence package are required.

### Destructive and Irreversible Action Guardrail

Get explicit approval before any destructive or irreversible action.

Examples:

- Deleting files, records, users, tenants, org units, workflows, reports, or artifacts.
- Running migrations, data repair scripts, mass updates, or cleanup scripts.
- Resetting Git, database, cache, queue, or runtime state.
- Rotating secrets or changing production configuration.
- Removing compatibility paths, feature flags, or fallback behavior.
- Force-pushing, rewriting history, discarding work, or overwriting user changes.

Prefer reversible, previewable, audited operations. When deletion is required, include confirmation, dependency checks, backup or rollback path, and audit evidence.

### Scope Containment Guardrail

Complete the requested job first.

- Do not start adjacent improvements without permission.
- Do not use production-readiness reminders as permission to implement follow-up work.
- Do not refactor broadly unless it is required for root cause or explicitly approved.
- Track newly discovered issues instead of silently absorbing them into the current task.
- Keep the final summary focused on the requested outcome, verification, and residual risk.

### Data Classification and Privacy Guardrail

Classify data before using it in code, tests, logs, screenshots, exports, documentation, support artifacts, AI prompts, or telemetry.

Data classes:

- Public: approved for public sharing.
- Internal: safe inside the organization or project team.
- Confidential: sensitive business, operational, or customer-adjacent information.
- Restricted / PII / Regulated: personal, tenant, financial, healthcare, legal, credential, security, or regulated data.

Restricted data must not be committed, pasted into prompts, logged, exported, screenshotted, or used in tests unless explicitly sanitized and approved.

### Supply Chain and Dependency Guardrail

Review every new or upgraded dependency before adoption.

Check:

- License compatibility.
- Vulnerability status.
- Maintenance health.
- Transitive dependencies.
- Bundle size, runtime, or deployment impact.
- Lockfile changes.
- Whether an existing dependency or standard library capability already solves the need.
- Security-sensitive usage, such as parsing, auth, crypto, networking, file handling, or execution.

### Feature Flag Lifecycle Guardrail

Every feature flag should have:

- Owner.
- Purpose.
- Default state.
- Rollout plan.
- Kill switch behavior.
- Test coverage for enabled and disabled states.
- Expiry or removal date.
- Monitoring expectation.

Feature flags should not become permanent hidden product states without review.

### Observability Acceptance Guardrail

Production-impacting changes must be diagnosable.

Consider:

- Useful logs.
- Metrics for success, failure, latency, volume, retries, and saturation.
- Trace or correlation ID where flows cross UI, API, jobs, queues, or integrations.
- Audit events for sensitive or business-critical actions.
- User-facing recovery messages.
- Operator troubleshooting evidence.

### Performance Budget Guardrail

Each project should define performance budgets for production-critical paths.

Typical budgets:

- API latency.
- Page load and interaction responsiveness.
- Background job duration.
- Export or report generation.
- Bundle size.
- Memory and CPU usage.
- Polling, retry, and reconnect behavior.
- Concurrency and quota behavior.

If no budget exists, the first production-readiness pass should create a follow-up item to define one.

### Failed Gate and Flaky Test Guardrail

Failed gates and flaky tests must not be ignored silently.

- Failed tests must be classified as product bug, test bug, environment issue, or accepted risk.
- Flaky tests must have owner, reason, and remediation path.
- Skipped tests must have owner and reason.
- Release-critical flaky tests must be fixed or explicitly risk-accepted before release.
- A green run after rerun does not erase the need to understand repeated flakiness.

### Incident Learning Guardrail

Production incidents and repeated bugs must improve the system.

After a production incident or repeated defect pattern:

- Update `Rules.md` when a behavior rule would prevent recurrence.
- Add or update tests.
- Update `V_and_V_Process.md` coverage expectations if the proof model was incomplete.
- Update runbooks, support docs, or operational guidance.
- Add a production-readiness checklist item when the pattern is reusable.
- Track residual risk and owner.

### Architecture Decision Guardrail

Use ADR-style notes for material architecture decisions.

Examples:

- New storage model.
- New service boundary.
- New auth, session, or tenant model.
- New workflow engine or orchestration pattern.
- New integration pattern.
- New caching strategy.
- New deployment or runtime model.
- Major dependency choice.
- Cross-cutting abstraction.

Architecture notes should capture context, decision, alternatives considered, consequences, rollback or migration path, and evidence required.

### UX Degradation Guardrail

Do not degrade user experience without product approval and tracker visibility.

Protected areas:

- Navigation clarity.
- Readability.
- Accessibility.
- Task completion.
- Form behavior.
- Error recovery.
- Responsive layout.
- Theme contrast.
- Performance perception.

Any intentional UX tradeoff requires product approval, explanation, and follow-up tracking when the tradeoff is temporary.

### AI Output Governance Guardrail

AI-assisted work must remain inspectable, verified, and accountable.

AI agents must:

- Inspect relevant code before editing.
- State assumptions when they matter.
- Preserve existing user work.
- Avoid destructive changes without approval.
- Run appropriate verification.
- Report residual risk.
- Avoid inventing APIs, data, routes, behavior, or product claims.
- Avoid treating generated output as correct without review.
- Record tracker or documentation updates when behavior changes.

### AI Governance Operating Layer

Use this layer when the product uses AI features, autonomous or semi-autonomous agents, model calls, prompts, tools, memory, retrieval, generated actions, or AI-assisted decision support.

AI governance must be practical, inspectable, and evidence-based. Do not rely on broad claims such as "AI is safe" or "the model handles it." Define the use case, risk, controls, proof, owner, and recovery path.

#### AI Use-Case Record

Every material AI feature should have a lightweight use-case record before release.

Capture:

- Business or user purpose.
- Users, personas, and affected workflows.
- Model, provider, prompt, tool, policy, retrieval, and memory components.
- Data used, data classification, retention, and tenant/customer boundaries.
- Autonomy level: assistant, decision support, recommendation, action with approval, or autonomous action.
- Risk tier and why it applies.
- Human approval threshold.
- Monitoring, audit, fallback, rollback, and disable path.
- Primary owner and escalation path.

#### AI Risk Classification

Classify AI work before implementation or release.

- Low: internal assistance, no sensitive data, no external action, low user impact.
- Medium: user-facing recommendation, non-sensitive workflow support, recoverable output.
- High: sensitive data, tenant/customer impact, workflow execution, financial/legal/healthcare/compliance relevance, or tool use.
- Critical: autonomous action, destructive capability, privileged tool access, regulated decision support, safety impact, or broad production blast radius.

High and Critical AI work require explicit V&V evidence, human approval thresholds, auditability, rollback or kill switch, and owner sign-off.

#### Agent Tool Safety Standard

AI tools and agents must use least privilege.

Required controls:

- Tool allowlist and scoped credentials.
- Dry-run or preview mode for risky actions.
- Confirmation before destructive, irreversible, privileged, or customer-visible actions.
- Tenant, workspace, customer, and data-boundary enforcement.
- Egress, file, network, and command restrictions where relevant.
- Audit trail for tool calls, inputs, outputs, approvals, failures, and retries.
- Fallback path when the tool, model, or backend is unavailable.

#### AI Human Approval Thresholds

Human approval is required when AI output or action can:

- Change customer, tenant, financial, healthcare, legal, compliance, security, or production state.
- Delete, overwrite, export, publish, approve, or execute privileged operations.
- Affect access control, policy, identity, secrets, billing, reporting, or audit evidence.
- Make recommendations that users may reasonably interpret as authoritative in a sensitive domain.

Approval should be explicit, traceable, and tied to the action being approved.

#### AI Memory and Data Governance

AI memory and retrieval must be bounded.

Check:

- What information can be stored, retrieved, summarized, or reused?
- What data must never enter prompts, memory, telemetry, or external providers?
- How tenant, customer, user, and project boundaries are enforced.
- How memory is deleted, expired, corrected, or isolated.
- How retrieved context provenance is shown or logged.
- How memory poisoning, stale context, and prompt injection are mitigated.

#### AI Transparency and User Disclosure

When AI behavior affects users, make the experience understandable.

Users should know:

- When AI is assisting, recommending, generating, or acting.
- What the AI can and cannot do.
- What requires human approval.
- How to inspect, correct, reject, retry, or escalate AI output.
- Whether AI-generated output is draft, recommendation, evidence, or executed action.

#### AI Incident Response Rule

AI incidents and repeated AI defects must improve the system.

When AI causes unsafe output, wrong action, privacy concern, hallucination, tool misuse, approval bypass, or repeated user confusion:

- Pause or disable the affected AI path when risk is high.
- Preserve evidence: prompt/model/tool versions, inputs, outputs, tool calls, approvals, logs, and user impact.
- Roll back prompt, model, policy, memory, tool configuration, or feature flag where possible.
- Add or update evals, tests, rules, documentation, monitoring, and readiness checks.
- Record residual risk and owner.

## Legacy, Migration, and Ad-Hoc Project Adoption

Use this section when applying the WoW process to migration projects, monolithic codebases, legacy systems, or projects that were built in an ad-hoc manner without consistent architecture, tests, documentation, ownership, or delivery discipline.

### Adoption Principle

Do not attempt a big-bang cleanup. Stabilize first, add safety rails, then improve slice by slice. The goal is to stop the project from continuing in ad-hoc mode without destabilizing working behavior.

### Discovery and Baseline

- Identify current architecture, runtime entry points, deployment flow, critical user journeys, and business-critical processes.
- Inventory modules, APIs, jobs, databases, integrations, scripts, manual operations, and ownership gaps.
- Document what must not break during migration or stabilization.
- Capture known production issues, flaky behavior, missing tests, missing documentation, duplicated logic, security gaps, and release risks.
- Separate business-critical behavior from obsolete, unused, or speculative code.

### Safety Rails Before Change

- Add smoke tests around critical flows before refactoring.
- Add characterization tests for legacy behavior before changing internals.
- Add API, message, file, or integration contract tests where external behavior must remain stable.
- Add health checks, logging, rollback notes, and basic observability where missing.
- Use `V_and_V_Process.md` to define the minimum evidence needed before each risky change.
- Freeze risky rewrites until the current behavior has enough proof to prevent accidental regressions.

### Slice-Based Migration

- Prefer strangler-fig migration over big-bang rewrites.
- Migrate one workflow, endpoint, module, screen, job, report, or integration at a time.
- Wrap legacy behavior behind stable interfaces before replacing internals.
- Compare old and new behavior before switching traffic or retiring legacy paths.
- Keep old and new paths observable during transition.
- Keep rollback paths available for each migration slice.

### Technical Debt Governance

- Maintain a debt register with owner, risk, impact, and target milestone.
- Distinguish between tolerated legacy debt, active release blockers, and roadmap cleanup.
- Avoid mixing cleanup, migration, and feature work unless the dependency is explicit.
- Remove dead code only after usage evidence confirms it is safe.
- Convert repeated legacy mistakes into `Rules.md` guidance, tests, automation, or CI gates.

### Progressive WoW Adoption

- Apply the full WoW process to all new work immediately.
- Apply stricter gates first to critical modules, security-sensitive areas, and active migration slices.
- Introduce `Rules.md`, `AGENTS.md`, trackers, Definition of Done, code review guardrails, and CI gates progressively.
- Start with lightweight proof where the system has no tests, then deepen coverage as migration risk increases.
- Keep the process practical: do not block emergency fixes on perfect coverage, but record residual risk and follow-up hardening work.

### Release and Rollback

- Use feature flags, compatibility modes, canary releases, shadow reads, dual writes, or parallel runs where appropriate.
- Promote only when evidence proves parity or the intended improvement.
- Keep rollback steps, data recovery notes, owner contacts, and operational runbooks visible.
- Document residual risk before release.
- Use `V_and_V_Process.md` to define parity checks, migration evidence, release gates, and risk acceptance for every migration slice.

### Migration Notes

- Migration success is measured by safer delivery, clearer ownership, stronger evidence, and reduced operational risk, not only by moving code to a new stack.
- Legacy behavior should not be preserved blindly. Preserve what users and the business still need; improve or retire what is unsafe, unused, or misleading.
- New architecture should be introduced through proven seams, not imposed through unverified rewrites.

## Developer Adoption

- Share this process with new team members, contributors, and reviewers.
- Use it as a common reference for handoffs, code reviews, and sprint planning.
- Encourage teams to adapt the reusable sections for their own workflows while preserving the underlying quality guardrails.
- Keep the document as a living guide: update it when you discover better patterns or coverage gaps.

## Workflow Orchestration

### Plan Mode Default

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, stop and re-plan.
- Use plan mode for verification as well as implementation.
- Write enough specs upfront to reduce ambiguity.

### Subagent Strategy

- Use subagents to keep the main context clean.
- Offload research, exploration, and parallel analysis.
- For complex problems, use more compute via subagents.
- Assign one task per subagent for focused execution.

### Self-Improvement Loop

- After any correction, update lessons or task notes with the pattern.
- Write rules that prevent the same mistake.
- Iterate on those lessons until the mistake rate drops.
- Review lessons at session start when relevant.

### Verification Before Done

- Do not mark a task complete without proof.
- Compare behavior between main and your changes when relevant.
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, and show correctness.

### Demand Elegance

- For non-trivial changes, ask "is there a more elegant way?"
- If a fix feels hacky, make it cleaner.
- Skip this for simple, obvious fixes.
- Challenge your work before presenting it.

### Autonomous Bug Fixing

- Fix bug reports without hand-holding.
- Point at logs, errors, or failing tests, then resolve them.
- Avoid unnecessary context switching.
- Resolve failing CI tests where possible without being told how.

## Core Principles

1. Protect user value.
Every change should make the product clearer, safer, faster, more reliable, or easier to use.

2. Prefer root-cause fixes.
Avoid temporary patches that hide symptoms. If a bug repeats, treat it as a process, coverage, or design gap.

3. Keep changes focused.
Touch the smallest reasonable surface area, but do not under-fix a cross-cutting issue when the real problem spans modules.

4. Prove before closing.
Do not mark work done until there is evidence: tests, screenshots, logs, build output, review feedback, or a clear manual verification path.

5. Build modularly.
Use clear code structure and module boundaries so each change can be written, tested, and reviewed independently.

6. Harden workspaces continuously.
Fix issues as you continue hardening each and every workspace. Avoid design drift and do not degrade UI/UX quality as the platform evolves.

7. Preserve work.
Keep intentional source changes separate from generated artifacts, scratch files, and temporary state.

8. Communicate clearly.
Share short, useful updates while working. Make progress visible without overwhelming stakeholders.

9. Validate AI work.
Treat AI-assisted output as a draft that requires inspection, verification, and human oversight.

10. Keep it portable.
Design the process so it works across teams, platforms, languages, and project sizes.

## Coding Standards and Code Structure

Every project should define coding standards early so implementation quality does not depend on individual preference or AI guesswork.

Code standards should cover:

- Folder structure, module ownership, and where new files belong.
- Naming conventions for files, classes, functions, variables, tests, routes, components, and configuration.
- Dependency boundaries between UI, API, domain logic, persistence, infrastructure, and shared utilities.
- Code ownership for high-risk areas such as authentication, authorization, data access, billing, workflows, security, and deployment.
- Error handling patterns for validation errors, system failures, retries, partial failures, and user-facing recovery.
- Logging standards for operational events, debug evidence, sensitive-data masking, correlation IDs, and incident review.
- Comment standards that explain intent, tradeoffs, and non-obvious logic without restating simple code.
- Configuration ownership so runtime behavior is controlled through approved settings rather than hardcoded values.
- Reuse expectations so shared behavior lives in common modules instead of being copied across screens, endpoints, jobs, or tests.

Keep code structure boring, predictable, and easy to navigate. Prefer explicit ownership and stable boundaries over clever abstractions that make changes harder to review.

## Environment and Configuration Hygiene

Configuration should be deliberate, traceable, and safe across local, test, staging, and production environments.

Teams should define:

- Required environment variables, default values, validation rules, and safe local-development examples.
- Secret-handling rules so credentials, tokens, private keys, and customer data never enter source control, logs, screenshots, or generated reports.
- Local, test, staging, and production parity expectations for APIs, databases, queues, auth, feature flags, and integrations.
- Migration and configuration-change review rules for schema updates, seed data, tenant setup, rollout scripts, and backward compatibility.
- Feature-flag rules for incomplete features, staged rollout, kill switches, and rollback behavior.
- Generated-file rules that separate intentional fixtures from runtime databases, caches, screenshots, build output, reports, and scratch artifacts.
- Startup and health-check expectations so services fail clearly when configuration is missing or invalid.

Any configuration change that can affect users, data, security, or operations should include verification evidence and rollback notes.

## Observability and Supportability

Production-grade systems must be diagnosable without asking users to reproduce issues repeatedly or clear browser state manually.

Every meaningful feature should consider:

- Logs that capture important state transitions, failures, retries, and recovery decisions.
- Metrics that show volume, latency, error rates, saturation, queue depth, rate limits, and business-critical outcomes.
- Traces or correlation IDs that connect frontend actions, API calls, background jobs, integrations, and audit events.
- Audit events for security-sensitive, tenant-sensitive, financial, approval, administrative, and data-changing operations.
- User-facing error messages that explain what happened, what the user can do next, and whether the system is retrying.
- Recovery paths for offline states, backend interruptions, stale data, failed exports, failed jobs, partial saves, and permission changes.
- Support evidence such as request IDs, timestamps, tenant or workspace context, and safe diagnostic summaries.

Observability should be designed as part of the feature, not added only after production incidents.

## SDLC Process

### 1. Plan

- Define the problem or outcome.
- Clarify requirements with product, QA, and stakeholders.
- Identify affected users, journeys, and dependencies.
- Capture acceptance criteria, edge cases, and risks.
- Choose the verification strategy.
- Consult `V_and_V_Process.md` and define the required proof, coverage dimensions, evidence, and residual-risk handling before implementation begins.

### 2. Design

- Review existing architecture, data flow, and UX patterns.
- Sketch changes at the right fidelity: API contract, UI layout, workflow state, and module boundaries.
- Define the code structure and interfaces for each module.
- Confirm assumptions with product, QA, security, and operations when necessary.

### 3. Build

- Write modular code with clear ownership and testability.
- Prefer test-first or test-coffee development when practical.
- Implement the smallest complete fix or feature.
- Keep the implementation intentional, maintainable, and reviewable.
- Minimize technical debt within the scope of the work.
- Include workspace hardening steps when the change touches a workspace or UI surface.
- Incorporate in-line comments as the code is being generated to explain complex logic and intent, improving clarity for human reviewers.

### 4. Validate

- Prove the issue first with failing tests or a reproducible proof.
- Implement the fix.
- Validate with unit, integration, and end-to-end tests as appropriate.
- Perform V&V checks across UI, API, data, and workflows.
- Use `V_and_V_Process.md` as the mandatory validation checklist for evidence, coverage dimensions, release gates, and residual risk.
- Verify the user journey end to end when needed.
- Confirm UI/UX quality stays intact and new behavior meets platform standards.
- Ensure the implementation plan documents how quality is preserved and verified.

### 5. Release

- Update documentation, tracker, and release notes as needed.
- Review the change with a focus on risk, quality, and verification evidence.
- Ensure the commit contains only source, tests, and docs relevant to the work.

### 6. Operate

- Capture any residual risks or follow-up work in a tracker.
- Monitor relevant indicators after release if needed.
- Use feedback to improve the process.

## AI-Assisted Development Best Practices

When using autonomous agents or AI assistance:

- Define the problem clearly before invoking AI.
- When delegating debugging to AI, explicitly prompt it to: "Analyze this, do code review and suggest potential root causes" before asking for a patch.
- Use AI for exploration, draft code, and discovery, not as a final source of truth.
- Validate every AI-generated change against the codebase, tests, design, and security model.
- Keep the agent's assumptions explicit and documented.
- Maintain a human review loop for correctness, safety, and product intent.
- Avoid blind trust: verify types, visibility, permissions, and behavior.
- Where possible, generate tests or verification scenarios alongside the implementation.
- Prompt the AI to incorporate in-line comments explaining complex logic as it generates code, ensuring clarity before review.

AI assistance is a tool, not an owner. The human team retains responsibility for design, correctness, and release readiness.

## AI-Assisted Guardrails

When AI or autonomous agents are part of the workflow, apply explicit guardrails at each SDLC stage:

- Plan: Confirm requirements and acceptance criteria before generating suggestions. Use AI to explore options, not to define scope.
- Design: Validate AI-generated architecture options, interface sketches, and workflows against existing patterns and constraints.
- Build: Generate draft code or tests with AI, then review with domain knowledge, type checks, and dependency analysis.
- Validate: Verify AI output with independent tests, security scans, code reviews, and manual checks. Capture the exact inputs and outputs used.
- Release: Document AI-assisted decisions, verification evidence, and any remaining assumptions.

Guardrails should include:

- Prompt hygiene: clear intent, context, and constraints.
- Output validation: correctness, safety, and maintainability.
- Traceability: store prompts, AI sources, and review notes when possible.
- When workspace context is insufficient, prompt clearly before searching for docs (`.md`, `.docx`, `.txt`, `.pdf`). Default to looking in the `docs` folder first.
- Human approval: every production change requires a human reviewer.
- Risk assessment: treat AI assistance as an increase in review scope, not a replacement.

## Rules.md and AI Coding Governance

`Rules.md` is the canonical engineering behavior guide for the project. It defines how humans and AI coding agents should design, implement, test, review, and maintain the codebase.

### Purpose

The purpose of `Rules.md` is to keep engineering behavior consistent across the project, reduce repeated mistakes, and ensure AI-generated changes follow the same standards expected from human contributors.

### Core Principles

- `Rules.md` is the single source of truth for engineering behavior, coding standards, architecture expectations, testing discipline, security rules, and release-quality practices.
- Tool-specific instruction files are adapters, not separate truth sources. Files such as `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/*`, or `CLAUDE.md` should reference or summarize `Rules.md`, not redefine conflicting standards.
- Rules must be scoped where needed. Backend, frontend, API, database, security, testing, documentation, and UI/UX rules may have different expectations and should be clearly separated.
- Every rule must be concise, actionable, and testable. Avoid vague guidance such as "write good code"; prefer rules such as "all API mutations must include positive, negative, RBAC, tenant-isolation, and audit coverage."
- Critical rules must be enforced by automation. CI, linting, type-checking, tests, security scans, coverage gates, branch protection, and code owners should enforce what matters most.
- AI agents must inspect `Rules.md` before making significant changes and must explain which rules are relevant when the change carries design, security, data, or regression risk.
- Rules must evolve when bugs, code reviews, audits, or production incidents reveal repeated failure patterns.

### Recommended Rule Categories

- Product and domain context
- Repository and folder structure
- Architecture boundaries
- Backend/API coding standards
- Frontend/UI coding standards
- Security and privacy requirements
- Tenant isolation and authorization rules
- Data persistence and migration rules
- Testing and V&V requirements
- Accessibility and UX quality expectations
- Documentation requirements
- Git, commit, and release practices
- AI-agent operating rules
- Forbidden patterns and known pitfalls

### Rule Precedence

Use a clear precedence model so engineering standards do not drift across tools:

1. `Rules.md` owns canonical engineering standards and project behavior.
2. `AGENTS.md` adapts those standards into repository-specific AI instructions.
3. Tool-specific files such as `.github/copilot-instructions.md`, `.cursor/rules/*`, or `CLAUDE.md` mirror the relevant guidance for each tool.
4. CI, tests, linters, security scans, and branch protections enforce critical rules.

If files conflict, update the canonical rule in `Rules.md` first, then align the adapters and automation.

### AGENTS.md Usage

`AGENTS.md` is the project-level adapter for AI coding agents. It should translate the canonical guidance from `Rules.md` into practical instructions for working inside the repository.

Use `AGENTS.md` for:

- Repository-specific setup, build, test, and verification commands
- Local folder structure and ownership notes
- Coding conventions that apply to the codebase
- Safe editing rules, Git hygiene, and forbidden actions
- Required test commands before marking work complete
- Links back to `Rules.md` for canonical engineering standards

`AGENTS.md` must not become a competing source of truth. If a rule is broadly applicable, update `Rules.md` first, then reflect the practical repository-specific instruction in `AGENTS.md`.

For larger repositories, scoped `AGENTS.md` files may be added inside major folders such as `frontend/`, `backend/`, or `tests/` when those areas require different commands, ownership notes, or conventions.

### AI Usage Expectations

Before implementing non-trivial changes, AI coding agents should:

1. Read the relevant sections of `Rules.md`.
2. Inspect the existing code before proposing or changing behavior.
3. Identify applicable backend, frontend, testing, security, and UX rules.
4. Use a TDD or proof-first approach for bug fixes and regression-sensitive work.
5. Avoid broad rewrites unless explicitly justified.
6. Preserve existing user work and avoid destructive Git or filesystem actions.
7. Run targeted verification and report what was tested.
8. Update documentation or trackers when behavior changes.

### Enforcement Model

`Rules.md` guides behavior, but production quality must not depend on memory or goodwill alone. Any rule that protects correctness, security, data integrity, tenant isolation, accessibility, or release readiness should be backed by automated checks.

Examples of enforceable controls include:

- Type checks
- Unit tests
- API contract tests
- UI and E2E tests
- Accessibility checks
- Security scans
- Coverage gates
- Linting and formatting
- CODEOWNERS review
- Branch protection
- Release readiness checklists

### Maintenance

`Rules.md` should be reviewed during major releases, architecture changes, post-incident reviews, and repeated defect patterns. When the team discovers a recurring mistake, the fix should not only be code-level; the related rule, test, or CI gate should also be improved.

## Bugs & Issues Intake

Use this section for first-pass triage and shared understanding. Use `Bug Fixing / Applying a Fix` for implementation discipline, and `Issue Intake and Bug Fix Lifecycle` for closure, re-audit, and hardening review.

When a concern is raised, analyze it by asking:

- What is the right behavior?
- What is the observed behavior?
- Is this a real bug, a UX gap, a data issue, or a question?
- What are the affected end-to-end paths, modules, and systems?

For each issue, capture:

- Right behavior in plain language.
- A clear list of identified bugs or gaps.
- A concrete fix plan with implementation steps.
- Change impact assessment and regression risks.
- The verification strategy required for the fix.

Use this section as a reusable template for issue triage and translating user feedback into fix plans.

## Default Delivery Loop

Use the SDLC Process and Planning Standards as your core guide: plan, prove, build, verify, review, document, and commit intentionally.

## Definition of Done

A change is Done only when it is implemented, verified, reviewed at the right level, and ready to be retained in the repository.

Minimum Definition of Done:

- Requirements and right behavior are implemented.
- Acceptance criteria and key edge cases are covered.
- Relevant tests pass, or an explicit reason is documented when a test cannot be run.
- Applicable `V_and_V_Process.md` expectations are satisfied or explicitly risk-accepted.
- Applicable guardrails were checked, satisfied, or explicitly risk-accepted.
- No known Critical or Important regression remains open.
- Security, data, tenant, accessibility, and operational implications are considered where relevant.
- User-facing text, documentation, tracker entries, and release notes are updated when behavior changes.
- Generated files, caches, runtime data, screenshots, and temporary artifacts are excluded unless intentionally required.
- The change is commit-ready with focused source, test, documentation, and fixture updates only.

Do not mark work Done because code was written. Mark it Done because the behavior is proven and the residual risk is understood.

## Post-Completion Production Readiness Reminder

After the requested job is complete, verified, and summarized, the agent should offer a production-readiness reminder pass. This reminder must happen only after the original task is complete; it must not interrupt, expand, or replace the requested work.

### Reminder Purpose

The reminder helps the team identify production-readiness gaps without creating scope creep. It is advisory until the user explicitly approves tracker updates or follow-up implementation.

### Reminder Trigger

After completing and verifying the requested job, ask:

```text
The requested job is complete and verified. Do you want me to run a production-readiness reminder pass against the master checklist and identify relevant remaining gaps?
```

If the user says no, stop.

If the user says yes, compare:

- The completed work.
- Affected modules, screens, APIs, data, security, operations, and documentation.
- Verification evidence from `V_and_V_Process.md`.
- The master checklist in `Production_Readiness_Checklist.md`.
- Existing project tracker entries, if a tracker is present.
- Triggered or missing guardrails from the `Guardrail Framework`.

### Relevance Rule

Do not dump the full master checklist after every job. Identify only the readiness items relevant to the completed work.

Examples:

- API change: API contract coverage, RBAC, tenant isolation, audit, performance, and documentation.
- UI change: visual checks, accessibility, keyboard flow, error states, responsiveness, and user manual updates.
- Auth or role change: session behavior, RBAC, tenant isolation, audit, security tests, and operational recovery.
- Data change: migration, backup, rollback, reconciliation, retention, and export behavior.
- Deployment or configuration change: feature flags, environment parity, release notes, rollback, monitoring, and alerts.

### Tracker Permission Rule

The agent must not add production-readiness items to the tracker without explicit permission.

After the reminder pass, ask:

```text
I found the following production-readiness follow-ups. Do you want me to add these to the Project Tracker?
```

Accepted responses may include:

- Add all.
- Add selected.
- Do not add.
- Revise the list first.

### Duplicate Prevention

Before adding tracker items, check whether similar readiness items already exist.

- If an item already exists, mention it and ask before updating evidence, status, or notes.
- Do not create duplicate tracker entries.
- Use stable readiness IDs from `Production_Readiness_Checklist.md` where possible.

### Tracker Entry Format

Each approved tracker item should include:

- Readiness ID.
- Category.
- Gap or follow-up.
- Why it matters.
- Priority.
- Owner or module.
- Evidence required.
- Suggested validation.
- Status.
- Date added or reviewed.

### Governance Rule

Production-readiness reminders are advisory until the user approves tracker updates. They must not delay, expand, or replace the originally requested task unless the user explicitly chooses to continue.

### Optional Maturity Assessment Invitation

After the requested work is complete and production-readiness reminders have been considered, the agent may offer an optional maturity assessment when systemic gaps, repeated defects, migration risk, release-hardening concerns, or broad quality issues are visible.

The agent may provide only an indicative maturity signal before formal assessment.

Example:

```text
Based on the current evidence, this area appears to be around L2/L3 maturity. This is only an indicative signal, not a formal score. Do you want me to run the formal Maturity Level Assessment using `Working_Process/Maturity_Level_Assessment.md`?
```

Rules:

- Do not run the maturity assessment automatically.
- Do not present an indicative maturity level as a formal score.
- Do not add maturity findings to a tracker without explicit follow-up permission.
- Do not suggest maturity assessment for small, low-risk tasks unless the user asks or systemic risk is visible.
- Use `Maturity_Level_Assessment.md` as the source of truth for formal scoring, evidence confidence, maturity caps, anti-gaming rules, and recommended improvement actions.

## Planning Standards

Use a plan when the task has any of these traits:

- More than one implementation step.
- Backend and frontend impact.
- Data-loss, security, RBAC, tenant, approval, or financial risk.
- User journey or navigation impact.
- Ambiguous expected behavior.
- New tests, docs, or release notes are needed.

Each plan should include:

- The right behavior.
- The suspected bug, gap, or desired outcome.
- Affected surfaces.
- Change impact and regression risk.
- Triggered guardrails and risk tier.
- TDD or verification strategy.
- Tracker updates required.

For simple one-line fixes, a lightweight plan is sufficient.

## Task and Tracker Management

- Plan first: write a plan to `tasks/todo.md` or a similar task tracker with checkable items.
- Verify the plan before implementation begins.
- Track progress by marking items complete as you go.
- Explain changes with a high-level summary at each step.
- Document results in the task tracker or review notes.
- Capture lessons in `tasks/lessons.md` after corrections or hardening work.

Use one tracker file or board as the single source of truth.

Tracker entries should include:

- Status: Not Started, Active, In Progress, Blocked, Done, Not Required, or Roadmap.
- Priority: P0 for release blockers, P1 for important hardening, P2 for polish or future depth.
- Owner or responsible module.
- Current evidence.
- Remaining risk.
- Daily progress notes or work log entry.
- Date or milestone when useful.

Tracker use should include a change trail for every new development and bug fix:

- Record the scope of work, decisions made, and verification performed.
- Update the tracker daily when work is active.
- Note follow-up actions, handoff requirements, or residual risk.
- Keep work comments brief, factual, and tied to the actual change.

When closing items:

- Mark Done only when implementation and verification are complete.
- Mark Not Required only when the requirement is intentionally dropped with a reason.
- Mark Roadmap when the work is valuable but outside the current release scope.
- Avoid leaving stale Active items after work is complete.

## Quality Control and Verification

Quality control should be layered and explicit:

- Unit tests for code-level correctness.
- Component and integration tests for behavior and UI integration.
- End-to-end tests for critical user journeys.
- Security and tenant isolation checks for sensitive flows.
- Manual review for usability, accessibility, and edge cases.

Checks and balances should include:

- Defined ownership for changes and review responsibility.
- Test coverage appropriate to the risk.
- Verification of agent-assisted changes by a human reviewer.
- Prompt and output provenance for AI-assisted contributions.
- Tracking of residual risk and follow-up actions.
- Separation of source changes from generated or temporary output.

For new features, enhancements, bug fixes, and risky changes, follow this TDD sequence:

1. Red.
Write a failing test that specifies the desired behavior. If automated proof is not practical, capture a reproducible manual or visual proof.

2. Green.
Implement the minimal change necessary to make the test pass.

3. Refactor.
Improve design, remove duplication, and ensure readability without changing behavior.

4. Regression.
Run adjacent tests affected by the change.

5. Review.
For high-risk work, request or perform a regression-risk review.

6. Evidence.
Record the exact commands, results, and any residual non-blocking risks.

Verification should match the risk:

- API contract change: API unit or integration tests.
- RBAC or tenant logic: positive, negative, spoofing, and isolation tests.
- UI layout change: component tests and visual inspection.
- User journey or permission behavior: end-to-end tests where possible.
- Performance or concurrency risk: load, race, retry, or idempotency tests.
- Documentation change: check the relevant user-facing docs against the current UI and routes.
- Triggered guardrail: verification must cover the guardrail evidence requirement or document explicit risk acceptance.

## Accessibility and Security Gates

Accessibility and security are minimum quality gates, not optional polish.

Accessibility gates should confirm:

- Keyboard navigation works for primary journeys, dialogs, menus, forms, and recovery actions.
- Focus states, labels, headings, landmarks, and accessible names are meaningful.
- Contrast, text size, spacing, and responsive behavior remain usable across supported themes and viewports.
- Errors are announced clearly and do not rely only on color, icons, or hidden technical messages.
- Dynamic updates, loading states, empty states, and disabled actions are understandable to assistive technologies.

Security gates should confirm:

- Authentication, authorization, RBAC, tenant isolation, and session context are enforced by the backend.
- Sensitive data is masked or excluded from logs, exports, screenshots, errors, telemetry, and generated reports.
- Mutation endpoints validate input, reject spoofed context, protect against replay where needed, and emit audit evidence.
- Secrets are never hardcoded or stored in client bundles, source control, test artifacts, or documentation examples.
- Security-sensitive UI actions are backed by server-side checks, confirmation flows, and meaningful failure states.

If a change touches accessibility or security-sensitive behavior, the gate must be verified before release readiness is claimed.

### Tracker

| Item | Description | Status | Owner | Priority | Added | Updated |
|------|-------------|--------|-------|----------|-------|----------|
| Feature 1 | Brief description of the feature/bug | NG | <owner> | Medium | <date-added> | <date-updated> |
| Feature 2 | Brief description of the feature/bug | NG | <owner> | Medium | <date-added> | <date-updated> |
| Feature 3 | Brief description of the feature/bug | NG | <owner> | Medium | <date-added> | <date-updated> |

*Use the status column to update to **OK** when the item is implemented and passes tests.*

### Bug Fixing / Applying a Fix

Use this section after intake confirms the right behavior and the issue type. It is the implementation checklist for root-cause fixes, impact assessment, TDD proof, and verification.

**Root Cause Analysis**  
- Identify the underlying reason for the defect. Document evidence, logs, and reproducing steps.
- Fix the root cause behind and not just the problem statement shared.

**Change Impact Assessment**  
- Assess which modules, data models, or external integrations may be affected. Outline regression-testing scope.

**TDD-Based Implementation**  
1. Write failing tests that capture the bug and expected behavior (API, UI, type checks).  
2. Implement the fix.  
3. Run tests; ensure they pass.

**Verification & Validation (V&V)**  
- Execute targeted API/UI tests, type-checking, and end-to-end user-journey scenarios.  
- Verify no data-loss risk and that cross-cutting concerns remain intact.

**Audit & Assurance**  
- Conduct a deeper user-journey audit covering related flows.  
- Record findings in the tracker with status **OK** once validated.

**Todo Management**  
- Create a detailed TODO list for each fix step, link to the tracker entry, and mark progress (`[/]` in-progress, `[x]` done).

*Follow this process for every fix to ensure robust, low-risk changes.*

When applying a fix:

- Start with a change impact assessment that identifies regression risk.
- Track implementation in a Todo list or lightweight plan.
- Use a TDD-based approach: write the test first, implement to make it pass, then prove the behavior.
- Include hardening coverage for the user journey, cross-cutting flow, and any data-loss risk.
- Run targeted V&V tests such as type checks, API tests, or UI/component tests.
- If the issue spans modules, include a deeper journey audit and verify adjacent surfaces.
- Confirm the original bug is fixed.
- Confirm related flows are still intact.
- Record the verification commands and results.
- Keep the fix portable by avoiding one-off or product-specific language.

When UI or workflow quality is part of the risk:

- Use headed visual tests where practical to prove the screen and journey behavior.
- Match a real viewport and scroll to the relevant area before capturing evidence.
- Prefer step-by-step verification with clear assertions on visible state and controls.
- Capture screenshots, video, or screen recordings as proof when available.
- Treat visual testing as regression validation, not only exploratory review.

## Code Review Guardrail

Use a formal review pass when:

- A release blocker is fixed.
- Security, tenant isolation, RBAC, financial approval, audit, workflow execution, or data integrity is touched.
- A broad refactor changes shared components.
- The user explicitly asks for re-audit or review.

Review output should prioritize:

- Critical findings.
- Important findings.
- Minor findings.
- Residual non-blocking risks.

Review closure rules:

- Fix Critical issues immediately.
- Fix Important issues before calling the slice release-hardened.
- Track Minor issues only if they do not block release.
- If the reviewer is wrong, explain why with code or test evidence.

## UI and UX Quality Bar

UI work must be treated as product design, not just component wiring.

Production-grade UI should be:

- Clear: users understand the screen's purpose.
- Guided: next actions are obvious.
- Consistent: spacing, headers, labels, and navigation follow platform patterns.
- Compact: avoid repeated headings, redundant controls, and unnecessary rows.
- Modern: use contemporary UI inputs, spacing, and interaction patterns that feel polished.
- Responsive: avoid horizontal scrolling and nested scroll traps.
- Honest: no fake, hardcoded, or misleading data.
- Functional: actions behave as users expect.
- Accessible: keyboard flow, labels, focus states, contrast, and errors are considered.

For complex or high-impact user-facing screens:

- Show relationships between objects naturally.
- Keep user-owned or tenant-specific data separate from global defaults.
- Use contextual empty states and recovery guidance.
- Keep technical detail visible only when it is useful.
- Prefer concise labels over explanatory clutter.

## Data, RBAC, and Tenant Safety

Any feature involving users, roles, permissions, tenants, audit logs, approvals, execution, or exports must be checked for:

- Positive authorized paths.
- Negative unauthorized paths.
- Cross-tenant spoofing attempts.
- Role downgrade or restricted-user behavior.
- Idempotency and retry behavior.
- Audit evidence correctness.
- Data visibility in list, detail, stats, and export endpoints.
- UI hiding or disabling of unavailable actions.

Enforce tenant and RBAC rules in the backend first. Frontend hiding is UX support, not security.

## Documentation Standards

Documentation should be user-journey focused, not only feature focused.

User docs should explain:

- Purpose of each workspace or module.
- When to use it.
- Main panels and controls.
- Step-by-step flows.
- Expected outcomes.
- Related workspaces.
- Empty, loading, error, and offline states.
- Troubleshooting and FAQ.

Engineering docs should explain:

- Architecture and module ownership.
- API contracts and data flow.
- Security and tenant boundaries.
- Testing strategy.
- Operational runbooks.
- Extension points.
- Known limitations and roadmap areas.

**Parallel Evolution Strategy:**
- Ensure the `User_Manual.md` and `Engineering_Guide.md` evolve in parallel with the codebase.
- Update documentation in the exact same delivery slice when behavior, architecture, or workflows change materially.

## Reusable V&V Coverage System

This section is the operating summary for reusable verification and validation. Keep it in the main WoW process for quick reference, and use `V_and_V_Process.md` for the deeper V&V playbook, coverage matrix guidance, API/UI/security/performance depth, and release evidence model.

Every project should maintain a reusable Verification and Validation coverage system. The goal is not only to increase test count, but to create trustworthy release evidence that shows the product works for real users, under real constraints, across expected and unexpected conditions.

This approach is portable across web applications, APIs, mobile products, data platforms, cloud services, desktop tools, AI systems, and embedded or integration-heavy platforms.

### Coverage Philosophy

Use tests as an evidence system, not only a defect detector.

Coverage should answer:

- What user journeys are supported?
- What business outcomes are protected?
- What APIs, screens, jobs, data flows, or integrations own each behavior?
- What can fail, and how does the product recover?
- Who is authorized to perform each action?
- What proof exists that the behavior works now?
- What residual risk remains before release?

Avoid claiming quality only from line coverage, test count, or green builds. Those signals are useful, but they are incomplete without journey, contract, security, data, and operational proof.

### Standard V&V Workspace Structure

Each project should create a dedicated verification folder or equivalent test area. A recommended structure is:

```text
project_tests/
  api/              # API, service, contract, schema, RBAC, and error-path tests
  unit/             # Code-level unit tests if not already colocated with source
  integration/      # Module-to-module or service-to-service tests
  e2e/              # End-to-end business journey tests
  ui/               # Browser, mobile, visual, accessibility, and navigation tests
  performance/      # Load, concurrency, latency, quota, retry, and resilience tests
  security/         # Auth, authorization, tenant isolation, injection, and data exposure tests
  data/             # Migration, data integrity, import/export, and reconciliation tests
  helpers/          # Shared fixtures, clients, auth helpers, report builders
  reports/          # Generated evidence: JUnit, HTML, screenshots, videos, matrices
  COVERAGE_PROGRESS.md
  COVERAGE_OWNERSHIP_MATRIX.md
  JOURNEY_COVERAGE_MAP.md
```

Adapt folder names to the project, but preserve the idea: separate test purpose from implementation technology.

### Coverage Sources

Do not derive tests only from code. Build coverage from multiple sources:

- Product requirements and acceptance criteria.
- User manual, onboarding guide, or support runbook.
- Engineering guide and architecture diagrams.
- API specifications such as OpenAPI, GraphQL schema, protobuf contracts, CLI command reference, event schema, or message contracts.
- UI navigation map, workspace map, or screen inventory.
- Critical business workflows.
- Security, RBAC, tenant, privacy, compliance, and audit requirements.
- Known bugs, incident history, production support issues, and customer complaints.
- Performance, scale, availability, and recovery expectations.
- Deployment, upgrade, caching, migration, and rollback requirements.

If documentation says a user can do something, the V&V suite should eventually have an owner that proves it.

### Test Layers

Use layered coverage. Not every behavior needs every layer, but release-critical behavior should have more than one proof point.

1. Unit and pure logic tests.
- Prove algorithms, validators, policy decisions, calculators, parsers, formatters, and small modules.
- Keep them fast and deterministic.

2. Contract tests.
- Prove request/response shapes, schema compatibility, error contracts, event contracts, CLI output, file formats, or integration payloads.
- Use these to prevent silent drift between frontend, backend, automation, and documentation.

3. API or service tests.
- Prove core service behavior, positive paths, negative paths, auth, RBAC, tenant boundaries, idempotency, audit evidence, and retry behavior.

4. Integration tests.
- Prove multiple modules work together: database plus service, queue plus worker, UI client plus API mock, event producer plus consumer, or pipeline step plus downstream system.

5. End-to-end journey tests.
- Prove user or business workflows across modules.
- Focus on outcomes, not only clicks or endpoints.

6. UI and visual tests.
- Prove navigation, layout, labels, actions, forms, state transitions, light/dark themes, accessibility, responsive behavior, and visual regressions.

7. Performance and resilience tests.
- Prove latency budgets, concurrency behavior, load tolerance, quota handling, reconnect/retry behavior, export polling, duplicate submission protection, and graceful degradation.

8. Security and data-protection tests.
- Prove unauthorized access is blocked, cross-tenant or cross-account data is isolated, sensitive data is masked, and audit trails are created.

### Coverage Dimensions

For each important feature, API, workflow, or screen, track these dimensions where relevant:

- Positive path: the expected success behavior works.
- Negative path: invalid input, missing data, and domain errors are handled clearly.
- Authorization: users only access what they are allowed to access.
- Isolation: tenant, organization, account, project, workspace, or customer boundaries are protected.
- Auditability: important actions leave traceable evidence.
- Idempotency: retries and duplicate submissions do not corrupt data.
- Data integrity: persisted, exported, imported, migrated, or reconciled data remains correct.
- Recovery: temporary backend, network, worker, queue, or integration failures have clear recovery behavior.
- UI usability: users can understand, complete, and recover from the flow.
- Accessibility: keyboard, focus, labels, contrast, and assistive technology expectations are met.
- Performance: response time, throughput, and resource usage remain within accepted limits.
- Observability: logs, metrics, traces, or alerts expose the right operational signals.

Not every feature requires every dimension. Risk determines depth.

### Coverage Ownership Matrix

Maintain a coverage ownership matrix. This prevents vague claims such as "we have tests" and replaces them with specific ownership.

Each row should include:

- Capability, user journey, API operation, screen, job, command, or integration.
- Primary source of truth: requirement, user manual section, API spec, or design.
- Owner test file or automation suite.
- Coverage layer: unit, contract, API, integration, E2E, UI, performance, security, data.
- Coverage dimensions: positive, negative, auth, isolation, audit, idempotency, performance, accessibility, etc.
- Mode: deterministic, mocked, live, visual, manual-assisted, or gated.
- Current status: Gap, In Progress, Covered, Blocked, Not Required, or Roadmap.
- Latest evidence: command, report, screenshot, trace, ticket, or CI run.
- Residual risk and next action.

Example:

```text
Capability: Create restricted user and assign role
Source: User Manual > User Administration
Owner: project_tests/api/test_user_lifecycle_contracts.py
Layers: API, E2E, UI
Dimensions: positive, negative, RBAC, isolation, audit
Mode: deterministic + live gated
Status: Covered
Evidence: CI run #1234, 18 passed
Residual risk: visual proof pending for mobile viewport
```

### Gated Test Strategy

Separate fast deterministic tests from expensive or environment-dependent tests.

Recommended modes:

- Default local gate: fast unit, contract, API, and component tests.
- Pre-merge gate: default gate plus integration and targeted E2E tests.
- Release gate: full deterministic suite plus live service, UI, performance, security, migration, and resilience tests.
- Emergency fix gate: targeted failing test, adjacent regression tests, and risk-specific smoke tests.

Use environment flags or CI labels for expensive suites:

```text
RUN_LIVE_TESTS=1
RUN_UI_TESTS=1
RUN_PERFORMANCE_TESTS=1
RUN_SECURITY_TESTS=1
```

Default collection may skip gated tests, but skipped tests must be documented so the team knows what was not run.

### Test-First Bug Fixing

For every material bug:

1. Reproduce the issue.
2. State the right behavior.
3. Write or identify a failing proof.
4. Fix the root cause.
5. Run the failing proof again.
6. Run adjacent regression tests.
7. Add a coverage tracker note if the bug revealed a coverage gap.

If automation is not immediately possible, capture a manual, visual, log-based, or data-based proof and add an automation follow-up.

### User Manual Driven Coverage

The user manual should be treated as a test source.

For every user-facing module, workspace, screen, command, or flow, the manual should describe:

- Purpose.
- When to use it.
- Main controls.
- Step-by-step usage.
- Expected outcome.
- Error, empty, loading, offline, or partial-data behavior.
- Related flows.

The V&V system should map those flows to executable owners.

If the manual says "users can export a report", coverage should prove:

- Export can be started.
- Progress or polling behaves correctly.
- Download is authorized.
- Artifact is non-empty and well-formed.
- Failure state is clear.
- Audit evidence exists if required.

### API and Contract Coverage

For API-driven products, generate or maintain an API coverage matrix from the current API specification.

Each operation should have:

- Direct owner test.
- Positive-path coverage.
- Negative-path coverage.
- Auth/RBAC coverage where applicable.
- Tenant/account/project isolation coverage where applicable.
- Audit or event coverage for important mutations.
- Idempotency or retry coverage for unsafe operations.
- Performance or rate-limit coverage for critical operations.

Do not equate "endpoint appears in an E2E test" with complete API coverage. E2E tests prove journeys; contract tests prove API behavior.

### UI and Journey Coverage

For UI-heavy products, maintain a screen and navigation inventory.

Each important screen should have coverage for:

- Entry route or navigation path.
- Primary action.
- Secondary or recovery action.
- Empty state.
- Loading state.
- Error state.
- Permissions or restricted view.
- Responsive layout.
- Keyboard and focus flow.
- Theme or visual mode if supported.

For complex workflows, prefer journey tests that tell a story:

```text
Create item -> Validate item -> Submit item -> Approve item -> View result -> Export evidence
```

### Production Hardening Coverage

Before release, add or confirm coverage for:

- Authentication and session expiry.
- Cache invalidation and asset refresh after deployment.
- Backend connection loss and recovery.
- Retry and timeout behavior.
- Duplicate submission and idempotency.
- Permission downgrade or restricted-user behavior.
- Data migration and rollback.
- Export/download integrity.
- Background job polling.
- Queue, scheduler, or worker recovery.
- Third-party integration outage.
- Observability alerts and operator diagnostics.

Production hardening tests should focus on what breaks trust in real usage, not only what breaks code.

### Evidence and Reporting

Every significant verification run should produce useful evidence:

- Command executed.
- Environment or mode.
- Pass/fail/skipped counts.
- JUnit or CI artifact.
- Coverage report where applicable.
- Screenshots or videos for visual tests.
- Logs or traces for backend and workflow tests.
- Known warnings and whether they are release-blocking.
- Residual risks and follow-up owners.

Keep reports in a predictable location such as `project_tests/reports/`.

### Coverage Progress Tracker

Maintain a living coverage tracker. Update it whenever:

- A feature is added.
- A bug reveals a coverage gap.
- A test suite is added, removed, skipped, or repaired.
- A live or release gate is run.
- Documentation changes user-facing behavior.
- A residual risk is accepted or closed.

The tracker should clearly separate:

- Done: implemented and verified.
- In Progress: active but not release-green.
- Gap: known missing proof.
- Blocked: cannot proceed without dependency or decision.
- Not Required: intentionally excluded with reason.
- Roadmap: valuable but outside current release scope.

### Release Readiness From V&V

A project is not release-ready because tests are numerous. It is release-ready when:

- Critical user journeys have executable proof.
- Critical APIs or contracts have direct owners.
- Security, RBAC, isolation, privacy, and audit risks have coverage.
- Known regressions have targeted tests.
- Live/environment-dependent suites are either green or explicitly risk-accepted.
- UI/UX critical paths are visually and functionally verified.
- Documentation, tracker, and test evidence agree with the current product.
- Residual risks are documented and acceptable for the release.

### Reusable Adoption Steps

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

This system should grow incrementally. Start small, but keep the structure honest from day one.

## Git and Repository Hygiene

Before committing:

- Check `git status`.
- Stage source, tests, docs, and intentional fixtures.
- Avoid staging generated reports, screenshots, caches, runtime databases, scratch files, backups, and temporary scripts unless explicitly required.
- Run `git diff --cached --check`.
- Use a clear commit message describing the outcome, not only the files changed.

Commit message style:

- Use imperative or outcome-focused language.
- Example: `Harden user lifecycle and build workspace journeys.`

After committing:

- Run `git log -1 --oneline`.
- Report what was committed.
- Report any remaining uncommitted files and why they were left out.

## Communication Standards

While working:

- Start with what you understood and the first step.
- Provide short progress updates during longer work.
- Explain findings in plain language.
- Do not make the user do inspection that can be done locally.
- Ask questions only when the answer is risky and cannot be inferred.

When finishing:

- Summarize the outcome.
- List verification performed.
- Call out unresolved risks honestly.
- Mention files only when useful.
- Keep the close-out concise.

## Issue Intake and Bug Fix Lifecycle

Use this section as the closure lifecycle for issues that need regression-risk review. It complements `Bugs & Issues Intake` and `Bug Fixing / Applying a Fix`; it should not duplicate implementation details unless a release-hardening review needs them.

When a concern is raised, analyze:

- What is the right behavior?
- What is the observed behavior?
- Is this a real bug, usage gap, missing UX guidance, or missing feature?
- What are the affected end-to-end paths, modules, and systems?

Capture for each issue:

- Right behavior in plain language.
- A clear list of identified bugs or gaps.
- A concrete fix plan with implementation steps.
- Change impact assessment and regression risks.
- The verification strategy required for the fix.

For every bug:

1. State the right behavior.
2. Identify the observed behavior.
3. Inspect the code path end to end. Analyze this, do code review and suggest potential root causes.
4. Define whether it is a real bug, usage gap, missing UX guidance, or missing feature.
5. Add reproduction or failing proof.
6. Implement the fix.
7. Run targeted and adjacent tests.
8. Re-audit if the risk is high.
9. Update tracker and documentation when user-facing behavior changes.

After implementation and tests are in place:

- Perform a regression-risk review before adding more code.
- Re-audit the lifecycle: issue intake, impact assessment, implementation, and verification.
- Treat the review as closure of the hardening slice, not just code completion.
- Confirm that TDD proof and validation are documented.
- Capture any residual risk in a tracker item or follow-up ticket.

## Release Readiness Checklist

A change is release-ready when:

- The right behavior is implemented.
- TDD proof exists for implemented features, enhancements, or fixes.
- Relevant regression tests pass.
- UI and UX are consistent with the platform.
- Security, RBAC, tenant, and audit implications were considered.
- No stop-the-line guardrail remains unresolved.
- V&V evidence is complete, current, and mapped to the changed behavior according to `V_and_V_Process.md`.
- Documentation and tracker are current.
- Code review found no Critical or Important blockers.
- The git commit contains only source, test, and doc changes without unrelated generated clutter.

## Parallel Work and External Review

Use parallel reviewers, subagents, or automation only when the environment and process allow it.

Good uses:

- Independent codebase exploration.
- Regression-risk review.
- Large but separable implementation slices.
- Test expansion in a disjoint area.

Avoid:

- Delegating urgent blocking work that must be solved locally first.
- Asking multiple parties to edit the same files without clear ownership.
- Treating external or automated output as correct without integration review.

## Anti-Patterns to Avoid

- Fixing UI symptoms without checking backend data contracts.
- Adding hardcoded demo data where tenant-owned data is required.
- Marking tracker items Done without test or review proof.
- Shipping fake buttons or placeholder results.
- Trusting request headers over authenticated session context for tenant security.
- Letting generated artifacts hide meaningful source changes.
- Over-explaining simple UI labels.
- Leaving users without a clear recovery path after an error.

## Reusable Project Kickoff Template

At the start of a new project, create or confirm:

- Product goal and target users.
- Main user journeys.
- Architecture overview.
- Tracker file or board.
- Testing strategy.
- Documentation owner and structure.
- Git hygiene rules.
- Release readiness criteria.
- Known constraints, risks, and non-goals.

Then use this WoW process as the operating model for implementation, review, verification, and release hardening work.
