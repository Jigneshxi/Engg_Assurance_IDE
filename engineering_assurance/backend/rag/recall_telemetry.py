from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List

from backend.core.database import SessionLocal, engine
from backend.core.mission_models import RecallAudit
from backend.rag.recall_models import RecallDecision

logger = logging.getLogger(__name__)


def record_recall_audit(mission_id: int | None, decision: RecallDecision, query: str | None = None) -> None:
    try:
        RecallAudit.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as db:
            audit_rows: List[RecallAudit] = []
            accepted_by_source = {item.get("memory_key"): item for item in decision.accepted_contexts}

            for item in decision.provenance or []:
                memory_key = str(item.get("memory_key") or item.get("id") or "")
                accepted = accepted_by_source.get(memory_key)
                rejected = None
                if not accepted:
                    rejected = next((row for row in decision.rejected_contexts if str(row.get("memory_key") or "") == memory_key), None)

                audit_rows.append(
                    RecallAudit(
                        mission_id=mission_id,
                        query=query or decision.query,
                        candidate_source=str(item.get("source") or ""),
                        memory_key=memory_key,
                        memory_type=str(item.get("memory_type") or decision.memory_type),
                        domain=str(item.get("domain") or decision.query_domain),
                        score=float(item.get("score") or 0.0),
                        confidence_band=str(item.get("confidence_band") or decision.confidence_band),
                        decision=str(decision.status.value if hasattr(decision.status, "value") else decision.status),
                        reason=str(accepted.get("accepted_reason") if accepted else (rejected.get("reason") if rejected else decision.reason)),
                        domain_match=bool(item.get("domain_match", False)),
                        recency_score=float(item.get("recency_score") or 0.0),
                        capability_overlap_score=float(item.get("capability_overlap_score") or 0.0),
                        injected=bool(accepted),
                        accepted_context=accepted,
                        rejected_context=rejected,
                    )
                )

            if audit_rows:
                db.add_all(audit_rows)
                db.commit()
    except Exception as exc:
        logger.warning("[RAG-TELEMETRY] Failed to persist recall audit: %s", exc)


def recall_summary(decisions: Iterable[RecallDecision]) -> Dict[str, Any]:
    accepted = 0
    rejected = 0
    for decision in decisions:
        accepted += len(decision.accepted_contexts)
        rejected += len(decision.rejected_contexts)
    return {
        "accepted": accepted,
        "rejected": rejected,
    }
