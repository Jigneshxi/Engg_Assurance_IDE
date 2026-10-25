from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class RecallStatus(str, Enum):
    ACCEPTED = "ACCEPTED"
    ACCEPTED_WITH_WARNING = "ACCEPTED_WITH_WARNING"
    REJECTED_THRESHOLD = "REJECTED_THRESHOLD"
    REJECTED_DOMAIN = "REJECTED_DOMAIN"
    REJECTED_RECENCY = "REJECTED_RECENCY"
    REJECTED_POLICY = "REJECTED_POLICY"
    NO_MATCH = "NO_MATCH"


class ConfidenceBand(str, Enum):
    STRONG = "STRONG"
    MODERATE = "MODERATE"
    WEAK = "WEAK"
    NONE = "NONE"


@dataclass
class MemoryMetadata:
    memory_key: str
    memory_type: str
    domain: str
    capability_tags: List[str] = field(default_factory=list)
    source: str = ""
    created_at: Optional[dt.datetime] = None
    version: int = 1
    governed: bool = True
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RecallContext:
    memory_key: str
    source: str
    memory_type: str
    domain: str
    capability_tags: List[str]
    score: float
    confidence_band: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    accepted_reason: str = ""
    domain_score: float = 0.0
    capability_overlap_score: float = 0.0
    recency_score: float = 0.0


@dataclass
class RecallDecision:
    status: RecallStatus
    confidence_band: str
    memory_type: str
    score: float
    domain_match: bool
    recency_score: float
    accepted_contexts: List[Dict[str, Any]] = field(default_factory=list)
    rejected_contexts: List[Dict[str, Any]] = field(default_factory=list)
    provenance: List[Dict[str, Any]] = field(default_factory=list)
    reason: str = ""
    query: str = ""
    query_domain: str = ""
    query_capability_tags: List[str] = field(default_factory=list)
    memory_classification: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value if isinstance(self.status, RecallStatus) else self.status,
            "confidence_band": self.confidence_band,
            "memory_type": self.memory_type,
            "score": self.score,
            "domain_match": self.domain_match,
            "recency_score": self.recency_score,
            "accepted_contexts": self.accepted_contexts,
            "rejected_contexts": self.rejected_contexts,
            "provenance": self.provenance,
            "reason": self.reason,
            "query": self.query,
            "query_domain": self.query_domain,
            "query_capability_tags": self.query_capability_tags,
            "memory_classification": self.memory_classification,
        }

