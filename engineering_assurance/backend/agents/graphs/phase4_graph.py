from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from pathlib import Path
import os
import yaml
import logging
import asyncio

from backend.agents.state import Phase4State
from backend.core.mission_controller import MissionController, MissionStatus
from backend.core.phase_contracts import PHASE_CONTRACTS
from backend.services.nfr.semgrep_runner import SemgrepRunner
from backend.services.nfr.locust_runner import LocustRunner
from backend.services.nfr.lighthouse_runner import LighthouseRunner
from backend.services.nfr.reliability_runner import ReliabilityRunner
from backend.services.nfr.secret_scan_runner import SecretScanRunner
from backend.services.nfr.lint_runner import LintRunner
from backend.services.nfr.retry_policy import RetryPolicy
from backend.agents.state import log_step

logger = logging.getLogger(__name__)
mission_controller = MissionController()

def get_mission_output_dir(mission_id: str) -> str:
    workspace = Path(os.environ.get("WORKSPACE_DIR", "./workspace"))
    base = workspace / "missions" / str(mission_id)
    return str(base / "artifacts" / "phase4")

async def validate_env_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Validating NFR Environment...", "ValidateEnv", status="running")
    
    runtime_config = await mission_controller.get_mission_runtime(mission_id)
    output_dir = get_mission_output_dir(mission_id)
    
    runners = [
        SemgrepRunner(mission_id, runtime_config, output_dir),
        LocustRunner(mission_id, runtime_config, output_dir),
        LighthouseRunner(mission_id, runtime_config, output_dir),
        ReliabilityRunner(mission_id, runtime_config, output_dir),
        SecretScanRunner(mission_id, runtime_config, output_dir),
        LintRunner(mission_id, runtime_config, output_dir)
    ]
    
    availability = {}
    for r in runners:
        v = await r.validate()
        availability[v.get("tool")] = v
        
    log_step(task_id, f"Environment validation complete: {list(availability.keys())}", "ValidateEnv", status="complete")
    return {"env_validation": availability}

async def _run_audit_per_module(state: Phase4State, runner_class, audit_name: str, log_tag: str):
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, f"{audit_name}: Running per-module analysis...", log_tag, status="running")
    
    runtime_config = await mission_controller.get_mission_runtime(mission_id)
    output_dir = get_mission_output_dir(mission_id)
    runner = runner_class(mission_id, runtime_config, output_dir)
    
    modules = state.get("module_forge_code", [])
    modules = [m for m in modules if m.get("status") not in ("failed", "error")]
    if not modules:
        modules = [{"module_name": "global"}]
        
    all_results = []
    for mod in modules:
        mod_name = mod.get("module_name", "global")
        # In a real app we would pass the module's generated code path to the runner
        # Currently, the runners will just take the module_name as an argument to their lifecycle if supported
        try:
            if hasattr(runner, "run_lifecycle") and 'module_name' in runner.run_lifecycle.__code__.co_varnames:
                res = await runner.run_lifecycle(module_name=mod_name)
            else:
                res = await runner.run_lifecycle()
                res["module"] = mod_name
            all_results.append(res)
        except Exception as e:
            logger.error(f"[{task_id}] {audit_name} failed for module {mod_name}: {e}")
            all_results.append({"tool": audit_name, "module": mod_name, "status": "ERROR", "error": str(e), "score": 0})
            
    log_step(task_id, f"{audit_name} Audit complete for {len(modules)} modules", log_tag, status="complete")
    return all_results

async def security_audit_node(state: Phase4State) -> dict:
    res = await _run_audit_per_module(state, SemgrepRunner, "Security SAST", "SecurityAudit")
    return {"security_results": res}

async def accessibility_audit_node(state: Phase4State) -> dict:
    res = await _run_audit_per_module(state, LighthouseRunner, "Accessibility", "AccessibilityAudit")
    return {"accessibility_results": res}

async def performance_audit_node(state: Phase4State) -> dict:
    res = await _run_audit_per_module(state, LocustRunner, "Performance", "PerformanceAudit")
    return {"performance_results": res}

async def reliability_audit_node(state: Phase4State) -> dict:
    res = await _run_audit_per_module(state, ReliabilityRunner, "Reliability", "ReliabilityAudit")
    return {"reliability_results": res}

async def compliance_audit_node(state: Phase4State) -> dict:
    # We will combine Secret Scan and Linting under compliance/quality
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Compliance & Quality: Running per-module scans...", "ComplianceAudit", status="running")
    
    runtime_config = await mission_controller.get_mission_runtime(mission_id)
    output_dir = get_mission_output_dir(mission_id)
    
    secret_runner = SecretScanRunner(mission_id, runtime_config, output_dir)
    lint_runner = LintRunner(mission_id, runtime_config, output_dir)
    
    modules = state.get("module_forge_code", [])
    modules = [m for m in modules if m.get("status") not in ("failed", "error")]
    if not modules:
        modules = [{"module_name": "global"}]
        
    all_results = []
    for mod in modules:
        mod_name = mod.get("module_name", "global")
        sec_res = await secret_runner.run_lifecycle(module_name=mod_name)
        lint_res = await lint_runner.run_lifecycle(module_name=mod_name)
        all_results.extend([sec_res, lint_res])
        
    log_step(task_id, f"Compliance Audit complete for {len(modules)} modules", "ComplianceAudit", status="complete")
    return {"compliance_results": all_results}

async def nfr_aggregator_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Aggregating Per-Module NFR Audit Results...", "NFRAggregator", status="running")
    
    # We aggregate scores per module and then globally
    results = {
        "security": state.get("security_results", []),
        "accessibility": state.get("accessibility_results", []),
        "performance": state.get("performance_results", []),
        "reliability": state.get("reliability_results", []),
        "compliance": state.get("compliance_results", [])
    }
    
    # Calculate overall base score
    all_scores = []
    for category_results in results.values():
        for r in category_results:
            if isinstance(r.get("score"), (int, float)):
                all_scores.append(r.get("score"))
                
    overall_score = sum(all_scores) // len(all_scores) if all_scores else 0
    
    aggregated = {
        "overall_score": overall_score,
        "tool_results": results,
    }
    
    log_step(task_id, "Aggregation complete", "NFRAggregator", status="complete")
    return {"nfr_clearance_report": aggregated}

async def policy_engine_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Evaluating NFR Policies...", "PolicyEngine", status="running")
    
    report = state.get("nfr_clearance_report", {})
    results = report.get("tool_results", {})
    
    policy_path = Path("backend/config/nfr_policy.yaml")
    try:
        with open(policy_path, "r") as f:
            policy = yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Failed to load NFR policy: {e}")
        policy = {}
        
    blocking_findings = []
    warnings = []
    
    # Check compliance (secrets & linting)
    for res in results.get("compliance", []):
        mod = res.get("module", "unknown")
        if res.get("status") == "ERROR":
            blocking_findings.append(f"Compliance [{mod}]: Runner failed: {res.get('error')}")
            continue
        if res.get("tool") == "secret_scan" and res.get("metrics", {}).get("secrets_found", 0) > 0:
            blocking_findings.append(f"Compliance [{mod}]: Hardcoded secrets found.")
        if res.get("tool") == "lint" and res.get("metrics", {}).get("errors", 0) > 0:
            warnings.append(f"Quality [{mod}]: Linting errors found.")
            
    # Check security
    for sec in results.get("security", []):
        mod = sec.get("module", "unknown")
        if sec.get("status") == "ERROR":
            blocking_findings.append(f"Security [{mod}]: Runner failed: {sec.get('error')}")
            continue
        if sec.get("status") == "UNAVAILABLE":
            continue
        metrics = sec.get("metrics", {})
        if metrics.get("critical", 0) > 0:
            blocking_findings.append(f"Security [{mod}]: {metrics['critical']} critical issues.")
            
    # Check performance
    for perf in results.get("performance", []):
        mod = perf.get("module", "unknown")
        if perf.get("status") == "ERROR":
            blocking_findings.append(f"Performance [{mod}]: Runner failed: {perf.get('error')}")
            continue
        if perf.get("status") == "UNAVAILABLE":
            continue
        p95 = perf.get("metrics", {}).get("p95", 0)
        p_fail = policy.get("performance", {}).get("p95", {}).get("fail", 1000)
        if p95 >= p_fail:
            blocking_findings.append(f"Performance [{mod}]: P95 latency {p95}ms exceeds {p_fail}ms limit.")

    overall_status = "PASS"
    if blocking_findings:
        overall_status = "FAIL"
    elif warnings:
        overall_status = "WARN"
        
    report["overall_status"] = overall_status
    report["blocking_findings"] = blocking_findings
    report["warnings"] = warnings
    report["all_nfr_green"] = overall_status in ("PASS", "WARN")
    
    log_step(task_id, f"Policy Evaluation: {overall_status}", "PolicyEngine", status="complete")
    return {"nfr_clearance_report": report, "all_nfr_green": report["all_nfr_green"]}

async def nfr_remediation_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    
    report = state.get("nfr_clearance_report", {})
    if report.get("all_nfr_green"):
        return {}
        
    log_step(task_id, "Generating Actionable Remediation Plan...", "Remediation", status="running")
    
    failing_context = {
        "overall_status": report.get("overall_status"),
        "blocking_findings": report.get("blocking_findings", []),
        "warnings": report.get("warnings", []),
    }
            
    try:
        from backend.prompts.nfr_remediation import build_remediation_prompt
        from backend.core.inference import InferenceCoordinator
        from backend.agents.nodes.intelligence import robust_json_loads
        
        prompt = build_remediation_prompt(failing_context)
        content = await asyncio.to_thread(InferenceCoordinator.execute, 'Senior DevSecOps Engineer', 'Remediation Generation', 'Remediation', prompt, log_step, task_id)
        
        result = robust_json_loads(content)
        report["remediation_plan"] = result.get("remediations", [])
        
        log_step(task_id, f"Generated {len(report['remediation_plan'])} remediation steps", "Remediation", status="complete")
    except Exception as e:
        logger.error(f"[NFR-REMEDIATION] Failed to generate remediation plan: {e}")
        log_step(task_id, "Failed to generate remediation plan", "Remediation", status="error")
        report["remediation_plan"] = []
        
    return {"nfr_clearance_report": report}

async def green_flag_gate_node(state: Phase4State) -> dict:
    return {}

def nfr_conditional_edge(state: Phase4State) -> str:
    if state.get("all_nfr_green"):
        return "green"
    
    # Check retry policy
    report = state.get("nfr_clearance_report", {})
    retry_count = (state.get("retry_count") or 0)
    retry_eval = RetryPolicy.evaluate(report, retry_count)
    
    if retry_eval.get("should_retry"):
        return "retry"
        
    return "blocked"

async def nfr_retry_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    retry_count = (state.get("retry_count") or 0) + 1
    
    report = state.get("nfr_clearance_report", {})
    retry_eval = RetryPolicy.evaluate(report, retry_count - 1)
    failed_modules = retry_eval.get("failed_modules", [])
    
    log_step(task_id, f"NFR Gate Failed. Initiating Auto-Retry ({retry_count}/{RetryPolicy.MAX_RETRIES}) for modules: {failed_modules}", "NFRRetry", status="running")
    
    # Transition the mission back to PLAN_APPROVED so phase 3 runs again, or directly trigger Phase 3 via api.
    # We will trigger the execution of Phase 3 again. 
    await mission_controller.transition_status(mission_id, MissionStatus.PHASE3_RUNNING)
    
    import asyncio
    from backend.api.routes.tasks import execute_phase_3_mission
    
    # We kick off phase 3 again in the background, passing the failed_modules 
    # so that Phase 3 ONLY regenerates those specific modules.
    asyncio.create_task(execute_phase_3_mission(mission_id, failed_modules=failed_modules))
    
    log_step(task_id, "Re-triggering Phase 3 Generation...", "NFRRetry", status="complete")
    return {"retry_count": retry_count}

async def nfr_blocked_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "NFR Gate Blocked — Max retries reached or manual intervention required.", "NFRBlocked", status="error")
    await mission_controller.transition_status(mission_id, MissionStatus.PHASE3_RUNNING)
    return {}

async def phase4_exit_node(state: Phase4State) -> dict:
    mission_id = state.get("mission_id")
    task_id = state.get("task_id") or mission_id
    log_step(task_id, "Phase 4 Exit: Persisting reports...", "System", status="running")
    
    report = state.get("nfr_clearance_report", {})
    
    output_dir = Path(get_mission_output_dir(mission_id))
    summary_dir = output_dir / "summary"
    summary_dir.mkdir(parents=True, exist_ok=True)
    
    import json
    with open(summary_dir / "nfr_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    phase4_output = {
        "mission_id": mission_id,
        "nfr_clearance_report": report,
        "all_nfr_green": state.get("all_nfr_green", False)
    }
    
    await mission_controller.persist_phase_output(mission_id, 4, phase4_output)
    
    # Guard: only transition to NFR_GREEN if we are still in PHASE4_RUNNING.
    # A concurrent nfr_retry_node may have already transitioned the mission back
    # to PHASE3_RUNNING — attempting NFR_GREEN from there would be an invalid transition.
    try:
        current_status = await mission_controller.get_status(mission_id)
        if current_status == MissionStatus.PHASE4_RUNNING:
            await mission_controller.transition_status(mission_id, MissionStatus.NFR_GREEN)
        else:
            logger.warning(
                f"[PHASE4-EXIT] Skipping NFR_GREEN transition — current status is {current_status}, "
                f"not PHASE4_RUNNING. A retry cycle may have already re-entered Phase 3."
            )
    except Exception as te:
        logger.error(f"[PHASE4-EXIT] Status transition failed: {te}")
    
    log_step(task_id, "Phase 4 Complete ✓", "System", status="complete")
    return {}

def get_checkpointer():
    return MemorySaver()

def build_phase4_graph():
    workflow = StateGraph(Phase4State)
    
    workflow.add_node("validate_env_node", validate_env_node)
    workflow.add_edge(START, "validate_env_node")
    
    audit_nodes = [
        ("security_audit_node", security_audit_node), 
        ("accessibility_audit_node", accessibility_audit_node), 
        ("performance_audit_node", performance_audit_node),
        ("reliability_audit_node", reliability_audit_node),
        ("compliance_audit_node", compliance_audit_node)
    ]
    
    for name, func in audit_nodes:
        workflow.add_node(name, func)
        workflow.add_edge("validate_env_node", name)
        workflow.add_edge(name, "nfr_aggregator_node")
        
    workflow.add_node("nfr_aggregator_node", nfr_aggregator_node)
    workflow.add_node("policy_engine_node", policy_engine_node)
    workflow.add_node("nfr_remediation_node", nfr_remediation_node)
    
    workflow.add_edge("nfr_aggregator_node", "policy_engine_node")
    workflow.add_edge("policy_engine_node", "nfr_remediation_node")
    workflow.add_edge("nfr_remediation_node", "green_flag_gate_node")
    
    workflow.add_node("green_flag_gate_node", green_flag_gate_node)
    workflow.add_node("nfr_retry_node", nfr_retry_node)
    workflow.add_node("nfr_blocked_node", nfr_blocked_node)
    workflow.add_node("phase4_exit_node", phase4_exit_node)
    
    workflow.add_conditional_edges(
        "green_flag_gate_node",
        nfr_conditional_edge,
        {
            "green": "phase4_exit_node",
            "retry": "nfr_retry_node",
            "blocked": "nfr_blocked_node"
        }
    )
    
    workflow.add_edge("nfr_retry_node", END)
    workflow.add_edge("nfr_blocked_node", END)
    workflow.add_edge("phase4_exit_node", END)
    
    return workflow.compile(
        checkpointer=get_checkpointer(),
        interrupt_before=["nfr_blocked_node"]
    )
