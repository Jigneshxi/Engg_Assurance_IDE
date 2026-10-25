from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any, Dict, List

from backend.rag.domain_classifier import classify_domain, load_domain_taxonomy
from backend.rag.recall_policy import load_recall_policy
from backend.rag.recall_models import MemoryMetadata

logger = logging.getLogger(__name__)


def _normalize_tags(tags: Any) -> List[str]:
    if not tags:
        return []
    if isinstance(tags, str):
        text = tags.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                tags = parsed
            elif isinstance(parsed, str):
                tags = [parsed]
            else:
                tags = [str(parsed)]
        except Exception:
            tags = [item.strip() for item in text.split(",") if item.strip()] or [text]
    return sorted({str(tag).strip().lower() for tag in tags if str(tag).strip()})


def _parse_datetime(value: Any) -> dt.datetime | None:
    if not value:
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        text = value.strip()
        for parser in (dt.datetime.fromisoformat,):
            try:
                parsed = parser(text.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=dt.timezone.utc)
                return parsed
            except Exception:
                continue
    return None


def normalize_memory_type(memory_type: Any, legacy_type: Any = None) -> str:
    policy = load_recall_policy()
    aliases = policy.get("type_aliases", {})
    candidate = str(memory_type or legacy_type or policy.get("default_memory_type", "HISTORICAL_PROJECT")).strip()
    if not candidate:
        candidate = str(policy.get("default_memory_type", "HISTORICAL_PROJECT")).strip()
    alias_key = candidate.lower()
    mapped = aliases.get(alias_key, candidate)
    return str(mapped).upper()


def normalize_memory_metadata(metadata: Dict[str, Any] | None, source: str = "", content: str = "") -> Dict[str, Any]:
    meta = dict(metadata or {})
    taxonomy = load_domain_taxonomy()
    policy = load_recall_policy()
    explicit_source = str(meta.get("source") or source or "").strip()
    meta["source"] = explicit_source

    memory_type = normalize_memory_type(meta.get("memory_type"), meta.get("type"))
    meta["memory_type"] = memory_type
    if not meta.get("type"):
        legacy_type = None
        for alias_name, canonical in policy.get("type_aliases", {}).items():
            if str(canonical).upper() == memory_type:
                legacy_type = alias_name
                break
        meta["type"] = legacy_type or memory_type.lower()
    if not meta.get("memory_key") and meta.get("chunk_id"):
        meta["memory_key"] = str(meta.get("chunk_id"))

    domain_hint = classify_domain(text=content, metadata=meta, source=explicit_source)
    meta["domain"] = str(meta.get("domain") or domain_hint.get("domain") or taxonomy.get("fallback_domain", "GENERAL")).upper()
    meta["capability_tags"] = _normalize_tags(meta.get("capability_tags") or domain_hint.get("capability_tags"))

    created_at = _parse_datetime(meta.get("created_at"))
    if created_at is None:
        created_at = dt.datetime.now(dt.timezone.utc)
        meta["created_at"] = created_at.isoformat()
        meta["_created_at_inferred"] = True
    else:
        meta["created_at"] = created_at.isoformat()
        meta["_created_at_inferred"] = False

    version = meta.get("version", 1)
    try:
        meta["version"] = int(version or 1)
    except Exception:
        meta["version"] = 1

    governed = bool(meta.get("source")) and bool(meta.get("memory_type")) and bool(meta.get("domain"))
    meta["governed"] = governed
    return meta


def classify_memory_metadata(metadata: Dict[str, Any] | None, source: str = "", content: str = "") -> MemoryMetadata:
    normalized = normalize_memory_metadata(metadata, source=source, content=content)
    created_at = _parse_datetime(normalized.get("created_at"))
    return MemoryMetadata(
        memory_key=str(normalized.get("memory_key") or normalized.get("chunk_id") or source),
        memory_type=str(normalized.get("memory_type") or "HISTORICAL_PROJECT").upper(),
        domain=str(normalized.get("domain") or "GENERAL").upper(),
        capability_tags=list(normalized.get("capability_tags") or []),
        source=str(normalized.get("source") or source),
        created_at=created_at,
        version=int(normalized.get("version") or 1),
        governed=bool(normalized.get("governed", True)),
        raw=normalized,
    )


def build_memory_metadata_json(metadata: Dict[str, Any] | None, source: str = "", content: str = "") -> str:
    return json.dumps(normalize_memory_metadata(metadata, source=source, content=content), default=str)
