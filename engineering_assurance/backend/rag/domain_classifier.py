from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

DOMAIN_PATH = Path(__file__).with_name("domain_taxonomy.json")

AUTHENTICATION_SIGNAL_TERMS = {
    "login",
    "log in",
    "signin",
    "sign in",
    "signup",
    "sign up",
    "register",
    "registration",
    "password",
    "email",
    "username",
    "otp",
    "authentication",
    "identity",
    "account",
}


@lru_cache(maxsize=1)
def load_domain_taxonomy() -> Dict[str, Any]:
    with DOMAIN_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def _keywords_for_domain(domain_definition: Dict[str, Any]) -> List[str]:
    keywords = [kw.lower() for kw in domain_definition.get("keywords", [])]
    return keywords


def _normalize_tag_list(tags: Any) -> List[str]:
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
    return [str(tag).strip().lower() for tag in tags if str(tag).strip()]


def classify_domain(text: str = "", metadata: Dict[str, Any] | None = None, source: str = "") -> Dict[str, Any]:
    taxonomy = load_domain_taxonomy()
    domains = taxonomy.get("domains", {})
    combined = " ".join(part for part in [text or "", source or "", json.dumps(metadata or {}, default=str)] if part).lower()
    tokens = set(_tokenize(combined))
    auth_hits = [term for term in AUTHENTICATION_SIGNAL_TERMS if term in combined]

    # Strong heuristic: authentication queries should not fall back to GENERAL.
    # The taxonomy now includes a dedicated AUTHENTICATION domain, but we keep
    # this direct path so login/session intent is classified deterministically.
    if auth_hits and "AUTHENTICATION" in domains:
        capability_tags = _extract_capabilities("AUTHENTICATION", metadata, combined)
        capability_tags = _augment_auth_capabilities(capability_tags, combined)
        return {
            "domain": "AUTHENTICATION",
            "confidence": 0.99,
            "matched_keywords": auth_hits,
            "capability_tags": capability_tags,
        }

    explicit_domain = str((metadata or {}).get("domain") or "").strip().upper()
    if explicit_domain and explicit_domain in domains:
        capability_tags = _extract_capabilities(explicit_domain, metadata, combined)
        capability_tags = _augment_auth_capabilities(capability_tags, combined)
        return {
            "domain": explicit_domain,
            "confidence": 1.0,
            "matched_keywords": [],
            "capability_tags": capability_tags,
        }

    scored: List[Tuple[str, float, List[str]]] = []
    for domain_name, definition in domains.items():
        keywords = _keywords_for_domain(definition)
        priority_keywords = [kw.lower() for kw in definition.get("priority_keywords", [])]
        capability_keywords = [str(item).lower() for item in definition.get("capabilities", [])]
        matched = [kw for kw in keywords if kw in combined or kw in tokens]
        priority_matches = [kw for kw in priority_keywords if kw in combined or kw in tokens]
        capability_matches = [cap for cap in capability_keywords if cap in combined or cap.replace("_", " ") in combined]
        if auth_hits and "authentication" in capability_keywords:
            capability_matches.append("authentication")
        score = 0.0
        if keywords:
            score = len(matched) / len(keywords)
        if matched:
            score = min(1.0, score + (len(matched) * 0.05))
        if priority_matches:
            score = min(1.0, score + (len(priority_matches) * 0.35))
        if capability_matches:
            score = min(1.0, score + (len(set(capability_matches)) * 0.22))
        scored.append((domain_name, score, matched))

    scored.sort(key=lambda item: item[1], reverse=True)
    best_domain, best_score, matched_keywords = scored[0] if scored else (taxonomy.get("fallback_domain", "GENERAL"), 0.0, [])
    if best_score <= 0:
        best_domain = taxonomy.get("fallback_domain", "GENERAL")
    elif best_domain in {"GENERIC", "GENERAL"}:
        non_generic = [item for item in scored if item[0] not in {"GENERIC", "GENERAL"} and item[1] > 0]
        if non_generic:
            # Prefer a concrete business domain whenever we have any signal for it.
            best_domain, best_score, matched_keywords = max(
                non_generic,
                key=lambda item: (item[1], len(item[2]), item[0] != "GENERIC"),
            )

    capability_tags = _extract_capabilities(best_domain, metadata, combined, matched_keywords=matched_keywords)
    capability_tags = _augment_auth_capabilities(capability_tags, combined)
    return {
        "domain": best_domain,
        "confidence": round(best_score, 4),
        "matched_keywords": matched_keywords,
        "capability_tags": capability_tags,
    }


def _extract_capabilities(
    domain_name: str,
    metadata: Dict[str, Any] | None,
    combined_text: str,
    matched_keywords: List[str] | None = None
) -> List[str]:
    taxonomy = load_domain_taxonomy()
    domain_definition = taxonomy.get("domains", {}).get(domain_name, {})
    capabilities = [str(item).lower() for item in domain_definition.get("capabilities", [])]
    existing = []
    if metadata:
        raw_tags = metadata.get("capability_tags") or metadata.get("capabilities") or []
        existing = _normalize_tag_list(raw_tags)

    detected = set(existing)
    searchable = combined_text.lower()
    for capability in capabilities:
        if capability and capability in searchable:
            detected.add(capability)

    if matched_keywords:
        detected.update(keyword.replace(" ", "_") for keyword in matched_keywords)

    return sorted(detected)


def _augment_auth_capabilities(capabilities: List[str], combined_text: str) -> List[str]:
    detected = set(str(item).strip().lower() for item in capabilities if str(item).strip())
    text = combined_text.lower()
    if any(term in text for term in AUTHENTICATION_SIGNAL_TERMS):
        detected.update({"authentication", "login", "identity"})
        if any(term in text for term in ("register", "registration", "signup", "sign up")):
            detected.add("registration")
        if "email" in text:
            detected.add("email")
        if "password" in text:
            detected.add("password")
        if "otp" in text:
            detected.add("otp")
    return sorted(detected)


def capability_overlap_score(query_tags: List[str], candidate_tags: List[str]) -> float:
    query_set = {str(tag).strip().lower() for tag in query_tags if str(tag).strip()}
    candidate_set = {str(tag).strip().lower() for tag in candidate_tags if str(tag).strip()}
    if not query_set or not candidate_set:
        return 0.0
    overlap = query_set.intersection(candidate_set)
    return round(len(overlap) / max(len(query_set), len(candidate_set)), 4)


def domain_match_score(query_domain: str, candidate_domain: str) -> float:
    if not query_domain or not candidate_domain:
        return 0.0
    if query_domain == candidate_domain:
        return 1.0
    if query_domain in {"GENERAL", "GENERIC"} or candidate_domain in {"GENERAL", "GENERIC"}:
        return 0.0

    taxonomy = load_domain_taxonomy()
    query_def = taxonomy.get("domains", {}).get(query_domain, {})
    candidate_def = taxonomy.get("domains", {}).get(candidate_domain, {})
    query_caps = {str(item).lower() for item in query_def.get("capabilities", [])}
    candidate_caps = {str(item).lower() for item in candidate_def.get("capabilities", [])}
    if query_caps and candidate_caps:
        overlap = query_caps.intersection(candidate_caps)
        if overlap:
            return round(len(overlap) / max(len(query_caps), len(candidate_caps)), 4)
    return 0.0
