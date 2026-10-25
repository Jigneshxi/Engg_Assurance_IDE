from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Dict, List, Tuple

from backend.core.database import SessionLocal
from backend.core.mission_models import MemoryCatalogEntry
from backend.rag.domain_classifier import classify_domain, capability_overlap_score, domain_match_score, load_domain_taxonomy
from backend.rag.memory_classifier import classify_memory_metadata
from backend.rag.recall_models import ConfidenceBand, RecallContext, RecallDecision, RecallStatus
from backend.rag.recall_policy import get_memory_policy, resolve_band

logger = logging.getLogger(__name__)


def _lookup_catalog(memory_key: str) -> MemoryCatalogEntry | None:
    if not memory_key:
        return None
    with SessionLocal() as db:
        return db.query(MemoryCatalogEntry).filter(MemoryCatalogEntry.memory_key == memory_key).first()


def _recency_score(created_at: dt.datetime | None, max_age_days: int) -> float:
    if not created_at:
        return 0.0 if max_age_days else 1.0
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=dt.timezone.utc)
    age_days = max((dt.datetime.now(dt.timezone.utc) - created_at).days, 0)
    if max_age_days <= 0:
        return 0.0
    if age_days >= max_age_days:
        return 0.0
    return round(max(0.0, 1.0 - (age_days / max_age_days)), 4)


def _combine_score(vector_score: float, domain_score: float, capability_score: float, recency_score: float, policy: Dict[str, Any]) -> float:
    vector_weight = float(policy.get("vector_weight", 0.0))
    domain_weight = float(policy.get("domain_weight", 0.0))
    capability_weight = float(policy.get("capability_weight", 0.0))
    recency_weight = float(policy.get("recency_weight", 0.0))
    total_weight = vector_weight + domain_weight + capability_weight + recency_weight
    if total_weight <= 0:
        return round(vector_score, 4)
    combined = (
        (vector_score * vector_weight)
        + (domain_score * domain_weight)
        + (capability_score * capability_weight)
        + (recency_score * recency_weight)
    ) / total_weight
    return round(combined, 4)


def validate_recall_candidates(
    query: str,
    candidates: List[Dict[str, Any]],
    query_context: Dict[str, Any] | None = None,
    memory_type_hint: str | None = None,
) -> RecallDecision:
    query_context = query_context or {}
    query_meta = query_context.get("metadata") if isinstance(query_context, dict) else {}
    query_domain_info = classify_domain(text=query, metadata=query_meta, source=query_context.get("source", "") if isinstance(query_context, dict) else "")
    query_domain = query_domain_info.get("domain", "GENERAL")
    query_capability_tags = list(query_domain_info.get("capability_tags") or [])
    taxonomy_domains = load_domain_taxonomy().get("domains", {})
    query_domain_is_ambiguous = query_domain not in taxonomy_domains or query_domain in {"GENERAL", "GENERIC"}
    query_min_capability_overlap = 0.18 if query_domain_is_ambiguous else 0.0

    accepted_contexts: List[Dict[str, Any]] = []
    rejected_contexts: List[Dict[str, Any]] = []
    provenance: List[Dict[str, Any]] = []
    strongest_band = ConfidenceBand.NONE.value
    strongest_score = 0.0
    dominant_memory_type = "NONE"
    dominant_decision = RecallStatus.NO_MATCH
    dominant_reason = "No valid memory candidates found."
    dominant_domain_match = False
    dominant_recency = 0.0

    if not candidates:
        return RecallDecision(
            status=RecallStatus.NO_MATCH,
            confidence_band=ConfidenceBand.NONE.value,
            memory_type="NONE",
            score=0.0,
            domain_match=False,
            recency_score=0.0,
            reason=dominant_reason,
            query=query,
            query_domain=query_domain,
            query_capability_tags=query_capability_tags,
            memory_classification=query_domain_info,
        )

    for candidate in candidates:
        raw_metadata = candidate.get("metadata") or {}
        memory = classify_memory_metadata(raw_metadata, source=candidate.get("id", ""), content=candidate.get("content", ""))
        catalog_entry = _lookup_catalog(memory.memory_key)
        policy = get_memory_policy(memory.memory_type)
        if memory_type_hint and memory.memory_type != memory_type_hint:
            policy = get_memory_policy(memory_type_hint)

        if catalog_entry and not bool(catalog_entry.governed):
            rejected_contexts.append({
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "score": 0.0,
                "reason": "NON_GOVERNED_MEMORY",
            })
            provenance.append({
                "id": candidate.get("id"),
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "domain": memory.domain,
                "score": 0.0,
                "confidence_band": ConfidenceBand.NONE.value,
                "vector_score": float(candidate.get("confidence", 0.0)) / 100.0,
                "raw_distance": candidate.get("raw_distance"),
                "domain_score": 0.0,
                "capability_overlap_score": 0.0,
                "recency_score": 0.0,
                "domain_match": False,
                "reason": "NON_GOVERNED_MEMORY",
            })
            continue

        vector_score = float(candidate.get("confidence", 0.0)) / 100.0
        raw_distance = candidate.get("raw_distance")
        domain_score = domain_match_score(query_domain, memory.domain)
        capability_score = capability_overlap_score(query_capability_tags, memory.capability_tags)
        created_at = memory.created_at
        if catalog_entry and catalog_entry.source_created_at:
            created_at = catalog_entry.source_created_at
        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=dt.timezone.utc)
        recency_score = _recency_score(created_at, int(policy.get("max_age_days", 0)))
        combined_score = _combine_score(vector_score, domain_score, capability_score, recency_score, policy)
        confidence_band = resolve_band(combined_score)
        memory_policy_minimum = float(policy.get("minimum_score", 0.0))
        allow_cross_domain = bool(policy.get("allow_cross_domain", False))
        required_domain_score = float(policy.get("required_domain_score", 0.0))
        required_capability_overlap = float(policy.get("required_capability_overlap", 0.0))
        allow_weak_matches = bool(policy.get("allow_weak_matches", False))
        relaxed_threshold = min(memory_policy_minimum, 0.35) if query_domain_is_ambiguous else memory_policy_minimum

        if query_domain_is_ambiguous:
            domain_ok = memory.domain in {"GENERAL", "GENERIC"} or (
                capability_score >= max(required_capability_overlap, query_min_capability_overlap)
                and vector_score >= max(relaxed_threshold, 0.25)
            )
        else:
            domain_ok = domain_score >= required_domain_score or allow_cross_domain

        capability_ok = True if not query_capability_tags else capability_score >= max(required_capability_overlap, query_min_capability_overlap)
        recency_required = int(policy.get("max_age_days", 0)) > 0
        recency_ok = not recency_required or recency_score > 0.0
        threshold_ok = combined_score >= relaxed_threshold
        band_ok = confidence_band in {ConfidenceBand.STRONG.value, ConfidenceBand.MODERATE.value} or allow_weak_matches

        provenance.append({
            "id": candidate.get("id"),
            "source": memory.source,
            "memory_key": memory.memory_key,
            "memory_type": memory.memory_type,
            "domain": memory.domain,
            "score": combined_score,
            "confidence_band": confidence_band,
            "vector_score": vector_score,
            "raw_distance": raw_distance,
            "domain_score": domain_score,
            "capability_overlap_score": capability_score,
            "recency_score": recency_score,
            "domain_match": domain_ok,
            "reason": "",
        })

        if not domain_ok:
            rejected_contexts.append({
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "score": combined_score,
                "reason": "DOMAIN_MISMATCH",
            })
            if combined_score > strongest_score:
                strongest_score = combined_score
                strongest_band = confidence_band
                dominant_memory_type = memory.memory_type
                dominant_decision = RecallStatus.REJECTED_DOMAIN
                dominant_reason = "Domain policy rejected the candidate."
                dominant_domain_match = False
                dominant_recency = recency_score
            continue

        if not capability_ok:
            rejected_contexts.append({
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "score": combined_score,
                "reason": "CAPABILITY_MISMATCH",
            })
            if combined_score > strongest_score:
                strongest_score = combined_score
                strongest_band = confidence_band
                dominant_memory_type = memory.memory_type
                dominant_decision = RecallStatus.REJECTED_POLICY
                dominant_reason = "Capability overlap did not satisfy policy."
                dominant_domain_match = True
                dominant_recency = recency_score
            continue

        if not recency_ok:
            rejected_contexts.append({
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "score": combined_score,
                "reason": "REJECTED_RECENCY",
            })
            if combined_score > strongest_score:
                strongest_score = combined_score
                strongest_band = confidence_band
                dominant_memory_type = memory.memory_type
                dominant_decision = RecallStatus.REJECTED_RECENCY
                dominant_reason = "Recency policy rejected the candidate."
                dominant_domain_match = True
                dominant_recency = recency_score
            continue

        if not threshold_ok or not band_ok:
            rejected_contexts.append({
                "source": memory.source,
                "memory_key": memory.memory_key,
                "memory_type": memory.memory_type,
                "score": combined_score,
                "reason": "REJECTED_THRESHOLD",
            })
            if combined_score > strongest_score:
                strongest_score = combined_score
                strongest_band = confidence_band
                dominant_memory_type = memory.memory_type
                dominant_decision = RecallStatus.REJECTED_THRESHOLD
                dominant_reason = "Score below acceptance threshold."
                dominant_domain_match = True
                dominant_recency = recency_score
            continue

        accepted_context = {
            "source": memory.source,
            "memory_key": memory.memory_key,
            "memory_type": memory.memory_type,
            "domain": memory.domain,
            "capability_tags": memory.capability_tags,
            "score": combined_score,
            "confidence_band": confidence_band,
            "content": candidate.get("content", "")[:2500],
            "metadata": memory.raw,
            "vector_score": vector_score,
            "raw_distance": raw_distance,
            "domain_score": domain_score,
            "capability_overlap_score": capability_score,
            "recency_score": recency_score,
            "accepted_reason": "POLICY_ACCEPTED",
        }
        accepted_contexts.append(accepted_context)
        if combined_score > strongest_score:
            strongest_score = combined_score
            strongest_band = confidence_band
            dominant_memory_type = memory.memory_type
            dominant_decision = RecallStatus.ACCEPTED if confidence_band == ConfidenceBand.STRONG.value else RecallStatus.ACCEPTED_WITH_WARNING
            dominant_reason = "Accepted governed memory context."
            dominant_domain_match = True
            dominant_recency = recency_score

    if accepted_contexts:
        return RecallDecision(
            status=dominant_decision,
            confidence_band=strongest_band,
            memory_type=dominant_memory_type,
            score=strongest_score,
            domain_match=dominant_domain_match,
            recency_score=dominant_recency,
            accepted_contexts=accepted_contexts,
            rejected_contexts=rejected_contexts,
            provenance=provenance,
            reason=dominant_reason,
            query=query,
            query_domain=query_domain,
            query_capability_tags=query_capability_tags,
            memory_classification=query_domain_info,
        )

    if strongest_score <= 0.0:
        dominant_reason = "No candidate satisfied governed recall policy."
        dominant_decision = RecallStatus.NO_MATCH

    return RecallDecision(
        status=dominant_decision,
        confidence_band=strongest_band,
        memory_type=dominant_memory_type,
        score=strongest_score,
        domain_match=dominant_domain_match,
        recency_score=dominant_recency,
        accepted_contexts=[],
        rejected_contexts=rejected_contexts,
        provenance=provenance,
        reason=dominant_reason,
        query=query,
        query_domain=query_domain,
        query_capability_tags=query_capability_tags,
        memory_classification=query_domain_info,
    )
