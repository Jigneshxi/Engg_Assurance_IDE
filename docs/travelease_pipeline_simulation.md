# TravelEase PRD: Full Pipeline Agent Simulation

This document represents the deep execution trace of the A.N.T. Agentic Mesh evaluating the **TravelEase PRD**. It validates exactly what each specialized agent produces across all four Pillars of the pipeline based on the system's actual code architecture.

---

## 🏛️ PHASE 1: Command Mesh (Governance & Clarification)

### 1. Ingestor Agent (`ingestor_node`)
**Role**: Deconstruct unstructured PRD into a deterministic capabilities graph.
**Actual Output Payload**:
```json
{
  "project_name": "TravelEase",
  "capabilities": [
    {
      "id": "CAP-01",
      "name": "Authentication Module",
      "features": ["User registration", "Login (email/password)", "Password reset", "Session management"],
      "workflows": ["Email validation", "Duplicate email handling", "Account lock after 5 failed attempts"],
      "source_excerpt": "Section 4. Authentication Module..."
    },
    {
      "id": "CAP-02",
      "name": "Search Module (Flights & Hotels)",
      "features": ["Flight Route & Date Input", "Hotel Destination Input", "Class/Passenger selection"],
      "workflows": ["Auto-suggestions for cities", "Date validation (no past dates)", "Return date > departure date"],
      "source_excerpt": "Section 5. Search Module..."
    },
    {
      "id": "CAP-03",
      "name": "Booking Module",
      "features": ["Flight Booking Flow", "Hotel Booking Flow", "Seat selection", "Room type selection"],
      "workflows": ["Passenger detail validation", "ID format matching", "Max passengers limit enforcement"],
      "source_excerpt": "Section 6. Booking Module..."
    },
    {
      "id": "CAP-04",
      "name": "Payment Module",
      "features": ["Credit/Debit cards", "UPI", "Net banking"],
      "workflows": ["Transaction status handling (Success/Failure/Pending)", "Timeout handling", "Invalid card handling"],
      "source_excerpt": "Section 7. Payment Module..."
    },
    {
      "id": "CAP-05",
      "name": "Itinerary & Notification System",
      "features": ["View/Cancel bookings", "Download invoice", "Email/SMS/Push notifications"],
      "workflows": ["Cancellation deadline validation", "Refund rule application"],
      "source_excerpt": "Section 8 & 9..."
    }
  ]
}
```

### 2. Clarifier Agent (`clarifier_node`)
**Role**: Execute mandatory gap analysis (`error_state`, `data_model`, `nfr`, `conflict`) on the Ingestor's output.
**Actual Output Payload**:
```json
{
  "open_questions": [
    {
      "id": "GAP-001",
      "category": "error_state",
      "context": "CAP-04 (Payment)",
      "question": "Section 10 lists 'Payment success but booking failure' as an edge case. Does the system immediately issue an automated refund, or place the booking in a manual reconciliation queue?"
    },
    {
      "id": "GAP-002",
      "category": "data_model",
      "context": "CAP-05 (Itinerary)",
      "question": "Section 8 mentions 'Refund rules apply' for cancellations. What is the mathematical data model for this? (e.g., 100% refund > 48h, 50% > 24h, 0% < 24h?)"
    },
    {
      "id": "GAP-003",
      "category": "conflict",
      "context": "CAP-03 (Booking)",
      "question": "Section 10 mentions 'Price change during checkout'. If the user's session has a locked seat/room, for how many minutes is the original price guaranteed before the lock expires?"
    },
    {
      "id": "GAP-004",
      "category": "nfr",
      "context": "System Wide",
      "question": "Section 11 specifies 'Search response < 2 seconds'. Is this at the 95th or 99th percentile? Does this include network latency or just backend processing time?"
    }
  ]
}
```
> [!IMPORTANT]
> The pipeline halts here (HITL-1). It does not proceed to Risk Assessment until the human user resolves these gaps.

### 3. Risk Assessment Array (Parallel Fan-Out)
*(Assuming gaps are resolved)*
**Role**: Generate binding, non-negotiable constraints that will govern all downstream code.

**Security Intel Agent (`security_intel_node`) Output**:
```json
{
  "agent": "Security",
  "risk_tier": "HIGH",
  "advisories": [
    {"id": "SEC-01", "constraint": "Implement AES-256 encryption for stored user PII and tokenized processing for Credit Cards. No PAN data can touch the application database.", "severity": "BLOCKING"},
    {"id": "SEC-02", "constraint": "Login endpoint must implement explicit rate limiting to support the 'Lock after 5 failed attempts' requirement to prevent credential stuffing.", "severity": "BLOCKING"}
  ]
}
```

**Governance Agent (`governance_node`) Output**:
```json
{
  "agent": "Compliance",
  "data_classification": "RESTRICTED",
  "advisories": [
    {"id": "GOV-01", "constraint": "System processes payments and must adhere strictly to PCI-DSS Level 1 compliance architecture (Section 11).", "severity": "BLOCKING"}
  ]
}
```

**Accessibility Intel Agent (`accessibility_intel_node`) Output**:
```json
{
  "agent": "Accessibility",
  "advisories": [
    {"id": "A11Y-01", "constraint": "Flight/Hotel date pickers and Seat Selection grids must support full keyboard navigation and ARIA live regions per WCAG 2.1 (Section 11).", "severity": "BLOCKING"}
  ]
}
```

---

## 🏭 PHASE 2: Artifact Factory (Spec & TDD Generation)

### 4. Architect Agent (`architect_node`)
**Role**: Generate the technical blueprints constrained by Phase 1's advisories.
**Actual Output Payload**:
```json
{
  "api_design_spec": {
    "openapi": "3.0.0",
    "paths": {
      "/api/v1/auth/login": {"post": {"responses": {"429": {"description": "Account locked (SEC-02)"}}}},
      "/api/v1/flights/search": {
        "get": {
          "parameters": ["origin", "destination", "departure_date", "passengers", "class"],
          "responses": {"200": {"description": "Must return in < 2 seconds (NFR)"}}
        }
      },
      "/api/v1/payments/process": {"post": {"description": "PCI-DSS compliant tokenized payment capture (GOV-01)"}}
    }
  },
  "db_schema_design": {
    "type": "sql_ddl",
    "content": "CREATE TABLE users (id UUID, email VARCHAR UNIQUE, password_hash VARCHAR, failed_attempts INT DEFAULT 0); CREATE TABLE bookings (id UUID, user_id UUID, status VARCHAR, locked_price DECIMAL, price_lock_expiry TIMESTAMP);"
  }
}
```

### 5. Engineering Contract Agent (`engineering_contract_node`)
**Role**: Break the blueprint down into Task IDs.
**Actual Output Payload**:
```json
{
  "tasks": [
    {
      "task_id": "TSK-AUTH-01",
      "title": "Implement Registration & Login with Rate Limiting",
      "acceptance_criteria": [
        "Email validation passes regex",
        "Duplicate email returns 409",
        "Password hashed via Argon2/Bcrypt",
        "Account locks on 6th attempt (HTTP 429)"
      ]
    },
    {
      "task_id": "TSK-FLIGHT-01",
      "title": "Implement Flight Search & Validation",
      "acceptance_criteria": [
        "Past dates return 400 Bad Request",
        "Return date strictly > departure date",
        "Response time strictly < 2000ms"
      ]
    }
  ]
}
```

### 6. Test Case Factory (`tdd_forge_node`)
**Role**: Generate the execution-ready TDD contract.
**Actual Output Payload (Saved to disk)**:
```python
# test_auth.py
def test_account_lockout_after_5_failures(client):
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "test@test.com", "password": "wrong"})
    response = client.post("/api/v1/auth/login", json={"email": "test@test.com", "password": "wrong"})
    assert response.status_code == 429
    assert "locked" in response.json()["message"]

# test_flight_search.py
def test_flight_search_rejects_past_dates(client):
    past_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    response = client.get(f"/api/v1/flights/search?origin=JFK&destination=LAX&departure_date={past_date}")
    assert response.status_code == 400
    assert "past dates" in response.json()["detail"].lower()
```

---

## ⚡ PHASE 3: Execution Array (The TDD Loop)

**Role**: Watch the local filesystem. Run tests automatically when Forge Agents write code.

**Simulation Stream**:
1. *Backend Forge Agent writes `auth_service.py` and saves.*
2. *Watchdog detects change. Triggers TSK-AUTH-01 tests.*
```text
[WATCHDOG] Change detected in src/auth/auth_service.py
[TDD RUNNER] Executing TSK-AUTH-01 test suite...
❌ test_account_lockout_after_5_failures [FAILED]
   Expected: 429
   Received: 401 Unauthorized
```
3. *Repairman Agent intercepts the failure.*
```json
{
  "suggestion": "Your auth_service.py line 45 returns a generic 401 Unauthorized for all failures. You are failing to increment the `failed_attempts` column in the database and returning 429 when the count reaches 5. Update the DB transaction."
}
```
4. *Backend Forge Agent applies fix and saves.*
```text
[WATCHDOG] Change detected in src/auth/auth_service.py
[TDD RUNNER] Executing TSK-AUTH-01 test suite...
✅ test_account_lockout_after_5_failures [PASSED]
✅ test_duplicate_email_registration [PASSED]
[GATE] TSK-AUTH-01 IS GREEN.
```

---

## 🛡️ PHASE 4: NFR & Guard Agents (Post-Code Audit)

*(Assuming Phase 3 achieves 100% GREEN tests, the pipeline enters Phase 4).*

### 7. Security Auditor Agent (`security_audit_node`)
**Role**: Verifies SEC-01 and SEC-02 were actually implemented in code.
**Simulation**: Scans `payment_service.py`. Finds a logger statement: `logger.info(f"Processing payment for card: {payload.card_number}")`.
**Output**:
```json
{
  "status": "RED",
  "audit_failures": [
    {
      "advisory_ref": "SEC-01",
      "file": "payment_service.py:L22",
      "violation": "PCI-DSS violation. Plaintext PAN data (card_number) is being logged to standard output. Strip this before logging."
    }
  ]
}
```

### 8. Performance Auditor Agent (`performance_audit_node`)
**Role**: Verifies NFRs.
**Simulation**: Analyzes `flight_search.py` DB queries.
**Output**:
```json
{
  "status": "RED",
  "audit_failures": [
    {
      "advisory_ref": "GAP-004 / NFR",
      "file": "flight_search.py:L45",
      "violation": "Querying flights table without an index on (origin, destination, departure_date). This will violate the < 2s response SLA under the 10k concurrent user requirement. Add a composite index."
    }
  ]
}
```

### 9. Accessibility Auditor Agent (`accessibility_audit_node`)
**Role**: Verifies A11Y-01 constraints.
**Simulation**: Analyzes `DatePicker.tsx`.
**Output**:
```json
{
  "status": "GREEN",
  "audit_passes": [
    "A11Y-01: Verified aria-labels and keyboard tabIndex support on DatePicker and SeatSelection components."
  ]
}
```

> [!CAUTION]
> **GATE FAILURE**: The Phase 4 Gate requires an absolute boolean `AND` across all agents. Because Security and Performance returned `RED`, the code **cannot** proceed to production/sign-off. The pipeline routes the remediation report back to the Forge agents to fix the logging and DB index issues.

Only once the Forge agents fix the code, Phase 3 tests pass again, and the Phase 4 auditors return `GREEN` across the board, will the system finally generate the **Cryptographic V&V Passport**.
