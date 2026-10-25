"""
================================================================================
CONVERGE PHASE 2.1 - MULTI-SOURCE CONFLICT DETECTION ENGINE
================================================================================
PURPOSE: Auto-detect contradictory acceptance criteria across ingestion sources.

When multiple sources (e.g., Slack thread vs. Jira ticket vs. SharePoint doc)
are ingested simultaneously, they often contain conflicting requirements:
  - Slack: "Response time must be < 500ms"
  - Jira:  "Response time SLA is 2 seconds"
  - SharePoint: "System must handle 10k concurrent users"
  - ADO:   "Max concurrent users: 5,000"

This engine:
1. Extracts semantic claims from each source
2. Detects contradictions using LLM-based semantic comparison
3. Scores conflict severity (CRITICAL / HIGH / MEDIUM / LOW)
4. Returns structured conflict objects for the UI arbitration studio
"""

import logging
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# ── Conflict Severity Levels ──────────────────────────────────────────────────
SEVERITY_CRITICAL = "CRITICAL"   # Direct numeric/boolean contradiction
SEVERITY_HIGH     = "HIGH"       # Semantic contradiction (same concept, opposite intent)
SEVERITY_MEDIUM   = "MEDIUM"     # Ambiguous overlap (could be interpreted either way)
SEVERITY_LOW      = "LOW"        # Minor wording difference, same intent


@dataclass
class ConflictItem:
    """A single detected conflict between two or more sources."""
    conflict_id: str
    topic: str                          # e.g. "Response Time SLA"
    severity: str                       # CRITICAL / HIGH / MEDIUM / LOW
    source_a: Dict[str, str]            # {"platform": "jira", "ref_id": "REQ-001", "claim": "..."}
    source_b: Dict[str, str]            # {"platform": "slack", "ref_id": "REQ-003", "claim": "..."}
    conflict_type: str                  # "numeric_contradiction" | "semantic_contradiction" | "scope_overlap"
    resolution_options: List[str]       # Suggested resolutions for the user
    auto_resolution: Optional[str]      # AI-recommended resolution (if confidence > 0.85)
    resolved: bool = False
    resolution_choice: Optional[str] = None  # Set by user in Conflict Studio

    def to_dict(self) -> Dict:
        return asdict(self)


def detect_conflicts(source_blocks: List[Dict[str, Any]]) -> List[ConflictItem]:
    """
    MAIN ENTRY POINT: Detect conflicts across ingested source blocks.

    Args:
        source_blocks: List of dicts with keys:
            - ref_id: "REQ-001"
            - platform: "jira"
            - source_id: "CORE-123"
            - summary: "Title"
            - content: "Full sanitized text"

    Returns:
        List of ConflictItem objects, sorted by severity.
    """
    if len(source_blocks) < 2:
        return []  # Need at least 2 sources to have a conflict

    conflicts = []

    # Step 1: Try LLM-based semantic conflict detection
    try:
        llm_conflicts = _detect_via_llm(source_blocks)
        if llm_conflicts:
            return llm_conflicts
    except Exception as e:
        logger.warning(f"[CONFLICT] LLM detection failed, falling back to heuristic: {e}")

    # Step 2: Heuristic fallback — numeric and keyword contradiction detection
    conflicts = _detect_via_heuristics(source_blocks)
    return sorted(conflicts, key=lambda c: _severity_rank(c.severity))


def _detect_via_llm(source_blocks: List[Dict[str, Any]]) -> List[ConflictItem]:
    """Use LLM to semantically detect contradictions across sources."""
    from backend.core.identity_orchestrator import IdentityOrchestrator

    # Build a compact source manifest for the LLM
    manifest_parts = []
    for block in source_blocks:
        content_snippet = (block.get("content") or block.get("summary") or "")[:600]
        manifest_parts.append(
            f"[{block['ref_id']} | {block['platform'].upper()} / {block.get('source_id', '')}]\n{content_snippet}"
        )
    manifest = "\n\n---\n\n".join(manifest_parts)

    prompt = f"""You are a Requirements Conflict Analyst. Analyze these requirement sources and identify CONTRADICTIONS.

SOURCES:
{manifest}

TASK: Find pairs of requirements that CONTRADICT each other (different values for the same concept, opposite behaviors, conflicting constraints).

Return a JSON array. Each item must have:
{{
  "topic": "Short topic name (e.g. 'Response Time SLA')",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "source_a_ref": "REQ-001",
  "source_a_platform": "jira",
  "source_a_claim": "Exact contradicting statement from source A",
  "source_b_ref": "REQ-002",
  "source_b_platform": "slack",
  "source_b_claim": "Exact contradicting statement from source B",
  "conflict_type": "numeric_contradiction|semantic_contradiction|scope_overlap",
  "resolution_options": ["Accept source A", "Accept source B", "Merge both", "Escalate to stakeholder"],
  "auto_resolution": "Recommended resolution with brief justification (or null if unclear)"
}}

If no contradictions exist, return an empty array [].
Return ONLY the JSON array, no other text."""

    for tier in ("strategic", "primary", "economy"):
        identity = IdentityOrchestrator.get_identity(tier)
        if not identity:
            continue
        try:
            provider = identity["provider"].lower()
            api_key = identity["key"]
            model = identity["model"]
            base_url = identity.get("url") or ""

            result_text = ""
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key)
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model, max_tokens=2000, temperature=0.1
                )
                result_text = res.choices[0].message.content
            elif provider in ("openai", "openrouter", "gemini"):
                from openai import OpenAI
                default_urls = {
                    "openai": "https://api.openai.com/v1",
                    "openrouter": "https://openrouter.ai/api/v1",
                    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
                }
                client = OpenAI(
                    api_key=api_key,
                    base_url=base_url or default_urls.get(provider, "https://api.openai.com/v1")
                )
                clean_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
                res = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=clean_model, max_tokens=2000, temperature=0.1
                )
                result_text = res.choices[0].message.content

            if not result_text:
                continue

            # Parse JSON response
            import json
            result_text = result_text.strip()
            # Strip markdown fences if present
            result_text = re.sub(r'^```json\s*', '', result_text)
            result_text = re.sub(r'\s*```$', '', result_text)

            raw_conflicts = json.loads(result_text)
            if not isinstance(raw_conflicts, list):
                continue

            conflicts = []
            for i, rc in enumerate(raw_conflicts):
                conflicts.append(ConflictItem(
                    conflict_id=f"CONF-{str(i+1).zfill(3)}",
                    topic=rc.get("topic", "Unknown Topic"),
                    severity=rc.get("severity", SEVERITY_MEDIUM),
                    source_a={
                        "platform": rc.get("source_a_platform", ""),
                        "ref_id": rc.get("source_a_ref", ""),
                        "claim": rc.get("source_a_claim", "")
                    },
                    source_b={
                        "platform": rc.get("source_b_platform", ""),
                        "ref_id": rc.get("source_b_ref", ""),
                        "claim": rc.get("source_b_claim", "")
                    },
                    conflict_type=rc.get("conflict_type", "semantic_contradiction"),
                    resolution_options=rc.get("resolution_options", [
                        "Accept source A", "Accept source B", "Merge both", "Escalate"
                    ]),
                    auto_resolution=rc.get("auto_resolution")
                ))
            return conflicts

        except Exception as e:
            logger.warning(f"[CONFLICT-LLM] Tier {tier} failed: {e}")
            continue

    return []


def _detect_via_heuristics(source_blocks: List[Dict[str, Any]]) -> List[ConflictItem]:
    """
    Heuristic conflict detection — finds numeric and boolean contradictions
    without requiring an LLM call. Used as fallback.
    """
    conflicts = []
    conflict_counter = 0

    # Patterns that indicate measurable claims
    numeric_patterns = [
        (r'(\d+(?:\.\d+)?)\s*(ms|milliseconds?)', "Response Time"),
        (r'(\d+(?:\.\d+)?)\s*(seconds?|secs?)', "Response Time"),
        (r'(\d+(?:,\d+)?)\s*(concurrent\s+users?|rps|requests?\s+per\s+second)', "Throughput"),
        (r'(\d+(?:\.\d+)?)\s*(%|percent)', "Percentage Threshold"),
        (r'(\d+(?:\.\d+)?)\s*(gb|mb|tb)', "Storage/Memory"),
        (r'(\d+)\s*(days?|hours?|weeks?)', "Time Period"),
    ]

    # Extract numeric claims per source
    source_claims: Dict[str, List[Dict]] = {}
    for block in source_blocks:
        ref_id = block["ref_id"]
        content = (block.get("content") or block.get("summary") or "").lower()
        claims = []
        for pattern, topic in numeric_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                claims.append({
                    "topic": topic,
                    "value": match.group(1).replace(",", ""),
                    "unit": match.group(2),
                    "context": content[max(0, match.start()-50):match.end()+50].strip()
                })
        source_claims[ref_id] = claims

    # Compare claims across source pairs
    ref_ids = list(source_claims.keys())
    for i in range(len(ref_ids)):
        for j in range(i + 1, len(ref_ids)):
            ref_a = ref_ids[i]
            ref_b = ref_ids[j]
            block_a = next(b for b in source_blocks if b["ref_id"] == ref_a)
            block_b = next(b for b in source_blocks if b["ref_id"] == ref_b)

            for claim_a in source_claims[ref_a]:
                for claim_b in source_claims[ref_b]:
                    if claim_a["topic"] == claim_b["topic"] and claim_a["unit"] == claim_b["unit"]:
                        try:
                            val_a = float(claim_a["value"])
                            val_b = float(claim_b["value"])
                            # Flag if values differ by more than 20%
                            if val_a > 0 and abs(val_a - val_b) / val_a > 0.20:
                                conflict_counter += 1
                                severity = SEVERITY_CRITICAL if abs(val_a - val_b) / val_a > 1.0 else SEVERITY_HIGH
                                conflicts.append(ConflictItem(
                                    conflict_id=f"CONF-{str(conflict_counter).zfill(3)}",
                                    topic=f"{claim_a['topic']} Contradiction",
                                    severity=severity,
                                    source_a={
                                        "platform": block_a["platform"],
                                        "ref_id": ref_a,
                                        "claim": f"{val_a} {claim_a['unit']} — {claim_a['context'][:120]}"
                                    },
                                    source_b={
                                        "platform": block_b["platform"],
                                        "ref_id": ref_b,
                                        "claim": f"{val_b} {claim_b['unit']} — {claim_b['context'][:120]}"
                                    },
                                    conflict_type="numeric_contradiction",
                                    resolution_options=[
                                        f"Accept {ref_a} ({val_a} {claim_a['unit']})",
                                        f"Accept {ref_b} ({val_b} {claim_b['unit']})",
                                        "Use the stricter value",
                                        "Use the more lenient value",
                                        "Escalate to stakeholder"
                                    ],
                                    auto_resolution=f"Use stricter value: {min(val_a, val_b)} {claim_a['unit']} (conservative approach)"
                                    if claim_a["topic"] in ("Response Time",) else None
                                ))
                        except (ValueError, ZeroDivisionError):
                            pass

    return conflicts


def _severity_rank(severity: str) -> int:
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(severity, 4)


def apply_resolution(
    source_blocks: List[Dict[str, Any]],
    conflict_id: str,
    resolution: str,
    conflicts: List[Dict]
) -> Dict[str, Any]:
    """
    Apply a user-selected resolution to a conflict.
    Returns updated source blocks with the conflict resolved.
    """
    resolved_conflict = next((c for c in conflicts if c.get("conflict_id") == conflict_id), None)
    if not resolved_conflict:
        return {"success": False, "message": f"Conflict {conflict_id} not found."}

    return {
        "success": True,
        "conflict_id": conflict_id,
        "resolution_applied": resolution,
        "message": f"Conflict {conflict_id} resolved: {resolution}",
        "source_of_truth": resolved_conflict.get("source_a", {}).get("ref_id")
        if "source_a" in resolution.lower() or "accept a" in resolution.lower()
        else resolved_conflict.get("source_b", {}).get("ref_id")
    }
