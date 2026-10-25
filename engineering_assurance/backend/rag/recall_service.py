from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.rag.recall_models import RecallDecision, RecallStatus
from backend.rag.recall_telemetry import record_recall_audit
from backend.rag.recall_validator import validate_recall_candidates
from backend.rag.retrieval_engine import retrieve_candidates

logger = logging.getLogger(__name__)


def _summarize_candidates(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not candidates:
        return {
            "raw_matches": 0,
            "top_score": None,
            "top_document": None,
            "top_source": None,
            "scores": [],
            "sources": [],
        }

    top_candidate = candidates[0] or {}
    scores = [candidate.get("confidence") for candidate in candidates if candidate.get("confidence") is not None]
    sources = []
    for candidate in candidates:
        metadata = candidate.get("metadata") or {}
        sources.append({
            "id": candidate.get("id"),
            "source": metadata.get("source") or candidate.get("id"),
            "type": metadata.get("type"),
            "confidence": candidate.get("confidence"),
            "vector_similarity": candidate.get("vector_similarity"),
            "raw_distance": candidate.get("raw_distance"),
        })

    return {
        "raw_matches": len(candidates),
        "top_score": top_candidate.get("confidence"),
        "top_document": top_candidate.get("id"),
        "top_source": (top_candidate.get("metadata") or {}).get("source") or top_candidate.get("id"),
        "scores": scores,
        "sources": sources,
    }


def governed_recall(
    query: str,
    n_results: int = 3,
    metadata_filter: Optional[Dict[str, Any]] = None,
    memory_type_hint: Optional[str] = None,
    query_context: Optional[Dict[str, Any]] = None,
    mission_id: Optional[int] = None,
    exclude_synthetic: bool = True,
) -> RecallDecision:
    candidates = retrieve_candidates(
        query,
        n_results=n_results,
        metadata_filter=metadata_filter,
        exclude_synthetic=exclude_synthetic,
    )
    candidate_summary = _summarize_candidates(candidates)
    logger.info(
        "[RAG-RECALL] query=%r raw_candidates=%s top_confidence=%s metadata_filter=%s",
        query[:180] if query else "",
        candidate_summary["raw_matches"],
        candidate_summary["top_score"],
        metadata_filter,
    )
    decision = validate_recall_candidates(
        query=query,
        candidates=candidates,
        query_context=query_context or {},
        memory_type_hint=memory_type_hint,
    )
    logger.info(
        "[RAG-RECALL] decision=%s band=%s score=%.4f accepted=%s rejected=%s reason=%s query_domain=%s",
        decision.status.value if hasattr(decision.status, "value") else decision.status,
        decision.confidence_band,
        decision.score,
        len(decision.accepted_contexts),
        len(decision.rejected_contexts),
        decision.reason,
        decision.query_domain,
    )
    logger.info(
        "[RAG-RECALL-DIAG] %s",
        {
            "query": query,
            "raw_matches": candidate_summary["raw_matches"],
            "top_score": candidate_summary["top_score"],
            "top_document": candidate_summary["top_document"],
            "top_source": candidate_summary["top_source"],
            "scores": candidate_summary["scores"][:10],
            "sources": candidate_summary["sources"][:10],
            "validator_decision": decision.status.value if hasattr(decision.status, "value") else decision.status,
            "validator_reason": decision.reason,
            "query_domain": decision.query_domain,
        },
    )
    record_recall_audit(mission_id=mission_id, decision=decision, query=query)
    return decision


def build_recall_context(decision: RecallDecision, accepted_limit: int = 2) -> str:
    accepted = decision.accepted_contexts[:accepted_limit]
    if not accepted:
        return ""

    sections: List[str] = []
    for item in accepted:
        section = [
            f"[APPROVED MEMORY] '{item.get('source', '')}'",
            f"Type: {item.get('memory_type', 'UNKNOWN')}",
            f"Domain: {item.get('domain', 'GENERAL')}",
            f"Confidence: {item.get('confidence_band', 'NONE')} ({item.get('score', 0.0):.2f})",
        ]
        content = str(item.get("content") or "").strip()
        if content:
            section.append(content[:2500])
        sections.append("\n".join(section))

    return "\n\n".join(sections)


def recall_is_accepted(decision: RecallDecision) -> bool:
    return decision.status in {RecallStatus.ACCEPTED, RecallStatus.ACCEPTED_WITH_WARNING} and bool(decision.accepted_contexts)
