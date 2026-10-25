"""
KNOWLEDGE CENTER (RAG)
Handles vectorized "Golden Samples" for context-aware AI generation.
"""
import os
import shutil
import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, UploadFile, File
from backend.core.config import settings
from backend.core.vector_db import vector_store
from backend.rag.domain_classifier import classify_domain
from backend.rag.recall_service import governed_recall

router = APIRouter(prefix="/api/knowledge", tags=["RAG Infrastructure"])
logger = logging.getLogger(__name__)

ALLOWED_VECTORIZATION_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"}
SUPPORTED_FORMATS_LABEL = "PDF, DOCX, XLSX, CSV, TXT, MD"

@router.post("/upload")
async def upload_document_for_vectorization(file: UploadFile = File(...)):
    """
    KNOWLEDGE INGESTION PIPELINE
    Action: Buffers, indexes, and vectorizes external documents into ChromaDB.
    """
    temp_dir = os.path.join(settings.BASE_DIR, "temp_data")
    if not os.path.exists(temp_dir): 
        os.makedirs(temp_dir)
        
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please choose a file before uploading.")

    safe_filename = os.path.basename(file.filename)
    file_ext = os.path.splitext(safe_filename)[1].lower()
    if file_ext not in ALLOWED_VECTORIZATION_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file_ext or 'unknown'}'. Supported formats: {SUPPORTED_FORMATS_LABEL}."
        )

    file_path = os.path.join(temp_dir, safe_filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        if vector_store.ingest_document(file_path):
            return {"success": True, "message": f"'{file.filename}' vectorized into the knowledge bank."}
        else:
            raise HTTPException(status_code=500, detail="Vectorization cycle failed.")

    except ValueError as e:
        logger.warning(f"[KNOWLEDGE-INGEST] Validation failure ({file.filename}): {e}")
        raise HTTPException(status_code=400, detail=str(e))
            
    except Exception as e:
        logger.error(f"[KNOWLEDGE-INGEST] Document failure ({file.filename}): {e}")
        raise HTTPException(status_code=500, detail="Knowledge upload failed due to an internal server error. Please try again or upload a supported file format.")
    finally:
        if os.path.exists(file_path):
            try: os.remove(file_path)
            except: pass

@router.post("/query")
def semantic_search_brain_content(payload: dict):
    """
    RECALL DISCOVERY ENGINE
    ISS-016 FIX: Excludes synthetic AI-generated entries from user-facing queries.
    ISS-015 FIX: Returns only results above 25% confidence threshold.
    """
    query_str = payload.get("query")
    n_results = payload.get("n_results", 3)
    metadata_filter = payload.get("metadata_filter")
    
    if not query_str:
        return {"results": [], "count": 0}
        
    try:
        decision = governed_recall(
            query=query_str,
            n_results=n_results,
            metadata_filter=metadata_filter,
            exclude_synthetic=True,
        )

        # Enrich results with chunk provenance so the UI can distinguish
        # source document, chunk position, and similarity without guessing.
        collection = vector_store.collection.get()
        source_chunk_totals = defaultdict(int)
        for meta in collection.get("metadatas", []) or []:
            if not isinstance(meta, dict):
                continue
            source_chunk_totals[str(meta.get("source") or "")] += 1

        enriched_results = []
        for item in decision.accepted_contexts:
            metadata = item.get("metadata") or {}
            source = str(metadata.get("source") or item.get("source") or item.get("memory_key") or "")
            chunk_index = metadata.get("chunk_index")
            total_chunks = source_chunk_totals.get(source, 0) or None
            vector_score = item.get("vector_score")
            combined_score = item.get("score")
            enriched_results.append({
                **item,
                "source": source,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
                "similarity": vector_score,
                "combined_score": combined_score,
                "decision": decision.status.value if hasattr(decision.status, "value") else decision.status,
                "confidence_band": item.get("confidence_band") or decision.confidence_band,
                "domain": item.get("domain") or metadata.get("domain") or decision.query_domain,
            })

        return {
            "results": enriched_results,
            "accepted_results": enriched_results,
            "rejected_results": decision.rejected_contexts,
            "count": len(enriched_results),
            "accepted_count": len(enriched_results),
            "rejected_count": len(decision.rejected_contexts),
            "decision": decision.to_dict(),
            "engine": "Governed-Memory-Recall"
        }
    except Exception as e:
        logger.error(f"[KNOWLEDGE-QUERY] Semantic recall failed: {e}")
        raise HTTPException(status_code=500, detail="Intelligence Mesh recall failed.")


@router.post("/debug-classify")
def debug_classify_query(payload: dict):
    """
    Temporary classifier debugging endpoint.
    Returns raw domain + capability tagging without running retrieval or governance.
    """
    query = str(payload.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required.")

    classification = classify_domain(text=query, metadata=payload.get("metadata") or {}, source=payload.get("source", ""))
    return {
        "query": query,
        "classification": classification,
        "query_tokens": query.lower().split(),
        "source": payload.get("source", ""),
    }

@router.get("/list")
def list_indexed_brain_content():
    """
    ISS-014 FIX: Returns items grouped by source document, not raw chunk IDs.
    ISS-016 FIX: Separates real documents from synthetic AI-generated entries.
    This gives the UI a clean, actionable manifest instead of 400+ raw chunk IDs.
    """
    try:
        data = vector_store.collection.get()
        all_ids = data.get("ids", [])
        all_metadatas = data.get("metadatas", []) or []

        SYNTHETIC_TYPES = {"synthesis_sample", "test_plan"}

        # Group by source document
        real_docs = {}      # source -> {chunks, type, chunk_count}
        synthetic_docs = {} # source -> {chunks, type, chunk_count}

        for i, meta in enumerate(all_metadatas):
            if not isinstance(meta, dict):
                continue
            doc_type = meta.get("type", "unknown")
            source = meta.get("source", all_ids[i])
            chunk_id = all_ids[i]

            if doc_type in SYNTHETIC_TYPES:
                if source not in synthetic_docs:
                    synthetic_docs[source] = {"source": source, "type": doc_type, "chunk_ids": [], "chunk_count": 0}
                synthetic_docs[source]["chunk_ids"].append(chunk_id)
                synthetic_docs[source]["chunk_count"] += 1
            else:
                if source not in real_docs:
                    real_docs[source] = {"source": source, "type": doc_type, "chunk_ids": [], "chunk_count": 0}
                real_docs[source]["chunk_ids"].append(chunk_id)
                real_docs[source]["chunk_count"] += 1

        return {
            "real_documents": list(real_docs.values()),
            "synthetic_entries": list(synthetic_docs.values()),
            "real_count": len(real_docs),
            "synthetic_count": len(synthetic_docs),
            "total_chunks": len(all_ids),
            "ids": all_ids,
            "metadatas": all_metadatas,
            "count": len(all_ids)
        }
    except Exception as e:
        logger.error(f"[KNOWLEDGE-LIST] Index retrieval failed: {e}")
        return {"ids": [], "count": 0, "real_documents": [], "synthetic_entries": []}


@router.delete("/delete/{item_id:path}")
def delete_rag_memory_item(item_id: str):
    """
    ISS-014 FIX: Delete a RAG memory item by source document name or chunk ID.
    Supports:
    - Source document name (e.g. 'travelprd.docx') → deletes all chunks
    - Exact chunk ID (e.g. 'travelprd.docx_chunk_0') → deletes single chunk
    """
    try:
        data = vector_store.collection.get()
        all_ids = data.get("ids", [])
        all_metadatas = data.get("metadatas", []) or []

        if not all_ids:
            raise HTTPException(status_code=404, detail="Knowledge base is empty.")

        # Strategy 1: Exact chunk ID match
        if item_id in all_ids:
            vector_store.collection.delete(ids=[item_id])
            logger.info(f"[KNOWLEDGE-DELETE] Deleted chunk: {item_id}")
            return {"success": True, "deleted_ids": [item_id], "count": 1,
                    "message": f"Deleted chunk '{item_id}'"}

        # Strategy 2: Source document name — delete all chunks for that document
        chunk_ids_to_delete = [
            all_ids[i]
            for i, meta in enumerate(all_metadatas)
            if isinstance(meta, dict) and meta.get("source") == item_id
        ]

        if chunk_ids_to_delete:
            vector_store.collection.delete(ids=chunk_ids_to_delete)
            logger.info(f"[KNOWLEDGE-DELETE] Deleted {len(chunk_ids_to_delete)} chunks for source: {item_id}")
            return {
                "success": True,
                "deleted_ids": chunk_ids_to_delete,
                "count": len(chunk_ids_to_delete),
                "message": f"Deleted all {len(chunk_ids_to_delete)} chunks for document '{item_id}'"
            }

        raise HTTPException(
            status_code=404,
            detail=f"Item '{item_id}' not found. Use the source document name (e.g. 'myfile.docx') or an exact chunk ID."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[KNOWLEDGE-DELETE] Delete failed for '{item_id}': {e}")
        raise HTTPException(status_code=500, detail=f"Delete operation failed: {str(e)}")


@router.delete("/purge-synthetic")
def purge_all_synthetic_rag_entries():
    """
    ISS-016 FIX: Purge ALL synthetic AI-generated entries from the knowledge base.
    Removes type: synthesis_sample and type: test_plan entries.
    Preserves: historical_sample and enterprise_template entries (real documents).

    This endpoint should be called once to clean up the existing polluted collection,
    and is safe to call repeatedly (idempotent).
    """
    try:
        data = vector_store.collection.get()
        all_ids = data.get("ids", [])
        all_metadatas = data.get("metadatas", []) or []

        SYNTHETIC_TYPES = {"synthesis_sample", "test_plan"}
        ids_to_delete = [
            all_ids[i]
            for i, meta in enumerate(all_metadatas)
            if isinstance(meta, dict) and meta.get("type") in SYNTHETIC_TYPES
        ]

        if not ids_to_delete:
            return {
                "success": True,
                "deleted": 0,
                "remaining": len(all_ids),
                "message": "Knowledge base is already clean — no synthetic entries found."
            }

        # ChromaDB delete in batches of 100 to avoid payload size limits
        batch_size = 100
        deleted = 0
        for i in range(0, len(ids_to_delete), batch_size):
            batch = ids_to_delete[i:i + batch_size]
            vector_store.collection.delete(ids=batch)
            deleted += len(batch)

        remaining = len(all_ids) - deleted
        logger.info(f"[KNOWLEDGE-PURGE] Purged {deleted} synthetic entries. {remaining} real entries preserved.")
        return {
            "success": True,
            "deleted": deleted,
            "remaining": remaining,
            "message": f"Purged {deleted} synthetic entries. {remaining} real document chunks preserved."
        }

    except Exception as e:
        logger.error(f"[KNOWLEDGE-PURGE] Bulk purge failed: {e}")
        raise HTTPException(status_code=500, detail=f"Purge failed: {str(e)}")


@router.post("/purge-synthetic")
def purge_synthetic_post():
    """POST alias for purge-synthetic (for UI compatibility)."""
    return purge_all_synthetic_rag_entries()

@router.get("/document/{source:path}")
def get_full_document(source: str):
    """
    Reconstructs the full document from its vectorized chunks.
    This allows the UI to display the complete context instead of just an 800-character snippet.
    """
    try:
        data = vector_store.collection.get()
        all_ids = data.get("ids", [])
        all_metadatas = data.get("metadatas", []) or []
        all_documents = data.get("documents", []) or []

        # Find all chunks for this source
        chunks = []
        for i, meta in enumerate(all_metadatas):
            if isinstance(meta, dict) and meta.get("source") == source:
                chunk_index = meta.get("chunk_index", 0)
                chunks.append((chunk_index, all_documents[i]))

        if not chunks:
            raise HTTPException(status_code=404, detail="Document not found.")

        # Sort chunks by index to reconstruct in order
        chunks.sort(key=lambda x: x[0])
        
        # Seamlessly stitch chunks by detecting and removing overlap
        if not chunks:
            full_text = ""
        else:
            full_text = chunks[0][1]
            for _, next_chunk in chunks[1:]:
                # Find maximum exact overlap between the end of full_text and start of next_chunk
                max_overlap = 0
                overlap_len = min(len(full_text), len(next_chunk), 800)
                for i in range(1, overlap_len + 1):
                    if full_text[-i:] == next_chunk[:i]:
                        max_overlap = i
                
                if max_overlap > 0:
                    full_text += next_chunk[max_overlap:]
                else:
                    # Fallback if chunks are disjoint for some reason
                    if full_text and not full_text[-1].isspace():
                        full_text += " " + next_chunk
                    else:
                        full_text += next_chunk
        
        return {
            "source": source,
            "content": full_text,
            "total_chunks": len(chunks)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[KNOWLEDGE-DOCUMENT] Fetch failed for '{source}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch document: {str(e)}")
