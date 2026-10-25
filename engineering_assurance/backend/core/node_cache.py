"""
================================================================================
VVNT — NODE RESULT CACHE (Strategy S3)
================================================================================
Caches LLM node outputs keyed by (node_key, input_hash).
On re-runs where the input hasn't changed, the cached result is returned
immediately — skipping the LLM call entirely.

Cache backend: SQLite (same DB as the main app, separate table).
TTL: 24 hours by default (configurable via NODE_CACHE_TTL_HOURS env var).

Usage in a node:
    from backend.core.node_cache import node_cache

    cached = node_cache.get("security", state_hash)
    if cached:
        return cached

    result = ... # LLM call
    node_cache.set("security", state_hash, result)
    return result
"""

import hashlib
import json
import logging
import os
import datetime
from typing import Any, Optional

from sqlalchemy import Column, String, Text, DateTime, create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger(__name__)

# ── Cache configuration ───────────────────────────────────────────────────────
_TTL_HOURS = int(os.getenv("NODE_CACHE_TTL_HOURS", "24"))

# ── Reuse the main app database ───────────────────────────────────────────────
from backend.core.config import settings

if settings.DB_ENGINE.lower() == "mysql" and settings.MYSQL_URL:
    _CACHE_URL = settings.MYSQL_URL
else:
    _CACHE_URL = f"sqlite:///{os.path.join(settings.BASE_DIR, 'test_planning_stable.db')}"

_CacheBase = declarative_base()


class NodeCacheEntry(_CacheBase):
    """Stores a single cached node result."""
    __tablename__ = "node_result_cache"

    cache_key   = Column(String(128), primary_key=True)   # sha256(node_key + input_hash)
    node_key    = Column(String(64),  nullable=False, index=True)
    result_json = Column(Text,        nullable=False)
    created_at  = Column(DateTime,    default=datetime.datetime.utcnow)
    expires_at  = Column(DateTime,    nullable=False)


class NodeCache:
    """Thread-safe node result cache backed by the app database."""

    def __init__(self):
        if "sqlite" in _CACHE_URL:
            self._engine = create_engine(
                _CACHE_URL,
                connect_args={"check_same_thread": False, "timeout": 10}
            )
        else:
            self._engine = create_engine(
                _CACHE_URL,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
        self._Session = sessionmaker(bind=self._engine)
        self._ensure_table()

    def _ensure_table(self):
        """Create the cache table if it doesn't exist."""
        try:
            _CacheBase.metadata.create_all(bind=self._engine)
        except Exception as e:
            logger.warning(f"[NODE-CACHE] Table creation skipped: {e}")

    @staticmethod
    def _make_key(node_key: str, input_hash: str) -> str:
        raw = f"{node_key}:{input_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def hash_state(state: dict, relevant_keys: list) -> str:
        """
        Compute a deterministic hash of the state fields that a node reads.
        Only hash the keys the node actually depends on to maximise cache hits.
        Includes global parameters like 'depth' and 'role' if present.
        """
        # Always include global mission parameters to avoid depth/role/intent cache collisions
        globals = {k: state.get(k) for k in ["depth", "role", "mission_intent", "active_agents"] if k in state}
        subset = {k: state.get(k) for k in relevant_keys if k in state}
        subset.update(globals)
        
        try:
            serialized = json.dumps(subset, sort_keys=True, default=str)
        except Exception:
            serialized = str(subset)
        return hashlib.sha256(serialized.encode()).hexdigest()

    def get(self, node_key: str, input_hash: str, use_cache: Optional[bool] = None) -> Optional[dict]:
        """Return cached result if present and not expired, else None."""
        if use_cache is None:
            use_cache = getattr(settings, "USE_NODE_CACHE", True)
        if not use_cache:
            logger.debug(f"[NODE-CACHE] BYPASS ACTIVE: Forcing fresh reasoning for {node_key}")
            return None
            
        cache_key = self._make_key(node_key, input_hash)
        try:
            with self._Session() as session:
                entry = session.get(NodeCacheEntry, cache_key)
                if entry is None:
                    return None
                if entry.expires_at < datetime.datetime.utcnow():
                    session.delete(entry)
                    session.commit()
                    return None
                result = json.loads(entry.result_json)
                logger.debug(f"[NODE-CACHE] HIT  node={node_key} key={cache_key[:12]}")
                return result
        except Exception as e:
            logger.warning(f"[NODE-CACHE] GET error for {node_key}: {e}")
            return None

    def set(self, node_key: str, input_hash: str, result: dict) -> None:
        """Store a node result in the cache."""
        cache_key = self._make_key(node_key, input_hash)
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=_TTL_HOURS)
        try:
            with self._Session() as session:
                entry = session.get(NodeCacheEntry, cache_key)
                if entry:
                    entry.result_json = json.dumps(result, default=str)
                    entry.expires_at  = expires_at
                    entry.created_at  = datetime.datetime.utcnow()
                else:
                    entry = NodeCacheEntry(
                        cache_key   = cache_key,
                        node_key    = node_key,
                        result_json = json.dumps(result, default=str),
                        expires_at  = expires_at,
                    )
                    session.add(entry)
                session.commit()
                logger.debug(f"[NODE-CACHE] SET  node={node_key} key={cache_key[:12]} ttl={_TTL_HOURS}h")
        except Exception as e:
            logger.warning(f"[NODE-CACHE] SET error for {node_key}: {e}")

    def invalidate(self, node_key: str) -> int:
        """Remove all cache entries for a given node. Returns count deleted."""
        try:
            with self._Session() as session:
                deleted = session.query(NodeCacheEntry).filter(
                    NodeCacheEntry.node_key == node_key
                ).delete()
                session.commit()
                return deleted
        except Exception as e:
            logger.warning(f"[NODE-CACHE] INVALIDATE error for {node_key}: {e}")
            return 0

    def purge_expired(self) -> int:
        """Remove all expired entries. Called periodically by maintenance engine."""
        try:
            with self._Session() as session:
                deleted = session.query(NodeCacheEntry).filter(
                    NodeCacheEntry.expires_at < datetime.datetime.utcnow()
                ).delete()
                session.commit()
                logger.info(f"[NODE-CACHE] Purged {deleted} expired entries.")
                return deleted
        except Exception as e:
            logger.warning(f"[NODE-CACHE] PURGE error: {e}")
            return 0

    def clear_all(self) -> int:
        """Remove every cached node entry. Used during clean backend startup."""
        try:
            with self._Session() as session:
                deleted = session.query(NodeCacheEntry).delete()
                session.commit()
                logger.info(f"[NODE-CACHE] Cleared {deleted} cached entries.")
                return deleted
        except Exception as e:
            logger.warning(f"[NODE-CACHE] CLEAR-ALL error: {e}")
            return 0


# ── Singleton ─────────────────────────────────────────────────────────────────
node_cache = NodeCache()


# ── Per-node input key definitions ───────────────────────────────────────────
# Maps each node to the state keys it reads. Used to compute the input hash.
# Only these keys are hashed — changes to other state keys won't invalidate the cache.
NODE_INPUT_KEYS: dict[str, list[str]] = {
    "security":              ["combined_data", "analysis_payload", "depth", "role"],
    "performance":           ["combined_data", "analysis_payload", "depth", "role"],
    "microservices":         ["combined_data", "analysis_payload", "depth", "role"],
    "visual_intel":          ["combined_data", "analysis_payload", "depth", "role"],
    "cross_browser":         ["combined_data", "analysis_payload", "depth", "role"],
    "reliability_eng":       ["combined_data", "analysis_payload", "depth", "role"],
    "ux_intelligence":       ["combined_data", "analysis_payload", "depth", "role"],
    "data_pipeline":         ["combined_data", "analysis_payload", "depth", "role"],
    "event_driven":          ["combined_data", "analysis_payload", "depth", "role"],
    "compliance_remediation":["combined_data", "compliance_report", "depth"],
    "suite_optimization":    ["combined_data", "test_cases", "depth"],
    "env_consistency":       ["combined_data", "depth"],
    "creator":               ["combined_data", "clarified_requirements", "analysis_payload"],
    "clarifier":             ["raw_requirements", "additional_context"],
    "synthesis_optimizer":   ["clarified_requirements", "raw_requirements"],
    "run_orchestrator":      ["combined_data", "test_cases", "analysis_payload"],
    "automation_forge":      ["analysis_payload", "combined_data", "test_cases"],
    "api_coder":             ["test_cases", "mock_specs", "analysis_payload", "combined_data"],
    "self_healing":          ["api_test_code", "combined_data"],
    "agent_2":               ["combined_data", "analysis_payload"],
    "regression":            ["combined_data", "analysis_payload"],
    "env_provisioner":       ["combined_data"],
    "delivery":              ["combined_data", "analysis_payload"],
    "chaos":                 ["combined_data", "analysis_payload"],
    "mobile_testing":        ["combined_data"],
    "graphql_validation":    ["combined_data"],
    "feature_flag":          ["combined_data", "analysis_payload"],
    "monitor":               ["combined_data", "risk_signals"],
    "slo":                   ["combined_data", "analysis_payload"],
    "tracing":               ["combined_data"],
    "digital_twin":          ["combined_data"],
    # Tier C nodes
    "perf_intel":            ["combined_data", "analysis_payload"],
    "obs_intel":             ["combined_data", "analysis_payload"],
    "rca_intel":             ["combined_data", "analysis_payload"],
    "inc_remed":             ["combined_data", "analysis_payload"],
    "sys_resil":             ["combined_data", "analysis_payload"],
    "rel_risk":              ["combined_data", "analysis_payload"],
    "biz_impact":            ["combined_data", "analysis_payload"],
    "roi_intel":             ["combined_data", "analysis_payload"],
    "knowledge_graph":       ["combined_data", "analysis_payload"],
    "meta_intel":            ["combined_data", "analysis_payload"],
    "exploratory":           ["combined_data", "analysis_payload"],
    "locator":               ["combined_data", "analysis_payload"],
    "migration":             ["combined_data", "analysis_payload"],
    "mutation":              ["combined_data", "analysis_payload"],
    "i18n_testing":          ["combined_data", "analysis_payload"],
}
