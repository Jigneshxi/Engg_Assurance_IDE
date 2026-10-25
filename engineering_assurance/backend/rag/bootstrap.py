from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Dict, List

from backend.core.database import SessionLocal, engine
from backend.core.mission_models import MemoryCatalogEntry
from backend.core.vector_db import vector_store
from backend.rag.memory_classifier import classify_memory_metadata
from backend.rag.recall_policy import validate_recall_policy

logger = logging.getLogger(__name__)


def _parse_datetime(value: Any) -> dt.datetime | None:
    if not value:
        return None
    if isinstance(value, dt.datetime):
        return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)
    if isinstance(value, str):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
        except Exception:
            return None
    return None


def validate_memory_catalog() -> Dict[str, Any]:
    MemoryCatalogEntry.__table__.create(bind=engine, checkfirst=True)
    data = vector_store.collection.get()
    ids = data.get("ids", []) or []
    metadatas = data.get("metadatas", []) or []
    documents = data.get("documents", []) or []
    issues: List[str] = []
    governed = 0
    non_governed = 0

    with SessionLocal() as db:
        for index, memory_key in enumerate(ids):
            metadata = metadatas[index] if index < len(metadatas) else {}
            content = documents[index] if index < len(documents) else ""
            classified = classify_memory_metadata(metadata, source=str(memory_key), content=str(content))
            if classified.governed:
                governed += 1
            else:
                non_governed += 1
                issues.append(f"{memory_key}: missing required memory metadata")

            source_created_at = classified.created_at or _parse_datetime((metadata or {}).get("created_at")) or dt.datetime.now(dt.timezone.utc)
            entry = db.query(MemoryCatalogEntry).filter(MemoryCatalogEntry.memory_key == str(memory_key)).first()
            if not entry:
                entry = MemoryCatalogEntry(memory_key=str(memory_key))
                db.add(entry)

            entry.source = classified.source or str(memory_key)
            entry.memory_type = classified.memory_type
            entry.domain = classified.domain
            entry.capability_tags = classified.capability_tags
            entry.version = classified.version
            entry.source_created_at = source_created_at
            entry.governed = classified.governed
            entry.metadata_json = classified.raw

        db.commit()

    return {
        "count": len(ids),
        "governed": governed,
        "non_governed": non_governed,
        "issues": issues,
    }


def bootstrap_governed_memory() -> Dict[str, Any]:
    policy_ok, policy_issues = validate_recall_policy()
    catalog_summary = validate_memory_catalog()
    logger.info(
        "[RAG-BOOTSTRAP] policy_ok=%s, catalog_count=%s, governed=%s, non_governed=%s",
        policy_ok,
        catalog_summary.get("count", 0),
        catalog_summary.get("governed", 0),
        catalog_summary.get("non_governed", 0),
    )
    for issue in policy_issues:
        logger.warning("[RAG-POLICY] %s", issue)
    for issue in catalog_summary.get("issues", []):
        logger.warning("[RAG-CATALOG] %s", issue)
    return {
        "policy_ok": policy_ok,
        "policy_issues": policy_issues,
        "catalog": catalog_summary,
    }
