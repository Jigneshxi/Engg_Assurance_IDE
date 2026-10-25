# DEEP-DIVE ANALYSIS: "Dormant" Agents & "CACHE-HIT" Issues
> **Analysis Date:** May 10, 2026  
> **Analyst:** GitHub Copilot (Claude Haiku 4.5)  
> **Status:** ⚠️ CRITICAL FINDINGS IDENTIFIED  
> **Recommendation:** Code changes required (awaiting approval)

---

## Executive Summary

This deep-dive analysis investigated the proliferation of "Dormant" agent statuses and "CACHE-HIT" logs during recent mesh executions. The investigation reveals:

✅ **Dormant Agents:** Authentic and working as designed.  
⚠️ **CACHE-HIT Behavior:** Technically logging correctly, BUT **reveals a critical unresolved regression** in the cache invalidation logic.

**Key Finding:** While the Mesh_Execution_DeepDive_Audit (dated 2026-04-24) documented the parameter-loss regression and claimed corrective actions were implemented, a code inspection reveals:
- **Cache hashing IS configured to include `depth` and `role`** ✅
- **BUT these fields are NEVER injected into the mission state** ❌

This creates a **false sense of security** — the cache appears hardened, but depth/role parameters are getting lost before they reach the caching layer.

---

## FINDING #1: Dormant Agents Status — AUTHENTIC ✅

### Verdict: Correct Behavior

**Root Cause:** Agents are intentionally marked "Dormant" based on mission depth settings.

### How Dormancy Works

The system activates agents based on three depth profiles:
- **Rapid:** 20 agents (minimal, fastest execution, lowest cost)
- **Standard:** 40 agents (balanced mode, default)
- **Full:** 59 agents (complete mesh, highest fidelity)

**Evidence from `converge.py` (lines 70-89):**
```python
DEPTH_NODE_COUNTS = {"rapid": 20, "standard": 40, "full": 59}

def _build_active_agents(module: str, depth: str) -> Dict[str, Any]:
    profile = MODULE_AGENT_PROFILES.get(module, {})
    active_keys = profile.get(depth) or all_keys
    return {k: ("auto" if k in active_keys else "bypass") for k in all_keys}
```

**What happens in workflow.py (line 593-594):**
```
[DORMANT] Node '{agent_key}' is inactive in current mesh profile.
```

### Why This Is Correct

1. **Cost Optimization:** Bypass unused agents in Rapid/Standard modes to save LLM calls and credits
2. **Performance:** Reduce mesh execution time for quick feedback
3. **User Intent:** Mission launches at specific depth settings (e.g., "standard" depth = ~40 agents active, ~19 dormant)

### Authenticity Assessment

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Mission at "Standard" depth | 40 agents active, 19 dormant | 40 agents active, 19 dormant | ✅ Correct |
| Mission at "Full" depth | All 59 agents active | All 59 agents active | ✅ Correct |
| Mission at "Rapid" depth | 20 agents active, 39 dormant | 20 agents active, 39 dormant | ✅ Correct |

**Conclusion:** Dormant agents are not a bug; they are an intentional optimization feature. The logs are authentic and accurate.

---

## FINDING #2: CACHE-HIT Behavior — CORRECT LOGGING, BUT BROKEN CACHE INVALIDATION ⚠️

### Verdict: Technically Correct Output, But Reveals Critical Regression

The cache-hit logs are being generated correctly. However, they indicate a **depth/role parameter-loss bug** that was supposedly fixed but remains unresolved.

### How the Cache Should Work

**Intended Flow:**
1. User runs Mission A at **"standard" depth**
2. Agent node (e.g., "security") processes context → result cached with key: `sha256(node_key + hash(state))`
3. `hash(state)` SHOULD include: `depth="standard"`, `role="qa_engineer"`
4. Result stored with TTL of 24 hours
5. User runs Mission B at **"full" depth** with same requirement
6. Cache lookup computes: `sha256("security" + hash(state))` where state now has `depth="full"`
7. **CACHE MISS** (different state hash) → Re-execute LLM, generate higher-fidelity output
8. New result cached separately

**Current Broken Flow:**
1. User runs Mission A at **"standard" depth** → Result cached
2. User runs Mission B at **"full" depth** with same requirement
3. Cache lookup computes state hash **WITHOUT depth/role** (bug!) → **CACHE HIT** (wrong!)
4. Low-fidelity "standard" result returned for high-fidelity "full" mission
5. User gets degraded results despite requesting full analysis

### Root Cause: Parameter Loss in State Initialization

**The problem is in `backend/api/routes/tasks.py` lines 750-768:**

```python
# Step 1: Initialize Agentic Network state.
state = {
    "task_id": task_id,
    "mission_intent": intent or "PHASE_1", 
    "sources": sanitized_sources,
    "active_agents": override_agents,                    # ✅ Depth affects this (via _build_active_agents)
    "additional_context": req.context or "",
    "raw_requirements": restored_raw,
    "clarified_requirements": restored_clarified,
    "combined_data": restored_combined,
    "analysis_payload": restored_analysis,
    "compliance_report": restored_compliance,
    "risk_signals": restored_risks,
    "traceability_matrix": restored_rtm,
    "markdown_preview": restored_markdown,
    "output_filename": "",
    "download_url": "",
    "iteration_count": 3 if intent == "PHASE_2" else 0,
    "is_valid": True if intent == "PHASE_2" else False,
    "error": ""
}
```

**Missing fields:** `depth` and `role` are NOT in this state dictionary!

### Evidence Chain

**Stage 1: Request receives depth/role (converge.py)**
```python
class ConvergeMissionRequest(BaseModel):
    depth: str = "standard"
    role: str = "qa_engineer"

async def converge_full_mission(req: ConvergeMissionRequest, ...):
    active_agents = req.active_agents or _build_active_agents(req.module, req.depth)
    # depth is captured here ✅
```

**Stage 2: Depth is NOT passed to GenerateRequest (converge.py, line 156-160)**
```python
gen_req = GenerateRequest(
    sources=req.sources,
    context=req.context,
    active_agents=active_agents,
    min_log_level=req.min_log_level,
    parent_task_id=req.parent_task_id
    # ❌ depth and role are NOT here!
)
```

**Stage 3: GenerateRequest model lacks depth/role (models.py, lines 46-57)**
```python
class GenerateRequest(BaseModel):
    sources: List[FetchSource]
    llm: Optional[LLMConfig] = None
    context: Optional[str] = ""
    active_agents: Optional[dict] = None
    parent_task_id: Optional[str] = None
    min_log_level: Optional[int] = 3
    # ❌ NO depth or role fields!
```

**Stage 4: State initialization ignores depth/role (tasks.py, line 750-768)**
```python
state = {
    "task_id": task_id,
    "mission_intent": intent or "PHASE_1",
    # ... other fields ...
    # ❌ depth and role never added to state
}
```

**Stage 5: Cache hashing expects depth/role (node_cache.py, lines 98-99)**
```python
@staticmethod
def hash_state(state: dict, relevant_keys: list) -> str:
    # Always include global mission parameters to avoid depth/role cache collisions
    globals = {k: state.get(k) for k in ["depth", "role"] if k in state}
    # ⚠️ state.get(k) returns None if k not in state — cache hits on incomplete hash!
    subset = {k: state.get(k) for k in relevant_keys if k in state}
    subset.update(globals)
    serialized = json.dumps(subset, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()
```

### The Bug Manifests As

1. **Same cache hash for different depths:** User A runs at "standard", User B runs at "full" → hash is identical because depth is never in state
2. **Stale cache hits:** High-fidelity requests get low-fidelity cached results
3. **False economy:** System appears to save cost, but delivers wrong-quality outputs
4. **Misleading logs:** `[CACHE-HIT]` logs appear successful, but mask the degradation

### Impact Assessment

| Scenario | Expected | Current (Broken) | Impact |
|----------|----------|------------------|--------|
| Standard → Full depth | Cache MISS, re-execute | Cache HIT, return stale | ❌ Low-fidelity for high-fidelity request |
| Full → Standard depth | Cache MISS, re-execute | Cache HIT, return stale | ⚠️ May be acceptable (high→low) |
| Same depth, same context | Cache HIT | Cache HIT | ✅ Correct |
| Different role (QA vs SDET) | Cache MISS (role differs) | Cache HIT (role ignored) | ❌ Role-inappropriate outputs |

---

## FINDING #3: Previous "Corrective Actions" — Incomplete Implementation

### What the Audit Said (April 24, 2026)

From `Mesh_Execution_DeepDive_Audit.md` (Section 4):
> "To restore high-fidelity authenticity, the following hardening steps were taken:  
> **Node Cache** | Included `depth` and `role` in the state hash. | Switching depth now correctly invalidates the cache."

### What Was Actually Done

✅ **node_cache.py** — Cache hashing code WAS updated to include depth/role:
```python
# Line 98-99 of node_cache.py
globals = {k: state.get(k) for k in ["depth", "role"] if k in state}
```

✅ **NODE_INPUT_KEYS** — Cache keys were updated to reference depth/role:
```python
# Lines 188-194 of node_cache.py
"security":        ["combined_data", "additional_context", "depth", "role"],
"performance":     ["combined_data", "additional_context", "depth", "role"],
# ... etc
```

❌ **Missing Link:** The state initialization in `tasks.py` was **NOT updated** to actually inject depth/role into the state dictionary.

### Why The Audit Missed This

The audit verified:
1. ✅ Cache hashing code has depth/role support
2. ✅ NODE_INPUT_KEYS lists depth/role

But did NOT verify:
- ❌ Is depth/role actually in the state when nodes execute?
- ❌ Does the GenerateRequest model accept depth/role?
- ❌ Does kickoff_generation_task inject depth/role into state?

**Result:** Half-implemented fix. The infrastructure is ready, but the parameter injection code was never completed.

---

## FINDING #4: "Authentic and Correct" Claim — PARTIALLY ACCURATE

### From Audit Conclusion (Section 5):

> "The system is now **Authentic and Correct**.
> - **Dormancy** will still occur in Standard mode (as designed). ✅
> - **Cache Hits** will now only occur if the *entire* mission profile (including depth/role) is identical. ⚠️
> - **Full Depth** missions will now produce significantly higher density as the LLM is no longer blind to the mission constraints."

### Truth Table

| Claim | Verified? | Status |
|-------|-----------|--------|
| Dormancy will occur in Standard mode | ✅ Yes | CORRECT |
| Cache hits only with identical profile | ❌ No | **INCORRECT — depth/role not in state** |
| Full Depth produces higher density | ⚠️ Partial | May work due to active_agents (indirect), but not via LLM awareness |

---

## Comparative Analysis: What Should vs. What Is

### Example Mission Flow

**Scenario:** User runs same requirement at three depths: Rapid → Standard → Full

#### Expected (Correct Implementation)
```
Rapid Execution:
  State: {depth: "rapid", role: "qa_engineer", combined_data: {...}}
  Cache Key: sha256("security:hash(rapid+qa_engineer+combined_data)")
  Result: 20-agent output (low density, fast) → CACHED

Standard Execution:
  State: {depth: "standard", role: "qa_engineer", combined_data: {...}}
  Cache Key: sha256("security:hash(standard+qa_engineer+combined_data)")
  ❌ DIFFERENT KEY → CACHE MISS → Re-execute → CACHED separately

Full Execution:
  State: {depth: "full", role: "qa_engineer", combined_data: {...}}
  Cache Key: sha256("security:hash(full+qa_engineer+combined_data)")
  ❌ DIFFERENT KEY → CACHE MISS → Re-execute LLM with "explode density" prompt → CACHED separately

Result: Three separate, depth-appropriate outputs in cache
```

#### Actual (Current Broken State)
```
Rapid Execution:
  State: {role: undefined, combined_data: {...}}  ← depth missing!
  Cache Key: sha256("security:hash(undefined+combined_data)")
  Result: 20-agent output → CACHED

Standard Execution:
  State: {role: undefined, combined_data: {...}}  ← depth missing!
  Cache Key: sha256("security:hash(undefined+combined_data)")
  ✅ SAME KEY → CACHE HIT → Return rapid result (degraded) ← WRONG!

Full Execution:
  State: {role: undefined, combined_data: {...}}  ← depth missing!
  Cache Key: sha256("security:hash(undefined+combined_data)")
  ✅ SAME KEY → CACHE HIT → Return rapid result (highly degraded) ← WRONG!

Result: All depths return rapid output (lowest fidelity regardless of request)
```

---

## Recommended Corrective Actions

### Action 1: Add `depth` and `role` to GenerateRequest Model
**File:** `backend/api/models.py`  
**Location:** Lines 46-57

**Change Required:**
```python
class GenerateRequest(BaseModel):
    sources: List[FetchSource]
    llm: Optional[LLMConfig] = None
    context: Optional[str] = ""
    active_agents: Optional[dict] = None
    parent_task_id: Optional[str] = None
    min_log_level: Optional[int] = 3
    depth: Optional[str] = "standard"        # ← ADD THIS
    role: Optional[str] = "qa_engineer"     # ← ADD THIS
```

### Action 2: Pass `depth` and `role` in converge.py
**File:** `backend/api/routes/converge.py`  
**Location:** Lines 156-160 (and similar in other endpoints)

**Change Required:**
```python
gen_req = GenerateRequest(
    sources=req.sources,
    context=req.context,
    active_agents=active_agents,
    min_log_level=req.min_log_level,
    parent_task_id=req.parent_task_id,
    depth=req.depth,                    # ← ADD THIS
    role=req.role                       # ← ADD THIS
)
```

### Action 3: Inject `depth` and `role` into state in tasks.py
**File:** `backend/api/routes/tasks.py`  
**Location:** Lines 750-768

**Change Required:**
```python
state = {
    "task_id": task_id,
    "mission_intent": intent or "PHASE_1", 
    "sources": sanitized_sources,
    "active_agents": override_agents,
    "additional_context": req.context or "",
    "depth": req.depth or "standard",       # ← ADD THIS
    "role": req.role or "qa_engineer",      # ← ADD THIS
    # ... rest of state ...
}
```

### Action 4: Update crew_nodes.py to Use depth Parameter
**File:** `backend/agents/crew_nodes.py`

**Requirement:** Modify `run_planning_crew()` to accept and inject `depth` into LLM prompts so the LLM explicitly knows to "explode density" in Full mode.

**Example:**
```python
def run_planning_crew(..., depth: str = "standard"):
    prompt_injection = f"\nMISSION DEPTH SETTING: {depth.upper()}\n"
    if depth == "full":
        prompt_injection += "→ EXPLODE FIDELITY: Generate maximum density output with all possible test scenarios.\n"
    elif depth == "rapid":
        prompt_injection += "→ RAPID MODE: Minimize output to critical path tests only.\n"
    # ... etc
```

---

## Impact of Fixes

### Before Fixes
- ❌ Full depth requests get rapid-level outputs (due to cache hit on old rapid execution)
- ❌ Users pay for full mesh but receive degraded results
- ✅ Dormant agents correctly reported (works as designed)

### After Fixes
- ✅ Full depth requests get full-density outputs (cache MISS on different depth → re-execute)
- ✅ Users receive fidelity matching their depth selection
- ✅ Cache remains effective for same depth+role combinations
- ✅ LLM aware of depth constraints (via prompt injection)
- ✅ Dormant agents still correctly reported

---

## Summary Table

| Issue | Category | Status | Severity | Fix Complexity |
|-------|----------|--------|----------|-----------------|
| Dormant Agents Reporting | Behavior | ✅ Authentic | None | N/A |
| CACHE-HIT Logs | Behavior | ✅ Logging Correct | None | N/A |
| Parameter Loss (depth/role) | **Regression** | ❌ Broken | **CRITICAL** | **Medium** |
| Cache Invalidation | **Functionality** | ❌ Broken | **CRITICAL** | **Medium** |
| LLM Depth Awareness | **Prompt Engineering** | ⚠️ Incomplete | **High** | **Low** |

---

## Conclusion

**The good news:** Dormant agents and CACHE-HIT logs are authentic and working as designed.

**The bad news:** A critical parameter-loss regression means the cache is NOT actually protecting against depth-mode collisions. The corrective actions documented in the April 24 audit were only partially implemented.

**Recommendation:** Implement the three corrective actions above to restore depth/role parameter preservation through the entire state initialization pipeline. This will ensure:
1. Cache invalidation works as intended
2. Full depth missions receive full-density outputs
3. Cost savings from caching don't compromise quality

---

**Analysis prepared by:** GitHub Copilot (Claude Haiku 4.5)  
**Date:** May 10, 2026  
**Confidence Level:** HIGH (code inspection verified)  
**Approval Status:** ⏳ AWAITING USER APPROVAL FOR CODE CHANGES
