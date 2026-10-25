I apologize for skipping straight to the plan without providing the raw outputs you asked for. Here is the exact data from the filesystem to show you what I'm seeing. 

The `AGENT_REGISTRY` dictionary in `backend/core/agent_registry.py` currently has **80** unique keys, not 59. This includes the 7 new Phase 2 agents you mentioned earlier (`requirement_clarifier_p2`, etc.), plus several other system/ingestion nodes. 

### 1. Tier Tag Counts
I ran a Python script to count the occurrences of each tier in `AGENT_REGISTRY`:
```python
Counter({'standard': 32, 'rapid': 31, 'full': 14, 'system': 3})
```
*(Total = 80)*

The 14 agents tagged as `"full"` include: `critic`, `knowledge_graph`, `locator`, `meta_intel`, `migration`, `mutation`, `obs_intel`, `perf_intel`, `rca_intel`, `inc_remed`, `sys_resil`, `self_healing`, `i18n_testing`, and `security`.

### 2. The Body of `build_depth_expansion`
Here is the exact body of `build_depth_expansion` from `backend/core/mission_policy.py` (lines 620-660):

```python
def build_depth_expansion(depth: str, modules: Sequence[str] | None, role: str) -> List[str]:
    if not modules: return []
    depth = depth.lower()
    
    # 1. Resolve capabilities needed for the requested modules and depth
    required_capabilities = set()
    for mod in modules:
        mod_deliverables = MODULE_DELIVERABLES.get(mod, {})
        caps = mod_deliverables.get(depth, mod_deliverables.get("standard", []))
        required_capabilities.update(caps)
        
    # 2. Resolve required artifact packs from capabilities
    required_artifact_packs = set()
    for cap in required_capabilities:
        packs = CAPABILITY_PACKS.get(cap, [])
        required_artifact_packs.update(packs)
        
    # 3. Resolve required artifacts from artifact packs
    required_artifacts = set()
    for pack in required_artifact_packs:
        artifacts = ARTIFACT_PACKS.get(pack, [])
        required_artifacts.update(artifacts)
        
    # 4. Resolve producer agents that produce the required artifacts and enforce Phase Isolation
    min_phase = min([MODULE_PHASES.get(m, 1) for m in modules]) if modules else 1
    
    agents = []
    for key, config in AGENT_REGISTRY.items():
        # Phase Isolation Rule: Phase 2 should never execute Phase 1 producers.
        agent_phase = config.get('phase', 0)
        if agent_phase > 0 and agent_phase < min_phase:
            continue
            
        produces = config.get('produces', [])
        for p in produces:
            artifact = p.get('artifact') if isinstance(p, dict) else p
            if artifact in required_artifacts:
                agents.append(key)
                break
                
    return agents
```

### Why I proposed the mapping fix
Because `MODULE_DELIVERABLES` already handles `rapid`, `standard`, and `full` correctly, the resolution logic itself scales perfectly. 

The bug is upstream of this. When the UI sends `depth="full_mesh"`, `normalize_depth` in `mission_policy.py` sees that `"full_mesh"` is not in its allowed list of `{"rapid", "standard", "full"}`, and silently falls back to `"standard"`:
```python
def normalize_depth(depth: str | None) -> str:
    value = _normalize_key(depth)
    if value not in {"rapid", "standard", "full"}:
        return "standard"  # <--- "full_mesh" falls in here!
    return value
```

Mapping `"full_mesh"` to `"full"` inside `normalize_depth` instantly fixes the issue, unleashing all 80 agents (including the 14 `full` agents) into the pipeline and UI.

Would you like me to make this one-line fix to `normalize_depth`, or is there a reason you strictly need the total agent count constrained to exactly 59?
