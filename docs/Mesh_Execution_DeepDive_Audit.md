# Mesh Execution Deep-Dive Audit: Authenticity & Correctness Report

## Executive Summary
This audit addresses the user's concerns regarding "Dormant" agents and frequent "CACHE-HIT" logs during mesh execution. The investigation confirms that while the behavior was "technically correct" based on the internal logic, it revealed a significant **parameter-loss regression** that impacted the authenticity of the "Full" depth mode.

## 1. Analysis of "Dormant" Agent Status
**Finding:** Authentic based on Mission Profile.

In the AEIAP v3 architecture, agent activation is governed by the `module` and `depth` parameters.
- **Rapid/Standard Depth:** Only a subset of agents (~20-36) are activated to optimize for speed and token cost.
- **Full Depth:** Activates the complete 59-node mesh.

**Conclusion:** Seeing agents marked as "Dormant" is correct if the mission was launched in **Standard** or **Rapid** mode. These agents are intentionally bypassed to prevent redundant compute for non-enterprise missions.

## 2. Analysis of "CACHE-HIT" Occurrences
**Finding:** Correct, but revealing a logic flaw (Collision).

The system uses an **A.N.T. Cache Shield** (Strategy S3) to skip LLM calls if the input state hasn't changed.
- **Authenticity:** If you run the exact same ticket twice with the same context, a `CACHE-HIT` is expected and proves the system is saving costs.
- **The Issue:** We identified that the **`depth` and `role` parameters were missing from the cache hash**. 
    - *Scenario:* A user runs a mission at "Standard" depth. It caches. 
    - *Regression:* The user then runs at "Full" depth. Because the `depth` wasn't in the hash, the system incorrectly hit the "Standard" cache and returned low-fidelity results for a high-fidelity request.

## 3. Root Cause: Mission Parameter Loss
During the deep dive, we discovered that while `depth` and `role` were passed to the API, they were **not being injected into the LLM prompts** or the **node cache keys**. This meant:
1. The LLM was blind to the requested depth (Minimal vs. Full).
2. The Cache Shield was returning stale "Standard" results even when "Full" was requested.

## 4. Corrective Actions Implemented
To restore high-fidelity authenticity, the following hardening steps were taken:

| Component | Action Taken | Result |
| :--- | :--- | :--- |
| **Node Cache** | Included `depth` and `role` in the state hash. | Switching depth now correctly invalidates the cache. |
| **Crew Nodes** | Updated `run_planning_crew` to accept and inject `depth`/`role`. | LLM now explicitly knows to "EXPLODE" density in Full mode. |
| **Graph Nodes** | Hardened `strategic_planning_node` state extraction. | Ensures mission constraints reach the specialist agents. |

## 5. Final Verdict
The system is now **Authentic and Correct**.
- **Dormancy** will still occur in Standard mode (as designed).
- **Cache Hits** will now only occur if the *entire* mission profile (including depth/role) is identical.
- **Full Depth** missions will now produce significantly higher density as the LLM is no longer blind to the mission constraints.

---
*Audit completed by A.N.T. Reasoning Network (Phase 2).*
