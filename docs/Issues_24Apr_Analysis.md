# Issues_list_24Apr.md — Analysis & Classification

> Analysis Date: 2026-04-24
> Total Issues: 16 | Real Problems: 4 | Not Issues: 10 | Partially Valid: 2

---

## Classification Summary

| ID | Issue | Verdict | Reason |
|----|-------|---------|--------|
| 1 | Creator Agent Template Output | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 2 | Test Data Builder Generic Data | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 3 | API Validation Domain-Irrelevant | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 4 | API Mock Not Context-Aware | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 5 | GraphQL Not Aligned with Schema | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 6 | Automation Forge Not Aligned | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 7 | API Coder Irrelevant Test Cases | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 8 | Scaffold Not Reflecting Framework | ⚠️ Partially Valid | Fallback uses generic Playwright — LLM path is correct |
| 9 | Missing Integration Forge↔Coder | ❌ Not a Real Issue | By design — separate nodes, synthesis merges them |
| 10 | Cross Browser Not Based on Execution | ❌ Not a Real Issue | By design — planning tool, not execution engine |
| 11 | Cross Browser Not Aligned with Context | ❌ Not a Real Issue | LLM output quality — prompt uses UCC context correctly |
| 12 | Visual Testing Thresholds Static | ⚠️ Partially Valid | LLM generates dynamic thresholds — UI shows static demo data |
| 13 | Configure New Page Button Not Working | ✅ Real Issue | Button has no onClick handler — dead UI element |
| 14 | Review History Button Not Working | ✅ Real Issue | Button has no onClick handler — dead UI element |
| 15 | Zephyr Integration Failing | ✅ Real Issue | Endpoint URL may be wrong or auth handling incomplete |
| 16 | Media OCR/Network Path Not Retrieving Data | ✅ Real Issue | Fetchers exist but may have bugs or missing dependencies |

---

## Detailed Analysis

### Issues 1-7, 11 — LLM Output Quality (Not Code Bugs)

**Verdict:** ❌ Not Real Issues

**Analysis:** All these nodes (`test_case_creator_node`, `test_data_builder_node`, `api_mock_agent_node`, `api_automation_generator_node`, `automation_forge_node`, `graphql_validation_node`, `cross_browser_compatibility_node`) have prompts that explicitly pass the UCC (Unified Context Contract) — the actual requirement description — as context.

**Code Evidence:**
```python
# test_case_creator_node
ucc_desc = state['combined_data'].get('description', '')
prompt = f"""
REQUIREMENT CONTEXT (UCC):
{ucc_desc}
"""

# test_data_builder_node
ucc_desc = state['combined_data'].get('description', '')
prompt = f"""
REQUIREMENT CONTEXT (UCC):
{ucc_desc}
"""

# api_mock_agent_node
ucc_desc = state['combined_data'].get('description', '')
prompt = f"""
UNIFIED CONTEXT CONTRACT (UCC):
{ucc_desc}
"""
```

**Root Cause:** LLMs sometimes produce generic output when:
- The UCC itself is vague or generic (garbage in, garbage out)
- The LLM is under rate-limit pressure and falls back to a smaller economy-tier model
- The prompt is too long and the LLM under-utilizes the context

**Not a Code Fix:** These are LLM output quality issues, not missing context in the prompts. The prompts already pass the full requirement context. Improving output quality requires:
- Better prompt engineering (more explicit instructions)
- Higher-quality models (strategic tier instead of economy)
- Post-generation validation that checks for domain-specific keywords

---

### Issue 8 — Scaffold Not Reflecting Framework Selection

**Verdict:** ⚠️ Partially Valid

**Analysis:** The `automation_forge_node` prompt asks the LLM to select a framework based on the tooling strategy. The LLM path works correctly. However, the **fallback** (when LLM fails) hardcodes a Playwright scaffold:

```python
fallback_scaffold = {
    "framework": "Playwright (TypeScript)",
    "folder_hierarchy": ["tests/", "tests/pages/", "tests/utils/", "tests/fixtures/"],
    ...
}
```

**Real Issue:** Fallback doesn't respect framework selection.

**Fix:** The fallback should check `state.get("analysis_payload", {}).get("test_strategy_recommendations", {}).get("ui")` to infer the framework (e.g., if it mentions "Cypress", use Cypress scaffold).

**Priority:** Low — only affects the fallback path when LLM fails.

---

### Issue 9 — Missing Integration Between Forge and Coder

**Verdict:** ❌ Not a Real Issue

**Analysis:** By design, `automation_forge_node` (Agent #10) and `api_automation_generator_node` (Agent #11) are separate specialist nodes. The `synthesis_optimizer_node` (Agent #5) and `synthesis_final` merge their outputs into a coherent package. This is the correct architecture — separation of concerns.

**Not a Code Fix:** This is working as intended.

---

### Issue 10 — Cross Browser Not Based on Actual Execution

**Verdict:** ❌ Not a Real Issue

**Analysis:** This is a **test planning tool**, not a test execution engine. The cross-browser node generates a **test plan** (which browsers to test, what scenarios, what divergence points to watch for). It doesn't execute tests. The output is correctly labeled as a plan, not execution results.

**Not a Code Fix:** This is working as intended. If the user wants real execution results, they need to integrate with an actual test runner (Playwright, Selenium Grid, BrowserStack).

---

### Issue 12 — Visual Testing Thresholds Static

**Verdict:** ⚠️ Partially Valid

**Analysis:** The `visual_intel_node` prompt asks the LLM to generate dynamic thresholds based on component criticality. The LLM path works correctly. However, the **demo mode data** in `SimulationEngine.ts` has hardcoded thresholds (`"0.05%"`, `"0.2%"`, `"0.1%"`). When demo mode is on, users see static data.

**Real Issue:** Demo mode data is static (by design for demos), but users may think it's real data.

**Fix:** Already addressed — the "Simulation Active" badge shows when demo mode is on. No code fix needed.

---

### Issue 13 — Configure New Page Button Not Working

**Verdict:** ✅ Real Issue

**Analysis:** `VisualWorkspace.tsx` line 72:
```tsx
<button className="vis-add-btn">Configure New Page</button>
```
No `onClick` handler — dead button.

**Fix:** Add `onClick={() => { /* open modal or navigate to config */ }}` and implement the configuration UI.

---

### Issue 14 — Review History Button Not Working

**Verdict:** ✅ Real Issue

**Analysis:** `VisualWorkspace.tsx` line 95:
```tsx
<button className="vis-card-btn">Review History</button>
```
No `onClick` handler — dead button.

**Fix:** Add `onClick={() => { /* open history modal */ }}` and implement the history viewer.

---

### Issue 15 — Zephyr Integration Failing

**Verdict:** ✅ Real Issue

**Analysis:** `zephyr_fetcher.py` uses:
```python
fetch_url = f"https://api.zephyrscale.smartbear.com/v2/testcases/{resource_id}"
```

This is the correct Zephyr Scale Cloud API endpoint. However, the error "Endpoint unreachable" suggests:
1. The token is invalid or expired
2. The `resource_id` format is wrong (Zephyr uses project keys like `PROJ-T123`, not just `123`)
3. Network/firewall issue

**Fix:** Add better error handling and logging to distinguish:
- Invalid token (401)
- Wrong resource ID format (404)
- Network timeout (connection error)

Also add a validation step in `integrations.py` that tests the Zephyr connection with a `/projects` list call before saving.

---

### Issue 16 — Media OCR/Network Path Not Retrieving Data

**Verdict:** ✅ Real Issue

**Analysis:** The fetchers were implemented in ISS-011 fix:
- `ImageOCRFetcher` — uses pytesseract or Groq Vision API
- `VideoTranscriptFetcher` — uses Groq Whisper or local whisper
- `NetworkPathFetcher` — crawls URLs, parses Swagger, reads local files

However, they may have bugs or missing dependencies. The error "returns dummy/generic/static data" suggests:
1. Dependencies not installed (`pytesseract`, `yt-dlp`, `beautifulsoup4`)
2. Groq API key not configured
3. The fetcher is hitting an exception and returning the error payload (which looks like "dummy data")

**Fix:** Add dependency checks and clearer error messages. Also add a test script to verify each fetcher works end-to-end.

---

## Implementation Plan

### Priority 1 — Fix Dead UI Buttons (Issues 13, 14)

**Effort:** Low | **Impact:** High (UX)

**Files:** `frontend/src/components/workspaces/VisualWorkspace.tsx`

**Tasks:**
1. Add `onClick` handler to "Configure New Page" button
2. Create a modal/form for page configuration (URL, snapshot name, threshold, viewport)
3. Add `onClick` handler to "Review History" button
4. Create a modal that shows snapshot history with visual diffs

---

### Priority 2 — Fix Zephyr Integration (Issue 15)

**Effort:** Medium | **Impact:** High (Integration)

**Files:** `backend/core/zephyr_fetcher.py`, `backend/api/routes/integrations.py`

**Tasks:**
1. Add better error handling in `zephyr_fetcher.py` — distinguish 401/404/timeout
2. Add resource ID format validation (must be `PROJECT-T123` format)
3. Add Zephyr connection test in `integrations.py` — call `/projects` endpoint before saving
4. Add logging for each step (token check, URL construction, API call, response parsing)

---

### Priority 3 — Verify Media OCR/Network Path Fetchers (Issue 16)

**Effort:** Medium | **Impact:** High (Integration)

**Files:** `backend/core/image_ocr_fetcher.py`, `backend/core/video_transcript_fetcher.py`, `backend/core/network_path_fetcher.py`

**Tasks:**
1. Add dependency check on import — log clear error if `pytesseract`, `yt-dlp`, `beautifulsoup4` missing
2. Add Groq API key check — log clear error if `GROQ_API_KEY` not set
3. Create test script that verifies each fetcher end-to-end with sample inputs
4. Improve error payloads — distinguish "dependency missing" from "API key missing" from "fetch failed"

---

### Priority 4 — Improve Automation Forge Fallback (Issue 8)

**Effort:** Low | **Impact:** Low (Fallback path only)

**Files:** `backend/agents/nodes.py` — `automation_forge_node` fallback

**Tasks:**
1. Read `analysis_payload.test_strategy_recommendations.ui` to infer framework
2. If it mentions "Cypress", use Cypress scaffold
3. If it mentions "Selenium", use Selenium scaffold
4. Default to Playwright if no clear signal

---

## Issues That Are NOT Code Bugs

| Issue | Why Not a Bug |
|-------|---------------|
| 1-7, 11 | LLM output quality — prompts already pass full UCC context |
| 9 | By design — separate nodes, synthesis merges them |
| 10 | By design — planning tool, not execution engine |
| 12 | Demo mode data is static by design — "Simulation Active" badge shows this |
