import logging
import re
import hashlib
import json
from datetime import datetime
from typing import Tuple, List
from backend.agents.state import AgentState, log_step
from backend.core.inference import InferenceCoordinator

logger = logging.getLogger(__name__)

def sha256(data: any) -> str:
    return "sha256:" + hashlib.sha256(
        json.dumps(data, sort_keys=True).encode()
    ).hexdigest()

def deterministic_safety_check(state: AgentState) -> dict:
    """
    Pure Python AST/Regex scan for dangerous destructive operations.
    Returns: {"passed": bool, "violations": List[str]}
    """
    violations = []
    
    # Check migrations
    sql_migrations = state.get("sql_migrations", {}).get("script", "")
    sql_upper = sql_migrations.upper()
    
    if "DROP TABLE" in sql_upper:
        violations.append("Found DROP TABLE in SQL migrations without explicit HITL override.")
        
    if "DELETE FROM" in sql_upper and "WHERE" not in sql_upper:
        violations.append("Found DELETE FROM without WHERE clause in SQL migrations.")
        
    # Hardcoded secrets heuristic (very basic for demo)
    backend_code = json.dumps(state.get("backend_forge_code", {}))
    if "PASSWORD=" in backend_code.upper() or "SECRET_KEY=" in backend_code.upper():
        if "ENV" not in backend_code.upper():
            violations.append("Potential hardcoded secret detected in backend code.")

    return {
        "passed": len(violations) == 0,
        "violations": violations
    }

def validate_traceability(state: AgentState) -> Tuple[bool, List[str]]:
    gaps = []
    
    tasks = state.get("tasks", [])
    system_spec = state.get("system_specification", {})
    capabilities = system_spec.get("capabilities", [])
    
    tasks_missing_refs = [
        t['task_id'] for t in tasks 
        if not t.get('capability_refs')
    ]
    if tasks_missing_refs:
        gaps.append(f"Tasks missing capability_refs: {tasks_missing_refs}. Re-run Pillar 2 to regenerate contracts.")
        return False, gaps
        
    # Check if every capability has at least one task
    known_cap_ids = [c.get("id") for c in capabilities if c.get("id")]
    for cap_id in known_cap_ids:
        # Check if any task references this capability
        found = any(cap_id in t.get('capability_refs', []) for t in tasks)
        if not found:
            gaps.append(f"Capability {cap_id} has no associated engineering tasks.")
            
    return len(gaps) == 0, gaps

def traceability_auditor_node(state: AgentState):
    """
    Validates end-to-end traceability before passport generation.
    """
    if state.get('error'): return state
    task_id = state.get('task_id')
    log_step(task_id, 'Activating Traceability Auditor...', 'Auditor')

    passed, gaps = validate_traceability(state)
    
    state["traceability_audit"] = {
        "passed": passed,
        "gaps": gaps,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    if not passed:
        log_step(task_id, f"Traceability Audit Failed: {gaps}", 'Auditor')
        # We don't block the graph here; the passport node will record the failure.
    else:
        log_step(task_id, "Traceability Audit Passed: All capabilities mapped.", 'Auditor')

    return state

def passport_generation_node(state: AgentState):
    """
    Generates the final Cryptographic Passport (Pillar 5).
    """
    if state.get('error'): return state
    task_id = state.get('task_id')
    log_step(task_id, 'Generating Cryptographic Passport...', 'System')
    
    # Check deterministic safety check
    safety_result = deterministic_safety_check(state)
    if not safety_result["passed"]:
        log_step(task_id, f"Deterministic safety check failed: {safety_result['violations']}", 'System')
        
    system_spec = state.get("system_specification", {})
    capabilities = system_spec.get("capabilities", [])
    bundle_manifest = state.get("bundle_manifest", {})
    tdd_report = state.get("tdd_execution_report", state.get("tdd_contracts", {}))
    nfr_report = state.get("nfr_clearance_report", {})
    traceability_audit = state.get("traceability_audit", {})
    
    is_cleared = safety_result["passed"] and traceability_audit.get("passed", False)
    
    passport = {
        "mission_id": state.get("mission_id", task_id),
        "issued_at": datetime.utcnow().isoformat(),
        "cleared_for_release": is_cleared,
        "signatures": {
            "capabilities_hash": sha256(capabilities),
            "system_specification_hash": sha256(system_spec),
            "bundle_manifest_hash": sha256(bundle_manifest),
            "tdd_execution_report_hash": sha256(tdd_report),
            "nfr_clearance_report_hash": sha256(nfr_report)
        },
        "violations": safety_result["violations"] if not safety_result["passed"] else [],
        "traceability_gaps": traceability_audit.get("gaps", []) if not traceability_audit.get("passed", True) else []
    }
    
    state["cryptographic_passport"] = passport
    log_step(task_id, f"Cryptographic Passport generated. Cleared: {is_cleared}", 'System')
    
    return state
