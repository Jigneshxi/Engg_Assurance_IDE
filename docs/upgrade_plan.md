# Implementation Plan: Advanced Agentic Architecture for VVNT Test Planning

This document serves as the historical roadmap and upgrade plan that guided the transition of the **VVNT Test Planning Agent** to the persistent, multi-agent (A.N.T.), and RAG-capable system it is today.

## 1. Deployed Technology Stack (A.N.T Architecture)
- **Orchestration**: **CrewAI** (Multi-agent collaboration) & **LangGraph** (Stateful workflows / Directed Graphs).
- **Core Framework**: **LangChain** (Integrations & toolsets).
- **API Engine**: **FastAPI** (Retained and expanded for concurrent background processing).
- **Data Persistence**: **SQLite (WAL Mode)** via SQLAlchemy. (Chosen over PostgreSQL for highly-portable, lock-resistant local deployments).
- **Knowledge Retrieval**: **ChromaDB** with `all-MiniLM-L6-v2`. Embedded locally to ensure air-gapped security and eliminate third-party API costs.
- **Intelligence**: **Groq (Llama-3.3-70b-versatile)** utilized via a transparent OpenAI-proxy bridge for high-speed reasoning.

---

## 2. Layered Architecture Design (Implemented)

### **Layer 1: Frontend (Shadow-Glass React)**
*   **Achieved**: Reactive UI with dynamic background polling (`/api/v1/planning/task/status`).
*   **Achieved**: Live display of Agentic "reasoning streams" in a dedicated terminal-style output.

### **Layer 2: API Gateway (FastAPI)**
*   **Achieved**: Decoupled routing structure. Secure injection of Identity Vault credentials (ADO/Jira) directly into the processing pipeline, preventing cross-session leakage.
*   **Achieved**: Non-blocking endpoint (`/generate-test-plan`) bridging to a local threaded worker queue.

### **Layer 3: Agent Layer (CrewAI + LangGraph)**
*   **The Crew**: 
    1.  **Requirements Analyst**: Deconstructs raw input and identifies hidden functional edge cases.
    2.  **QA Architect**: Translates analysis into the B.L.A.S.T Framework and drafts Gherkin scenarios.
    3.  **Risk Auditor**: Maps failure domains to a quantitative Likelihood vs. Impact matrix.
*   **The Graph**: LangGraph manages state serialization between 'Fetch', 'Analyze', and 'Compose' nodes, enabling robust error capture and resumption states.

### **Layer 4: Processing Layer**
*   **Achieved**: Input normalization via `BeautifulSoup` to strip HTML/ADF from enterprise Jira variants.
*   **Achieved**: The "Bracket Injection" strategy, sanitizing ALM data to prevent LangChain template variable collisions.

### **Layer 5: Data Layer (RLHF Loop)**
*   **Achieved**: SQLite WAL limits lock contention.
*   **Achieved (RAG)**: ChromaDB serves as long-term memory. Generated test plans are auto-converted to markdown and indexed as "Golden Samples". Historical matches are injected directly into the Crew's reasoning context.

### **Layer 6: Universal Ingestion Integration**
*   **Achieved**: The `FetcherFactory` handles enterprise authentication variances globally (e.g., Jira Basic Auth via URL Discovery vs. ADO Base64 PAT Auth).

---

## 3. Retrospective: Execution Phases

### **Phase 1: Environment & Core Engine**
*   **Result**: Integrated LangChain and CrewAI safely within the Pydantic v2 execution context. Established the foundational SQLite schema.

### **Phase 2: Multi-Agent Development**
*   **Result**: The `TestPlanningCrew` was finalized, moving from brittle regex-based parsing to robust, rigid JSON-schema execution forcing by the AI.

### **Phase 3: Data & RAG**
*   **Result**: Implemented local ChromaDB embeddings. The agent now learns from generated artifacts without needing OpenAI vectorization.

### **Phase 4: Frontend & Live Feedback**
*   **Result**: Polling architecture implemented to bypass WebSocket complexity, ensuring robust enterprise network compatibility. 

---

## 4. Stability & Regression Enforcement
- **Registry Pattern**: Kept the `FetcherFactory` decoupled, allowing future connectors (e.g., GitHub, Doors, Jama) to be added without touching the CrewAI layer.
- **Fail-Fast Error Boundaries**: Graph execution halts precisely at the faulty node, returning specific, human-readable UI error states rather than silent failures.
- **UI Vaulting**: API keys are securely vaulted in browser memory and passed statelessly to operations, preventing local storage poisoning.

---
**Status**: UPGRADE COMPLETE  
**Architecture**: Enterprise Multi-Agent Distributed System (A.N.T Framework)

