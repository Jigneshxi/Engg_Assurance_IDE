#  SRE & Reliability Issues

---

1) Missing Flakiness Threshold

* **Agent:** Reliability (#44)

* **Expected:**
  The system should define a clear flakiness threshold, for example:

  ```text
  failure_rate > 5% over last 20 runs
  ```

* **Actual:**
  No threshold definition is provided. The system identifies instability but does not quantify it.

* **Impact:**

  * Cannot classify tests as flaky vs stable
  * No standard decision boundary for quarantine

---

2) Missing Quarantine Details

* **Agent:** Reliability (#44)

* **Expected:**
  When a test is marked unstable, structured details should be provided:

  * `failure_rate`
  * `pattern` (root cause or failure trend)
  * `action` (e.g., `quarantine_auto`)

* **Actual:**
  Only a generic label such as “test marked as unstable” is shown.

* **Impact:**

  * No actionable insight
  * Cannot automate quarantine decisions

---

3) Missing CI Gate Impact

* **Agent:** Reliability (#44)

* **Expected:**
  System should explicitly state CI/CD impact, for example:

  ```text
  "3 tests removed from blocking CI gate due to instability"
  ```

* **Actual:**
  Only the number of quarantined tests is displayed.

* **Impact:**

  * CI pipeline impact is unclear
  * Release decisions are harder to interpret

---

4) Missing SLO Metrics

* **Agent:** SLO (#40)

* **Expected:**
  SLO evaluation should include:

  * `burn_rate`
  * `error_budget_remaining`
  * `projected_exhaustion`

* **Actual:**
  Only basic metrics and recommendations are provided.

* **Impact:**

  * No reliability forecasting
  * Cannot predict SLA/SLO breaches

---

5) Test Case Mismatch (Critical)

* **Agent:** Reliability (#44)

* **Expected:**
  System should use actual project-specific test cases:

  ```text
  Swag Labs → TC_001 to TC_008
  ```

* **Actual:**
  Generic test cases are used:

  ```text
  TC-001 to TC-006
  ```

* **Impact:**

  * Output not aligned with real system
  * Reduces trust in analysis

---

#  Performance & Chaos Issues

---

6) No Real Performance Metrics or Insights Generated

* **Expected:**
  System should provide:

  * Real latency (p95/p99)
  * Throughput values
  * Error rate
  * Bottleneck detection
  * Actionable recommendations

* **Actual:**

  * Metrics are static or unrealistic
  * No real bottleneck detection
  * Recommendations are generic

* **Impact:**

  * Performance analysis is not reliable
  * System operates in simulation mode

---

#  Planning Agent Issue

---

7) Metrics Included in Planning Output (Incorrect)

* **Agent:** Planning Agent

* **Expected:**
  Planning stage should include:

  * test strategy
  * scope
  * approach

  ❗ Metrics should NOT be included at this stage.

* **Actual:**
  Planning output includes performance/reliability metrics.

* **Impact:**

  * Blurs responsibility between agents
  * Breaks proper pipeline separation


8) Planning Agent Producing Generic/Template-Based Test Plan

* Actual Result:
  Output contains generic test scenarios such as:
  identifier generation
  identifier display
  which are not derived from the provided requirement.

* Expected Result:
  Test plan should be context-aware and derived from acceptance criteria, such as:
  "search flights
  validate passenger details
  booking confirmation
  payment success/failure"

---

#  Mesh / Agent Orchestration Issue

---

9) Agent Control Not Working (Critical)

* **Module:** Mesh / Orchestrator

* **Expected:**
  When disabling agents (e.g., 16 out of 17 crews):

  * Only the active agent should execute
  * Disabled agents should not run

* **Actual:**
  Even after disabling agents:

  * All agents still execute
  * No respect for configuration

* **Impact:**

  * No control over execution flow
  * Debugging becomes difficult
  * Violates modular architecture


# Vault & AI (system care)

----

10) Environment Vault Configuration Succeeds Without Credential Validation

* Actual Result:
  System shows “configured successfully” for environment vaults even when incorrect or invalid credentials are provided. No validation is performed during connection.

* Expected Result:
  System should validate the provided instance URL and credentials during configuration. If credentials are invalid or access is denied, configuration should fail with an appropriate error message.


11) Requirement Synthesis Generates Generic Output Instead of Source-Based Results (Media OCR, Network path, Swagger/openAPI)
 
* Actual Result:
  System generates generic and unrelated requirements that do not match the actual content from the provided source (e.g., image, document, or other input).

* Expected Result:
  System should dynamically generate requirements based on the actual content extracted from the selected source and reflect accurate, context-specific output.
 
12) Selected Environment Not Supported – Platform Not Indexed (Github issues, Video insights, Gitlab)
 
* Actual Result:
  When selecting certain environments and providing a valid reference, the system throws an error indicating the platform is not indexed and fails to process the request.

* Expected Result:
  System should support the selected environment and successfully process the input to generate relevant insights (e.g., extracted data, transcript, or requirements) based on the source.

----

# Requirement ops

----

13) Requirement Ops Stuck in Synchronizing State After Mesh Execution

* Actual Result:
  After completing a run, when the user tries to run again, the system shows “Synchronizing Intelligence Mesh” and remains stuck. The user is unable to proceed unless a hard reset is performed.

* Expected Result:
  After a run is completed, the system should allow the user to start a new run without showing the loading/synchronizing state and without requiring a hard reset.

----

# Semantic knowledge

---

14) Unable to Delete RAG Memory from Active Manifest

* Actual Result:
  When attempting to delete items from the Active RAG Manifest, the delete action does not work and the selected memory remains in the list.

* Expected Result:
  User should be able to delete selected RAG memory items successfully, and the item should be removed from the Active Manifest immediately.


15) RAG Retrieval Not Returning Relevant Results

* Actual Result:
  Querying the Recall Discovery Playground shows “No conceptual matches found” or low similarity irrelevant results, even when relevant data exists in uploaded files.

* Expected Result:
  System should retrieve relevant chunks from uploaded documents with high similarity scores and return context-aware results based on stored knowledge.


16) RAG Returning Synthetic/Refinement Data Instead of Actual Content

* Actual Result:
  System returns “refinement” or “synthesis sample” results instead of actual content from uploaded documents.

* Expected Result:
  System should return real retrieved content from vectorized files instead of fallback or synthetic responses.

----

# Strategic Architect agent

----

17) Strategic Architect Agent Not Fully Utilizing Input Requirement

* Actual Result:
  The generated blueprint does not fully reflect all details from the provided requirement, such as specific acceptance criteria, edge cases, or non-functional requirements.

* Expected Result:
  The blueprint should comprehensively map all input requirement details, including:
  all acceptance criteria
  all edge cases
  all NFR constraints (e.g., response time, concurrency)
  ensuring complete requirement coverage.