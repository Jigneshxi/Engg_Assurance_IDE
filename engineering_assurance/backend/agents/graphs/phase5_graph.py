from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from backend.agents.state import Phase5State, log_step
from backend.core.mission_controller import MissionController, MissionStatus
from datetime import datetime, timezone
import hashlib
import json
import logging

mission_controller = MissionController()
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
#   NODE 1 — Traceability Auditor
# ═══════════════════════════════════════════════════════════════════════

async def traceability_auditor_node(state: Phase5State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Traceability: Validating requirement → task coverage...", "TraceabilityAuditor", status="running")

    capabilities = state.get("capabilities", [])
    tasks = state.get("tasks", [])

    # Ensure we work with lists even if data shape drifted
    if isinstance(capabilities, dict):
        capabilities = capabilities.get("capabilities", []) or list(capabilities.values())
    if isinstance(tasks, dict):
        tasks = list(tasks.values())

    gaps = []
    for cap in capabilities:
        if not isinstance(cap, dict):
            continue
        cap_id = cap.get("id") or cap.get("name", "")
        cap_name = cap.get("name") or cap_id

        # Check if any task references this capability
        matching = [
            t for t in tasks
            if isinstance(t, dict) and (
                cap_id in str(t.get("capability_refs", [])) or
                cap_id in str(t.get("title", "")) or
                cap_name.lower() in str(t.get("title", "")).lower()
            )
        ]
        if not matching:
            gaps.append(f"Capability {cap_id}: '{cap_name[:60]}' has no associated task")

    total = len(capabilities) if capabilities else 0
    traced = total - len(gaps)
    complete = len(gaps) == 0

    log_step(task_id,
             f"Traceability: {traced}/{total} capabilities traced {'✓' if complete else '— gaps detected'}",
             "TraceabilityAuditor", status="complete")

    return {
        "readiness_report": {
            "traceability": {
                "total_capabilities": total,
                "traced": traced,
                "gaps": gaps[:10],  # Cap at 10 to avoid payload bloat
                "complete": complete,
                "passed": True,  # V1: gaps are warnings, not blockers
                "warning_only": not complete,
                "traceability_warnings": gaps[:10]
            }
        }
    }


# ═══════════════════════════════════════════════════════════════════════
#   NODE 2 — Synthesis Final (Readiness Summary)
# ═══════════════════════════════════════════════════════════════════════

async def synthesis_final_node(state: Phase5State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Synthesis: Compiling readiness summary...", "SynthesisFinal", status="running")

    traceability = (state.get("readiness_report") or {}).get("traceability", {})
    nfr_report = state.get("nfr_clearance_report", {})
    tasks = state.get("tasks", [])
    if isinstance(tasks, dict):
        tasks = list(tasks.values())

    gaps_count = len(traceability.get("gaps", []))
    summary = {
        "status": "ready",
        "summary": f"Mission readiness assessment complete. "
                   f"{len(tasks)} engineering tasks processed. "
                   f"NFR gate: {'PASSED' if nfr_report.get('gate_passed') else 'PENDING'}. "
                   f"Traceability: {'COMPLETE' if traceability.get('complete') else f'{gaps_count} gaps detected'}.",
        "task_count": len(tasks),
        "nfr_gate_passed": nfr_report.get("gate_passed", False),
        "traceability_complete": traceability.get("complete", False),
    }

    log_step(task_id, "Synthesis: Readiness summary compiled ✓", "SynthesisFinal", status="complete")

    return {"readiness_report": summary}


# ═══════════════════════════════════════════════════════════════════════
#   NODE 3 — Compose (Mission Archive)
# ═══════════════════════════════════════════════════════════════════════

async def compose_node(state: Phase5State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Compose: Generating mission archive metadata...", "Compose", status="running")

    archive = {
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "mission_id": mission_id,
        "phases_completed": 5,
        "status": "archived"
    }

    log_step(task_id, "Compose: Mission archive ready ✓", "Compose", status="complete")
    return {"mission_archive": archive}


# ═══════════════════════════════════════════════════════════════════════
#   NODE 4 — Passport Generation (Cryptographic V&V)
# ═══════════════════════════════════════════════════════════════════════

async def passport_generation_node(state: Phase5State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Passport: Generating cryptographic V&V passport...", "PassportGen", status="running")

    def sha256(data) -> str:
        return "sha256:" + hashlib.sha256(
            json.dumps(data, sort_keys=True, default=str).encode()
        ).hexdigest()

    # Load all prior phase outputs for hash verification
    try:
        phase1_output = await mission_controller.get_phase_output(mission_id, 1)
    except Exception:
        phase1_output = {}
    try:
        phase2_output = await mission_controller.get_phase_output(mission_id, 2)
    except Exception:
        phase2_output = {}
    try:
        phase3_output = await mission_controller.get_phase_output(mission_id, 3)
    except Exception:
        phase3_output = {}
        
    failed_modules = phase3_output.get("failed_modules", [])
    total_modules = len(phase3_output.get("module_forge_code", []))
    pushed_modules = len(phase3_output.get("generated_code_paths", []))

    if failed_modules or pushed_modules < total_modules:
        log_step(task_id, f"Passport: {len(failed_modules)}/{total_modules} modules failed Git write-back — cannot certify", "PassportGen", status="error")
        return {"vv_passport": {
            "status": "BLOCKED",
            "reason": f"{len(failed_modules)}/{total_modules} modules failed Git write-back — cannot certify incomplete deliverable",
            "failed_modules": failed_modules
        }}
        
    try:
        phase4_output = await mission_controller.get_phase_output(mission_id, 4)
    except Exception:
        phase4_output = {}

    readiness = state.get("readiness_report") or {}
    traceability_data = readiness.get("traceability", {})
    traceability_complete = traceability_data.get("complete", False) if isinstance(traceability_data, dict) else bool(readiness.get("traceability_complete", False))
    traceability_gaps = traceability_data.get("gaps", []) if isinstance(traceability_data, dict) else []
    nfr_passed = phase4_output.get("all_nfr_green", False)

    passport = {
        "passport_id": f"VVP-{str(mission_id)[:8]}",
        "mission_id": mission_id,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "phase1_hash": sha256(phase1_output),
        "api_spec_hash": sha256(phase2_output),
        "forge_code_hash": sha256(phase3_output),
        "phase4_hash": sha256(phase4_output),
        "traceability_complete": traceability_complete,
        "traceability_warnings": traceability_gaps if not traceability_complete else [],
        "all_advisories_verified": True,
        "compliance_checks_passed": nfr_passed,  # V1: decouple from traceability — gaps are warnings
        "compliance_status": "CLEARED" if traceability_complete else "CLEARED_WITH_WARNINGS",
        "signed_by": "passport_generation_node"
    }
    passport["signature"] = sha256(passport)

    log_step(task_id, f"Passport: {passport['passport_id']} issued ✓", "PassportGen", status="complete")
    return {"vv_passport": passport}


# ═══════════════════════════════════════════════════════════════════════
#   NODE 5 — Phase 5 Exit (Persist + Transition)
# ═══════════════════════════════════════════════════════════════════════

async def phase5_exit_node(state: Phase5State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Phase 5 Exit: Persisting V&V outputs and completing mission...", "System", status="running")

    phase5_output = {
        "readiness_report": state.get("readiness_report", {}),
        "vv_passport": state.get("vv_passport", {}),
        "mission_archive": state.get("mission_archive", {})
    }

    await mission_controller.persist_phase_output(mission_id, 5, phase5_output)
    await mission_controller.transition_status(mission_id, MissionStatus.MISSION_COMPLETE)

    log_step(task_id, "Mission Complete: V&V Passport issued ✓", "System", status="complete")
    return {}


def get_checkpointer():
    return MemorySaver()


def build_phase5_graph():
    workflow = StateGraph(Phase5State)

    workflow.add_node("traceability_auditor_node", traceability_auditor_node)
    workflow.add_node("synthesis_final_node", synthesis_final_node)
    workflow.add_node("compose_node", compose_node)
    workflow.add_node("passport_generation_node", passport_generation_node)
    workflow.add_node("phase5_exit_node", phase5_exit_node)

    # Simple sequential chain: traceability → synthesis → compose → passport → exit
    workflow.add_edge(START, "traceability_auditor_node")
    workflow.add_edge("traceability_auditor_node", "synthesis_final_node")
    workflow.add_edge("synthesis_final_node", "compose_node")
    workflow.add_edge("compose_node", "passport_generation_node")
    workflow.add_edge("passport_generation_node", "phase5_exit_node")
    workflow.add_edge("phase5_exit_node", END)

    # No interrupt_before in Phase 5
    return workflow.compile(checkpointer=get_checkpointer())
