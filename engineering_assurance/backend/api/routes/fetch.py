"""
MULTI-SOURCE REQUIREMENT FETCHING
Universal Ingestion and Traceability Pipeline logic.
"""
import logging
from fastapi import APIRouter, HTTPException
from backend.api.models import FetchRequest
from backend.core.fetcher_factory import FetcherFactory
from backend.core.utils import (
    synthesize_with_traceability, 
    SourceRef, 
    TraceabilityMap,
    RequirementSanitizer
)

router = APIRouter(prefix="/api/fetch", tags=["Requirement Ingestion"])
logger = logging.getLogger(__name__)

# Logic: Platforms where we should not display raw content as ID for better UI 
CONTENT_AS_ID_PLATFORMS = {"directpaste", "local", "fileupload", "networkpath", "mediaupload"}

@router.post("/requirements")
async def fetch_and_synthesize(req: FetchRequest):
    """
    UNIVERSAL REQUIREMENT AGGREGATOR & SYNTHESIZER
    Flow:
    1. Loop over sources, dispatch via FetcherFactory.
    2. Normalize descriptions and acceptance criteria via RequirementSanitizer.
    3. Build 'SourceRef' manifest — mapping IDs like Jira CORE-123 to Trace IDs like REQ-001.
    4. Call LLM for 'Unified Understanding' with REF-injection.
    5. Build the final Traceability Matrix for the UI.
    6. Return synthesis markdown and structured traceability data.
    """
    try:
        all_combined_text = []
        source_refs = []

        for idx, src in enumerate(req.sources):
            # Resolve the correct fetcher adapter.
            fetcher = FetcherFactory.get_fetcher(
                platform=src.platform,
                url=src.config.url if src.config else None,
                email=src.config.email if src.config else None,
                token=src.config.token if src.config else None
            )
            
            # Action: Trigger the fetch (REST API/ADF/HTML).
            data = fetcher.fetch(src.ticket_id)
            if not data:
                logger.warning(f"[FETCH] Source {idx+1} ({src.platform}) returned no data. Skipping.")
                continue

            # Logic: Build a stable trace ID (e.g. REQ-001) to stay consistent regardless of ticket name length.
            ref_id = f"REQ-{str(idx + 1).zfill(3)}"

            # Action: Clean ID for UI display.
            if src.platform.lower() in CONTENT_AS_ID_PLATFORMS:
                source_id = src.platform.upper()
            else:
                source_id = (src.ticket_id or src.platform.upper()).upper()

            # Store to the manifest used by the LLM prompt builder.
            source_refs.append(SourceRef(
                ref_id=ref_id,
                platform=src.platform,
                source_id=source_id,
                summary=data.get("summary", "No title"),
            ))

            # Action: Consolidate Description and Acceptance Criteria.
            desc = data.get("description", "") # Already clean from BaseFetcher.normalize()
            ac_list = data.get("acceptance_criteria", [])
            
            # Robust AC parsing logic.
            ac_text = ""
            if isinstance(ac_list, list):
                ac_text = " ".join(str(a) for a in ac_list if a)
            else:
                ac_text = str(ac_list or "")

            # Build the text block section for the synthesis prompt.
            block = f"Source {ref_id} ({src.platform.upper()} / {source_id}):\n{desc}"
            if ac_text.strip():
                block += f"\nAcceptance Criteria: {ac_text}"
            
            all_combined_text.append(block)

        # Action: Inject manual context if provided (e.g. Direct Paste or Instructions)
        if req.context and len(req.context.strip()) > 0:
            all_combined_text.append(f"SUPPLEMENTARY USER INSTRUCTIONS:\n{req.context}")

        # Action: Synthesize with explicit 'Traceability injection' enabled.
        combined_payload = "\n\n---\n\n".join(all_combined_text)
        synthesis_text = ""
        tmap_dict = {"driving":[], "derived":[]}
        
        if combined_payload.strip():
            synthesis_text, tmap = synthesize_with_traceability(combined_payload, source_refs)
            tmap_dict = tmap.to_dict() if tmap else tmap_dict
        else:
            synthesis_text = "### ⚠️ UNIFIED CONTEXT: NO DATA SOURCE DETECTED\n\nAll selected sources returned empty content. Please verify your Ticket IDs or Paste content. Manual entry mode enabled."

        logger.info(f"[FETCH] Multi-Source Ingestion complete. Source count: {len(source_refs)}")

        return {
            "id": f"Multi-Source Context ({len(source_refs)} items)",
            "unified_understanding": synthesis_text or "### ⚠️ CRITICAL: SYSTEM FAILED TO GENERATE CONTEXT",
            "source_count": len(source_refs),
            "traceability_map": tmap_dict,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FETCH-ERROR] Universal requirement ingestion failed: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Requirement Synthesis Failed: {str(e)}"
        )
