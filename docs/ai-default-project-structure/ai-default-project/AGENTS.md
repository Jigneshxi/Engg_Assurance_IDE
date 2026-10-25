# AI Agent Governance & Operation Rules

This document outlines the strict governance framework, rules of engagement, and permission boundaries for all AI agents acting as contributors to this codebase.

---

## 1. Principles of AI Engagement

*   **Untrusted Contributors**: All AI agents are categorized as untrusted. No agent code may bypass human review or CI/CD checkpoints.
*   **Deterministic Sandbox**: Agent execution (builds, tests, scratch scripts) should run within isolated environments (e.g., containers, virtual environments) with restricted network access, CPU, and memory usage.
*   **Accountability**: Every action taken by an agent must be fully auditable. Agents must document their decisions, tool executions, and rationale in clear change summaries.

---

## 2. Agent Roles & Access Matrix

| Role | Permitted Actions | Excluded Actions | Required Checks |
| :--- | :--- | :--- | :--- |
| **Architect Agent** | ADR generation, high-level design doc editing, refactoring planning | System modification, production deployment, deletion of resources | Security threat review, architecture review panel |
| **Developer Agent** | Feature implementation, bug fixing, unit test writing | CI config edits, secrets access, security rule overrides | Code style verification, linter/compiler strict check |
| **QA Agent** | Test case generation, performance suite execution, boundary check scripting | Production environment writing, main code generation | Accessibility check reports (axe-core), OWASP test results |
| **Security Agent** | Dependency scanner configuration, SAST reviews, threat modeling | Infrastructure modifications, secret rotation authorization | Dependency version verification (CVSS rating checks) |
| **SRE Agent** | Log query generation, dashboard configuration, runbook writing | Production database structure alterations, resource scale-down | SLO verification, error budget evaluation |

---

## 3. Human Approval Gateways

AI agents must halt execution and seek explicit human review and approval in the following scenarios:

1.  **Data Deletion**: Any script or code execution that deletes, truncates, or cleans databases, cloud storage buckets, or persistent filesystems.
2.  **Infrastructure as Code (IaC)**: Applying configurations that modify cloud IAM roles, security groups, routing tables, DNS, or Kubernetes cluster structures.
3.  **Secrets & Auth**: Generating, rotating, or modifying encryption keys, TLS/SSL certificates, database credentials, or third-party API configurations.
4.  **Production Releases**: Deploying code or configuration changes to production or staging environments.
5.  **Security Exclusions**: Adding lint ignores, eslint overrides, or disabling security/SAST scanning tasks.

---

## 4. Command Restriction Policy

### Forbidden Command Patterns
Agents are strictly prohibited from executing the following patterns (directly or through script wrapping) unless explicit, double-auth human overrides are active:
*   `rm -rf /` or similar destructive filesystem commands.
*   `terraform destroy` / `pulumi destroy`
*   `kubectl delete namespace` or manual pod/node destructions.
*   `drop database` / `truncate table` or equivalent database console drops.
*   `curl` / `wget` executions pulling and piping unverified binaries directly into the shell (e.g., `curl | sh`).

---

## 5. Cost and Efficiency Governance

*   **Token Allocation**: Limit contextual token bloat. Agents must use targeted search tools rather than reading massive files repeatedly.
*   **Execution Timeouts**: Any task, compilation, or test runner initiated by an agent must specify strict timeouts (maximum 10 minutes) to prevent run-away background compute costs.
*   **API Usage Control**: LLM API key use and query frequencies should be monitored, with daily usage budgets and rate limits enforced.
