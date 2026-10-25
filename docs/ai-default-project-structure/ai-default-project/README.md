# Enterprise Repository Reference Foundation

This repository provides an enterprise-grade reference layout governed by industry-standard engineering, security, compliance, and AI operation policies. It serves as a master template for starting production-ready greenfield projects.

---

## 1. Directory Structure

Below is the directory schema defining the strict boundary of configurations, business domains, test divisions, and operational configurations:

```text
/
├── .github/
│   ├── workflows/                  # CI/CD pipelines (GitHub Actions)
│   ├── ISSUE_TEMPLATE/             # Standardized bug/feature issue guides
│   ├── PULL_REQUEST_TEMPLATE.md    # Automated quality check template on PRs
│   └── CODEOWNERS                  # Directory reviews mapping to domain groups
│
├── docs/
│   ├── architecture/               # High-level architecture explanations
│   ├── decisions/                  # Architectural Decision Records (ADRs)
│   ├── runbooks/                   # Incident management guides for metrics alerts
│   ├── api/                        # API routes, contracts, and payloads
│   ├── security/                   # Threat mitigation profiles
│   ├── compliance/                 # Regulatory audits (SOC2, GDPR, HIPAA)
│   └── onboarding/                 # Developer environment setup instructions
│
├── apps/                           # User-facing applications and microservices
│   ├── web/                        # Frontend UI
│   ├── api/                        # Backend core API
│   └── ai-worker/                  # Dedicated asynchronous AI service
│
├── packages/                       # Shared libraries and configurations
│   ├── database/                   # Database schemas and migrations
│   └── ui/                         # Shared UI component library
│
├── vvnt/                           # Unified testing and validation directory
│   ├── tests/                      # Core test suites
│   │   ├── unit/                   # Isolated domain calculations
│   │   ├── integration/            # Persistence & API connection integration
│   │   ├── e2e/                    # Playwright/Cypress end-to-end flows
│   │   ├── performance/            # k6/JMeter performance checks
│   │   ├── accessibility/          # axe-core WCAG verification
│   │   ├── security/               # DAST validation tasks
│   │   └── contract/               # Pact API contract verification
│   ├── test-data/                  # Mocks and fixtures for integration suites
│   └── test-reports/               # CI/CD generated reports and coverage outputs
│
├── config/                         # Static env properties and service variables
│
├── infrastructure/
│   ├── terraform/                  # Cloud resources as Code (IaC)
│   ├── kubernetes/                 # K8s manifest files and helm charts
│   ├── monitoring/                 # Prometheus rules & Grafana dashboards
│   └── networking/                 # VPC, Security Groups, and CDN routing
│
├── scripts/                        # Utility & operational automation scripts
├── tools/                          # Internal developer tools
│
├── RULES.md                        # Master engineering constitution
├── AGENTS.md                       # AI Agent governance controls
├── CLAUDE.md                       # Specific LLM Assistant instructions
├── SECURITY.md                     # Vulnerability triage & PGP disclosure policy
├── TESTING.md                      # Quality standards & test tool guidelines
├── OBSERVABILITY.md                # Telemetry formatting & SLO target matrices
├── ARCHITECTURE.md                 # System overview and technology diagram
├── CONTRIBUTING.md                 # Pull Request flow and Conventional Commits
├── DATA-GOVERNANCE.md              # GDPR/CCPA PII handling regulations
├── THREAT-MODEL.md                 # STRIDE matrix & trust boundary layout
├── RELEASE-MANAGEMENT.md           # Production gate checks & GitOps sync policies
├── .env.example                    # Clean env configuration templates
└── README.md                       # This reference file
```

---

## 2. Core Governance Documents

All contributors (engineers, managers, and AI subagents) must align with the policies detailed inside these root-level constitutions:

1.  **Constitutional Baseline**:
    *   [RULES.md](./RULES.md): Priority guidelines (Security > Compliance > Reliability), language conventions (strict TypeScript, Python snake_case), and coding rules.
    *   [AGENTS.md](./AGENTS.md): Strict roles, sandbox environments, forbidden command limits, and manual human approval gateways for AI agents.
    *   [CLAUDE.md](./CLAUDE.md): Direct execution constraints for compiler strict checks.

2.  **QA & Telemetry**:
    *   [TESTING.md](./TESTING.md): Standards for the testing layers, AAA formatting, local shell targets, and code coverage requirements.
    *   [OBSERVABILITY.md](./OBSERVABILITY.md): Logging schemas (structured JSON), Prometheus metrics, OpenTelemetry tracers, and SLO-based alert thresholds.

3.  **Security & Regulatory Compliance**:
    *   [SECURITY.md](./SECURITY.md): PGP key disclosure instructions, SLA triage windows, and safe harbor declarations.
    *   [THREAT-MODEL.md](./THREAT-MODEL.md): STRIDE matrix targets, VPC boundaries, and data flow modeling gates.
    *   [DATA-GOVERNANCE.md](./DATA-GOVERNANCE.md): Classification hierarchies, automated data scrubbers, and GDPR cascading deletion hooks.

4.  **Operations & Release Integration**:
    *   [RELEASE-MANAGEMENT.md](./RELEASE-MANAGEMENT.md): Risk classification levels, progressive canary routing configuration, rollback validation policies, and GitOps sync templates.
    *   [CONTRIBUTING.md](./CONTRIBUTING.md): Git branch strategies, review constraints, and Conventional Commit messaging style.
