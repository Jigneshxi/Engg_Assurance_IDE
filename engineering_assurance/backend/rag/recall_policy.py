from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

POLICY_PATH = Path(__file__).with_name("recall_policy.json")


def load_recall_policy() -> Dict[str, Any]:
    with POLICY_PATH.open("r", encoding="utf-8") as handle:
        policy = json.load(handle)
    return policy


def get_memory_policy(memory_type: str) -> Dict[str, Any]:
    policy = load_recall_policy()
    memory_types = policy.get("memory_types", {})
    default_policy = policy.get("default", {})
    return {**default_policy, **memory_types.get(memory_type, {})}


def resolve_band(score: float) -> str:
    policy = load_recall_policy()
    bands = sorted(policy.get("confidence_bands", []), key=lambda item: float(item.get("minimum_score", 0.0)), reverse=True)
    for band in bands:
        if score >= float(band.get("minimum_score", 0.0)):
            return str(band.get("name", "NONE"))
    return "NONE"


def validate_recall_policy() -> Tuple[bool, List[str]]:
    policy = load_recall_policy()
    issues: List[str] = []

    bands = policy.get("confidence_bands", [])
    if not bands:
        issues.append("Missing confidence_bands policy.")
    else:
        thresholds = [float(item.get("minimum_score", -1)) for item in bands]
        if thresholds != sorted(thresholds, reverse=True):
            issues.append("confidence_bands must be ordered from strongest to weakest.")
        if any(a == b for a, b in zip(thresholds, thresholds[1:])):
            issues.append("confidence_bands contain overlapping thresholds.")

    memory_types = policy.get("memory_types", {})
    if not memory_types:
        issues.append("Missing memory_types policy.")
    else:
        for memory_type, definition in memory_types.items():
            if float(definition.get("minimum_score", -1)) < 0:
                issues.append(f"{memory_type}: minimum_score is missing or invalid.")
            if int(definition.get("max_results", 0)) <= 0:
                issues.append(f"{memory_type}: max_results must be greater than zero.")
            if int(definition.get("max_age_days", 0)) <= 0:
                issues.append(f"{memory_type}: max_age_days must be greater than zero.")
            if float(definition.get("vector_weight", 0)) + float(definition.get("domain_weight", 0)) + float(definition.get("capability_weight", 0)) + float(definition.get("recency_weight", 0)) <= 0:
                issues.append(f"{memory_type}: weighting must be greater than zero.")

    if not policy.get("type_aliases"):
        issues.append("Missing type_aliases policy.")
    if not policy.get("default_memory_type"):
        issues.append("Missing default_memory_type policy.")

    logger.info("[RAG-POLICY] Validation completed with %s issue(s).", len(issues))
    return len(issues) == 0, issues
