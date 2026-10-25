from __future__ import annotations

import logging
from typing import Dict, List, Optional

from backend.core.vector_db import vector_store

logger = logging.getLogger(__name__)


def retrieve_candidates(
    query: str,
    n_results: int = 5,
    metadata_filter: Optional[Dict] = None,
    exclude_synthetic: bool = True
) -> List[Dict]:
    if not query or not str(query).strip():
        return []

    try:
        results = vector_store.search_similar(
            query,
            n_results=n_results,
            metadata_filter=metadata_filter,
            exclude_synthetic=exclude_synthetic,
            min_confidence_pct=0.0,
        )
        return results
    except Exception as exc:
        logger.error("[RAG-RETRIEVAL] Candidate retrieval failed: %s", exc)
        return []

