# Architecture & Design Blueprint

This document details the high-level system architecture, design patterns, technology stack, and component interactions for this repository.

---

## 1. Architectural Strategy

We follow **Clean Architecture** combined with **Domain-Driven Design (DDD)**. This isolates the core enterprise business rules from external technologies, frameworks, persistence mechanisms, and interfaces.

```mermaid
graph TD
    subgraph Drivers & Adapters (External)
        API[API Endpoints / HTTP]
        CLI[Command Line Interface]
        DB[Database / Persistence]
        Queues[Message Broker / Event Bus]
    end

    subgraph Interface Adapters (Gateways)
        Controllers[Controllers / Presenters]
        Repos[Repositories]
    end

    subgraph Application Core (Internal)
        UseCases[Use Cases / Interactors]
        Domain[Domain Entities / Value Objects]
    end

    API --> Controllers
    CLI --> Controllers
    Controllers --> UseCases
    UseCases --> Domain
    Repos --> DB
    UseCases --> Repos
```

### Key Rules of Clean Architecture
1.  **Dependency Rule**: Code dependencies must only point inwards. The core business logic (`Domain`) has no awareness of web servers, SQL, ORMs, or third-party SDKs.
2.  **Domain Isolation**: All business rules, validations, and domain events live in `src/domain/`.
3.  **Data Contracts (Ports)**: Interfaces defining how the application loads or sends data (e.g., repository interfaces) are declared in the application core. The concrete adapters in the infrastructure layer implement these interfaces.

---

## 2. Core Technology Stack

*   **Application Services**:
    *   Node.js (v20+ LTS) / TypeScript (Strict Mode)
    *   Python (v3.11+) for data engineering and LLM integrations.
*   **API Protocols**:
    *   REST APIs: Standardized using OpenAPI 3.0 specification.
    *   gRPC: Enforced for high-throughput, low-latency microservice communications.
*   **Datastores**:
    *   Primary: PostgreSQL (relational transactions, ACID compliance).
    *   Cache / Queue: Redis (session data, caching, rate limiting).
*   **AI & LLM Integration**:
    *   Outbound AI Orchestration: LangChain / native OpenTelemetry-instrumented SDKs.
    *   Vector Search: pgvector / Qdrant.

---

## 3. Architectural Decision Records (ADR) Workflow

Every significant change to architecture, design patterns, or major dependencies must document its rationale in an Architectural Decision Record (ADR).

*   **Storage Location**: `docs/decisions/`
*   **File Format**: Standard Markdown with prefix numbering: `docs/decisions/0001-use-postgresql-for-relational-data.md`
*   **ADR Template Structure**:
    1.  **Title**: Short descriptive title.
    2.  **Status**: Proposed / Accepted / Rejected / Superseded.
    3.  **Context**: The problem statement, constraints, and alternatives considered.
    4.  **Decision**: The selected solution and why it was chosen.
    5.  **Consequences**: The trade-offs, additional costs, or changes in system design.

---

## 4. AI & LLM Integration Patterns

*   **Prompts as Code**: Prompts must be treated as critical configuration. They must be versioned, localized in specific configuration files or databases, and never scattered as hardcoded strings inside business logic.
*   **LLM Fallbacks**: Because AI services can be highly volatile, every outbound LLM call must be wrapped in a resilience pattern. This must include rate-limit handling, explicit timeouts, and a fallback strategy to route requests to a secondary model if the primary fails.
