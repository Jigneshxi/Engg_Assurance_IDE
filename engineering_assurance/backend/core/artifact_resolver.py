import logging
import hashlib
import json
from typing import Dict, Any
from sqlalchemy.orm import Session
from backend.core.config import settings
from backend.services.mission_service import MissionService
from backend.core.agent_registry import AGENT_REGISTRY

logger = logging.getLogger(__name__)

# Build a global mapping of ArtifactType -> state_key based on the sole producer
ARTIFACT_TO_STATE_KEY = {}
for agent, config in AGENT_REGISTRY.items():
    for prod in config.get("produces", []):
        if isinstance(prod, dict):
            ARTIFACT_TO_STATE_KEY[prod["artifact"]] = prod["state_key"]

class ArtifactContextBuilder:
    @staticmethod
    def enrich(db: Session, mission_id: int, agent_name: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Passive Resolution (Sprint 3A): Resolve all consumed artifacts and inject them into state.
        """
        registry = AGENT_REGISTRY.get(agent_name)
        if not registry or not mission_id:
            return state

        consumes = registry.get("consumes", [])
        dependency_snapshot = {}
        
        for artifact_type in consumes:
            try:
                resolved = MissionService.resolve_artifact(db, mission_id, artifact_type)
                if resolved:
                    payload = resolved.get("payload")
                    dependency_snapshot[artifact_type] = {
                        "version": resolved.get("version"),
                        "hash": resolved.get("hash")
                    }
                    
                    state_key = ARTIFACT_TO_STATE_KEY.get(artifact_type)
                    if state_key:
                        state[state_key] = payload
                        logger.info(f"[PASSIVE-RESOLVER] Artifact {artifact_type} FOUND for {agent_name} and injected into '{state_key}'.")
                        
                        # Store resolution status into partial_state for observability
                        task_id = state.get("task_id")
                        if task_id:
                            from backend.agents.state import write_partial_state
                            status_payload = {
                                "artifact_resolution": {
                                    artifact_type: {
                                        "status": "FOUND",
                                        "agent": agent_name
                                    }
                                }
                            }
                            write_partial_state(task_id, status_payload)
                else:
                    logger.info(f"[PASSIVE-RESOLVER] Artifact {artifact_type} MISSING for {agent_name}.")
            except Exception as e:
                logger.error(f"[PASSIVE-RESOLVER] Failed to resolve {artifact_type}: {e}")
                
        state["_dependency_snapshot"] = dependency_snapshot
        return state
        
from dataclasses import dataclass

@dataclass
class BypassDecision:
    can_bypass: bool
    reason: str
    artifact: str = None
    artifact_version: int = None

class BypassEvaluator:
    @staticmethod
    def evaluate(db: Session, mission_id: int, agent_name: str, registry: dict, current_schema_version: int = 2) -> BypassDecision:
        if not registry.get("allow_bypass", False):
            return BypassDecision(False, "ALWAYS_EXECUTE_STRATEGY")

        consumes = registry.get("consumes", [])
        produces = registry.get("produces", [])
        
        # Rule 1: Consumes Resolve
        resolved_consumes = {}
        for c in consumes:
            resolved = MissionService.resolve_artifact(db, mission_id, c)
            if not resolved:
                return BypassDecision(False, f"{c}_MISSING")
            resolved_consumes[c] = resolved

        # We assume one primary output for bypass logic reporting
        primary_produced = produces[0]["artifact"] if produces and isinstance(produces[0], dict) else None
        
        # Rule 2: Produces Exist
        for p in produces:
            p_name = p["artifact"] if isinstance(p, dict) else p
            resolved = MissionService.resolve_artifact(db, mission_id, p_name)
            if not resolved:
                return BypassDecision(False, f"PRODUCED_{p_name}_MISSING")

            payload = resolved.get("payload", {})
            if isinstance(payload, dict):
                row_schema_version = payload.get("schema_version") or 1
                safe_current = current_schema_version or 2
                if int(row_schema_version) < int(safe_current):
                    logger.info("[CACHE] Bypassed stale row: schema_version mismatch")
                    return BypassDecision(False, "SCHEMA_VERSION_MISMATCH")
                
            # Rule 3: Artifact Status
            min_status = registry.get("minimum_artifact_status", "APPROVED")
            valid_statuses = ["APPROVED", "VALIDATED"] if min_status == "VALIDATED" else ["APPROVED"]
            if resolved.get("status") not in valid_statuses:
                return BypassDecision(False, f"PRODUCED_{p_name}_NOT_APPROVED")

            producer_version = resolved.get("producer_version")
            if producer_version and producer_version != settings.VERSION:
                return BypassDecision(False, f"PRODUCED_{p_name}_PRODUCER_VERSION_MISMATCH")
            if not producer_version:
                return BypassDecision(False, f"PRODUCED_{p_name}_PRODUCER_VERSION_MISSING")
                
            # Rule 4: Version Match
            max_consumed_version = max([c["version"] for c in resolved_consumes.values()]) if resolved_consumes else 0
            if resolved.get("version", 0) < max_consumed_version:
                return BypassDecision(False, f"PRODUCED_{p_name}_STALE_VERSION")
                
            # Rule 5: Hash Match (The real authority)
            stored_deps = resolved.get("dependency_snapshot") or {}
            for c_name, c_data in resolved_consumes.items():
                stored_hash = stored_deps.get(c_name, {}).get("hash")
                if not stored_hash or stored_hash != c_data.get("hash"):
                    return BypassDecision(False, "HASH_MISMATCH", primary_produced)

        # All rules passed!
        prod_version = 0
        if primary_produced:
            p_res = MissionService.resolve_artifact(db, mission_id, primary_produced)
            prod_version = p_res.get("version", 0) if p_res else 0
            
        return BypassDecision(True, "APPROVED_ARTIFACT_REUSED", primary_produced, prod_version)

    @staticmethod
    def should_bypass(db: Session, mission_id: int, agent_name: str, state: Dict[str, Any]) -> bool:
        """
        Sprint 3B.2 (Active Bypass Enabled)
        Evaluates the bypass logic, logs detailed observability, and returns True to skip execution.
        """
        registry = AGENT_REGISTRY.get(agent_name)
        if not registry or not mission_id:
            return False
            
        current_schema_version = state.get("schema_version", 2)
        decision = BypassEvaluator.evaluate(db, mission_id, agent_name, registry, current_schema_version)
        
        task_id = state.get("task_id")
        if task_id:
            from backend.agents.state import write_partial_state

            aggregated_bypass = {}
            if isinstance(state.get("bypass_evaluations"), dict):
                aggregated_bypass.update(state.get("bypass_evaluations", {}))
            if isinstance(state.get("bypass_evaluation"), dict):
                current_agent = state["bypass_evaluation"].get("agent") or state["bypass_evaluation"].get("agent_name") or agent_name
                aggregated_bypass[str(current_agent)] = state["bypass_evaluation"]
            
            observability_payload = {
                "agent": agent_name,
                "decision": "BYPASSED" if decision.can_bypass else "EXECUTED",
                "artifact": decision.artifact,
                "artifact_version": decision.artifact_version,
                "dependency_hash_match": "HASH_MISMATCH" not in decision.reason,
                "lineage_valid": "STALE_VERSION" not in decision.reason,
                "reason": decision.reason
            }
            
            logger.info(f"[BYPASS-EVALUATOR] {agent_name} -> {observability_payload['decision']}: {decision.reason}")
            write_partial_state(task_id, {
                "bypass_evaluation": observability_payload,
                "bypass_evaluations": {
                    **aggregated_bypass,
                    agent_name: observability_payload,
                }
            })
                
        return decision.can_bypass
