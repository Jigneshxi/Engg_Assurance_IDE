"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - VECTOR KNOWLEDGE BASE (ChromaDB)
================================================================================
This module provides long-term semantic memory for the AI Agent. It uses ChromaDB
to vectorize historical test plans ('Golden Samples') and retrieve them 
during the generation process to improve consistency and quality (RAG).
"""

import os
import json
import logging
import csv
import zipfile
import uuid
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional
import chromadb
from chromadb.utils import embedding_functions
from backend.core.config import settings

try:
    import docx
except Exception:  # pragma: no cover - optional dependency
    docx = None

try:
    import PyPDF2
except Exception:  # pragma: no cover - optional dependency
    PyPDF2 = None

# Configure local logger for semantic memory operations
logger = logging.getLogger(__name__)


def _normalize_metadata_value(value):
    if value is None:
        return None
    if isinstance(value, (list, dict, tuple)):
        return json.dumps(value, default=str)
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _sanitize_metadata(metadata: dict | None) -> dict:
    if not isinstance(metadata, dict):
        return {}
    return {
        str(key): _normalize_metadata_value(value)
        for key, value in metadata.items()
        if value is not None
    }

class LocalHashEmbeddingFunction:
    """
    Pure-local embedding fallback that does not download models or require
    extra runtime packages. It is intentionally simple but stable.
    """

    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions

    def name(self) -> str:
        return "local-hash-embedding"

    def __call__(self, input: List[str]) -> List[List[float]]:
        import hashlib
        import math
        import re

        texts = input if isinstance(input, list) else [input]
        embeddings: List[List[float]] = []

        for text in texts:
            vector = [0.0] * self.dimensions
            tokens = re.findall(r"[a-z0-9]+", str(text).lower())

            for token in tokens:
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "little") % self.dimensions
                weight = 1.0 + (int.from_bytes(digest[4:8], "little") % 1000) / 1000.0
                vector[index] += weight

            norm = math.sqrt(sum(value * value for value in vector))
            if norm > 0:
                vector = [value / norm for value in vector]
            embeddings.append(vector)

        return embeddings

    def embed_documents(self, input: List[str] = None, **kwargs) -> List[List[float]]:
        texts = input if input is not None else kwargs.get("texts") or kwargs.get("input") or []
        return self.__call__(texts)

    def embed_query(self, input: str = None, **kwargs) -> List[List[float]]:
        text = input if input is not None else kwargs.get("text") or kwargs.get("input") or ""
        return self.__call__([text])

class VectorDBAgent:
    """
    KNOWLEDGE ARCHIVIST (ChromaDB Wrapper)
    Logic: Wraps ChromaDB operations to store, extract, and semantically query 
    test planning artifacts. This class operates as an autonomous RAG engine.
    """
    def __init__(self, collection_name="test_planning_samples"):
        """
        Action: Initializes the database paths and embedding models.
        Logic: We rely on local 'sentence-transformers' (all-MiniLM-L6-v2) 
        rather than API-driven embeddings (like OpenAI) to ensure that sensitive 
        institutional requirement data never leaves the air-gapped system.
        """
        self.persist_directory = settings.CHROMA_PERSIST_DIR
        self.recovery_directory = f"{self.persist_directory}_recovery"
        self.collection_name = collection_name
        self._base_collection_name = collection_name
        self._client = None
        self._collection = None
        self._active_persist_directory = self.persist_directory
        self._session_recovery_directory = None
        self._force_session_recovery = False
        # Logic: Initializing the HuggingFace model locally for vectorization.
        self._embedding_function = None

    @property
    def embedding_function(self):
        """
        Action: Lazy-initialization of the embedding function.
        Logic: Prevents hanging during module import if the model needs to be loaded.
        """
        if self._embedding_function is None:
            emb_model = getattr(settings, "EMBEDDING_MODEL", "all-MiniLM-L6-v2")
            if emb_model == "nomic-embed-text":
                url = settings.OLLAMA_BASE_URL.rstrip("/")
                try:
                    logger.info(f"[VECTOR-DB] Loading OllamaEmbeddingFunction (model: {emb_model}, url: {url})...")
                    self._embedding_function = embedding_functions.OllamaEmbeddingFunction(
                        url=url,
                        model_name=emb_model
                    )
                except Exception as e:
                    logger.warning(f"[VECTOR-DB] Ollama embeddings unavailable, using local hash embeddings instead: {e}")
                    self._embedding_function = LocalHashEmbeddingFunction()
            else:
                logger.info(f"[VECTOR-DB] Loading local hash embedding function ({emb_model})...")
                self._embedding_function = LocalHashEmbeddingFunction()
        return self._embedding_function

    @property
    def recovery_collection_name(self) -> str:
        """
        A deterministic recovery collection name that avoids embedding-function
        conflicts with the primary collection.
        """
        return f"{self._base_collection_name}_localhash"

    @property
    def session_recovery_directory(self) -> str:
        """
        A fresh per-process fallback directory used when both the primary and
        standard recovery Chroma stores are incompatible or schema-corrupted.
        """
        if self._session_recovery_directory is None:
            suffix = uuid.uuid4().hex[:8]
            self._session_recovery_directory = f"{self.persist_directory}_session_recovery_{suffix}"
        return self._session_recovery_directory

    def _switch_to_local_hash_recovery(self, reason: Exception | str):
        """
        Force the agent onto a clean local-hash embedding path.
        This is used when Ollama/runtime embeddings or an existing collection
        become incompatible with the current process.
        """
        logger.warning(f"[VECTOR-DB] Switching to local-hash recovery path: {reason}")
        self._embedding_function = LocalHashEmbeddingFunction()
        self.collection_name = self.recovery_collection_name
        self._collection = None
        self._client = None
        if isinstance(reason, Exception) and self._should_force_session_recovery(reason):
            self._force_session_recovery = True

    @staticmethod
    def _should_use_local_hash_recovery(error: Exception) -> bool:
        """
        Detect failures that are usually caused by the remote embedding backend
        or by an incompatible persisted collection.
        """
        text = f"{type(error).__name__}: {error}".lower()
        markers = (
            "ollama",
            "embedding function",
            "embedding_function",
            "connection refused",
            "failed to connect",
            "timed out",
            "timeout",
            "range start index",
            "panic",
            "httpx",
        )
        return any(marker in text for marker in markers)

    @staticmethod
    def _should_force_session_recovery(error: Exception) -> bool:
        """
        Detect persistent-store schema corruption or incompatible SQLite layout.
        These issues need a fresh database directory, not just a new collection.
        """
        text = f"{type(error).__name__}: {error}".lower()
        markers = (
            "no such column",
            "schema",
            "sqlite",
            "collections.topic",
            "invalid column",
        )
        return any(marker in text for marker in markers)

    @property
    def client(self):
        """
        Action: Lazy-initialization of the Persistent Chroma Client.
        Logic: Defers heavy SQLite/ChromaDB locking operations until absolutely 
        required by a fetch/write operation. Ensures directory presence.
        """
        if self._client is None:
            last_error = None
            candidate_order = (
                (self.session_recovery_directory, self.persist_directory, self.recovery_directory)
                if self._force_session_recovery
                else (self.persist_directory, self.recovery_directory, self.session_recovery_directory)
            )
            for candidate in candidate_order:
                try:
                    os.makedirs(candidate, exist_ok=True)
                    client = chromadb.PersistentClient(path=candidate)
                    self._client = client
                    self._active_persist_directory = candidate
                    if candidate != self.persist_directory:
                        logger.warning(
                            f"[VECTOR-DB] Primary Chroma store failed to start. Using recovery store at '{candidate}'."
                        )
                    break
                except BaseException as e:  # pragma: no cover - Chroma runtime panics are BaseException
                    last_error = e
                    logger.warning(f"[VECTOR-DB] Failed to open Chroma store at '{candidate}': {e}")
                    self._client = None
                    continue
            if self._client is None:
                raise RuntimeError(
                    "ChromaDB persistence could not be initialized. Please restart the knowledge base or contact support."
                ) from last_error
        return self._client

    @property
    def collection(self):
        """
        Action: Lazy-initialization of the specific knowledge collection.
        Logic: 'Collections' are analogous to tables in SQL. This ensures our 
        vector collection exists and utilizes the configured embedding_function.
        """
        if self._collection is None:
            embedding_function = self.embedding_function
            try:
                self._collection = self.client.get_or_create_collection(
                    name=self.collection_name,
                    embedding_function=embedding_function
                )
                logger.info(f"[VECTOR-DB] Active Knowledge Collection: '{self.collection_name}'")
            except ValueError as e:
                conflict_text = str(e).lower()
                if "embedding function" in conflict_text or "embedding_function" in conflict_text:
                    logger.warning(
                        f"[VECTOR-DB] Collection embedding conflict detected. "
                        f"Switching to fresh recovery collection '{self.recovery_collection_name}'."
                    )
                    self._switch_to_local_hash_recovery(e)
                    self._collection = self.client.get_or_create_collection(
                        name=self.collection_name,
                        embedding_function=self.embedding_function
                    )
                else:
                    raise
            except BaseException as e:  # pragma: no cover - Chroma runtime panics are BaseException
                logger.warning(
                    f"[VECTOR-DB] Collection initialization failed for '{self.collection_name}': {e}"
                )
                if self.collection_name == self._base_collection_name:
                    if self._should_force_session_recovery(e):
                        self._force_session_recovery = True
                    self._switch_to_local_hash_recovery(e)
                    self._collection = self.client.get_or_create_collection(
                        name=self.collection_name,
                        embedding_function=self.embedding_function
                    )
                else:
                    raise
        return self._collection

    def extract_text(self, file_path: str) -> str:
        """
        MULTI-FORMAT PARSER
        Action: Extracts raw text from enterprise file formats.
        Logic: 
        1. DOCX: Uses python-docx to iterate paragraphs.
        2. PDF: Uses PyPDF2 to extract page-level text blocks.
        3. TXT/MD: Standard UTF-8 read.
        """
        ext = os.path.splitext(file_path)[1].lower()
        content = ""
        try:
            if ext == ".docx":
                content = self._extract_docx_text(file_path)
            elif ext == ".pdf":
                if PyPDF2 is None:
                    raise ValueError("PDF support is not installed on this server. Please upload TXT, DOCX, CSV, or XLSX files.")
                with open(file_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    content = "\n".join([(page.extract_text() or "") for page in reader.pages])
            elif ext == ".csv":
                with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
                    reader = csv.reader(f)
                    rows = [", ".join(str(cell).strip() for cell in row if str(cell).strip()) for row in reader]
                    content = "\n".join([row for row in rows if row.strip()])
            elif ext == ".xlsx":
                try:
                    from openpyxl import load_workbook
                except Exception as e:
                    raise ValueError("XLSX support is unavailable in this environment.") from e

                workbook = load_workbook(file_path, read_only=True, data_only=True)
                sheet_blocks = []
                for sheet in workbook.worksheets:
                    row_blocks = []
                    for row in sheet.iter_rows(values_only=True):
                        cells = [str(cell).strip() for cell in row if cell is not None and str(cell).strip()]
                        if cells:
                            row_blocks.append(" | ".join(cells))
                    if row_blocks:
                        sheet_blocks.append(f"[Sheet: {sheet.title}]\n" + "\n".join(row_blocks))
                content = "\n\n".join(sheet_blocks)
            elif ext in [".txt", ".md"]:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            else:
                raise ValueError(
                    f"Unsupported file type '{ext or 'unknown'}'. Supported types: .pdf, .docx, .txt, .md, .csv, .xlsx."
                )

            content = content.strip()
            if not content:
                raise ValueError("No extractable text was found in the uploaded file.")
            return content
        except Exception as e:
            logger.error(f"[VECTOR-DB] Extraction failed for {file_path}: {e}")
            raise

    def _extract_docx_text(self, file_path: str) -> str:
        """
        DOCX extractor that does not depend on python-docx being installed.
        Reads the word/document.xml payload directly from the .docx ZIP archive.
        """
        if docx is not None:
            try:
                document = docx.Document(file_path)
                text = "\n".join([p.text for p in document.paragraphs]).strip()
                if text:
                    return text
            except Exception as e:
                logger.warning(f"[VECTOR-DB] python-docx fallback failed for {file_path}: {e}")

        try:
            with zipfile.ZipFile(file_path) as docx_zip:
                with docx_zip.open("word/document.xml") as document_xml:
                    root = ET.fromstring(document_xml.read())

            namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            paragraphs = []
            for paragraph in root.findall(".//w:p", namespace):
                texts = [node.text for node in paragraph.findall(".//w:t", namespace) if node.text]
                joined = "".join(texts).strip()
                if joined:
                    paragraphs.append(joined)

            content = "\n".join(paragraphs).strip()
            if not content:
                raise ValueError("No extractable text was found in the DOCX file.")
            return content
        except Exception as e:
            raise ValueError(
                "DOCX parsing failed. Please upload a valid Word document or use PDF, XLSX, CSV, TXT, or MD."
            ) from e

    def ingest_document(self, file_path: str, metadata: dict = None):
        """
        KNOWLEDGE ACQUISITION (Semantic Chunking Implementation)
        Action: Processes a file and splits it into manageable semantic chunks.

        ISS-015 FIX: Reduced chunk size from 1500→800 chars and overlap from 200→100 chars.
        Smaller chunks produce tighter, more semantically precise embeddings, improving
        recall accuracy for domain-specific QA/testing content. Each chunk represents
        a single concept rather than multiple mixed topics.
        """
        content = self.extract_text(file_path)
        if not content:
            raise ValueError("No extractable text was found in the uploaded file.")
        
        parent_id = os.path.basename(file_path)
        # ISS-015 FIX: 800 chars (~180 words) per chunk with 100 char overlap
        # Rationale: Smaller chunks = tighter semantic signal per embedding vector.
        # 1500-char chunks dilute meaning by mixing multiple topics in one vector.
        chunk_size = 800
        overlap = 100
        
        chunks = []
        chunk_spans = []

        def _advance_to_boundary(text: str, index: int) -> int:
            index = max(0, min(index, len(text)))
            if index == 0 or index >= len(text):
                return index
            if not (text[index - 1].isalnum() and text[index].isalnum()):
                return index
            next_space = index
            while next_space < len(text) and text[next_space].isalnum():
                next_space += 1
            while next_space < len(text) and text[next_space].isspace():
                next_space += 1
            return min(next_space, len(text))

        def _retreat_to_boundary(text: str, index: int, lower_bound: int) -> int:
            index = max(lower_bound, min(index, len(text)))
            if index <= lower_bound or index >= len(text):
                return index
            if not (text[index - 1].isalnum() and text[index].isalnum()):
                return index
            prev_space = index
            while prev_space > lower_bound and text[prev_space - 1].isalnum():
                prev_space -= 1
            while prev_space > lower_bound and text[prev_space - 1].isspace():
                prev_space -= 1
            return max(lower_bound, prev_space)

        for i in range(0, len(content), chunk_size - overlap):
            start = _advance_to_boundary(content, i)
            end = min(len(content), start + chunk_size)
            end = _retreat_to_boundary(content, end, start + 1)
            if end <= start:
                end = min(len(content), start + chunk_size)
            chunk = content[start:end].strip()
            if chunk:  # Skip empty chunks
                chunks.append(chunk)
                chunk_spans.append((start, end))
                if len(chunk) > 0 and start > 0 and content[start - 1].isalnum() and chunk[0].islower():
                    logger.warning("[VECTOR-DB] Chunk %s starts mid-word near offset %s for %s.", len(chunks) - 1, start, parent_id)
            
        doc_ids = [f"{parent_id}_chunk_{i}" for i in range(len(chunks))]
        # Metadata identifies the parent and the specific fragment
        base_metadata = metadata or {}
        try:
            from backend.rag.memory_classifier import normalize_memory_metadata
            base_metadata = normalize_memory_metadata(
                base_metadata,
                source=base_metadata.get("source", parent_id),
                content=content
            )
        except Exception as metadata_error:
            logger.warning(f"[VECTOR-DB] Memory metadata normalization skipped: {metadata_error}")
        base_metadata = _sanitize_metadata(base_metadata)
        metadatas = [
            {
                **base_metadata,
                "source": base_metadata.get("source", parent_id),
                "memory_key": doc_ids[i],
                "chunk_id": doc_ids[i],
                "chunk_index": i,
                "start_offset": chunk_spans[i][0],
                "end_offset": chunk_spans[i][1],
                "type": base_metadata.get("type", "historical_sample"),
            }
            for i in range(len(chunks))
        ]

        # ISS-015 FIX: Use upsert instead of add to handle re-ingestion of the same document
        # without raising DuplicateIDError. This allows users to re-upload updated documents.
        def _write_to_collection():
            try:
                self.collection.upsert(
                    documents=chunks,
                    metadatas=metadatas,
                    ids=doc_ids
                )
                return
            except Exception as upsert_error:
                if self._should_use_local_hash_recovery(upsert_error):
                    self._switch_to_local_hash_recovery(upsert_error)
                    self.collection.upsert(
                        documents=chunks,
                        metadatas=metadatas,
                        ids=doc_ids
                    )
                    return

                # Fallback to add for older ChromaDB versions that don't support upsert
                try:
                    self.collection.add(
                        documents=chunks,
                        metadatas=metadatas,
                        ids=doc_ids
                    )
                    return
                except Exception as add_error:
                    if self._should_use_local_hash_recovery(add_error):
                        self._switch_to_local_hash_recovery(add_error)
                        self.collection.upsert(
                            documents=chunks,
                            metadatas=metadatas,
                            ids=doc_ids
                        )
                        return
                    raise

        _write_to_collection()
        logger.info(f"[VECTOR-DB] Document '{parent_id}' fragmented into {len(chunks)} semantic nodes (chunk_size={chunk_size}, overlap={overlap}).")
        return True

    def add_sample(self, id: str, content: str, metadata: dict):
        """
        RLHF LOOP (Self-Learning Mechanism)
        Action: Directly indexes an AI-generated plan back into the memory bank.
        Logic: This allows the agent to 'learn' from its past work, using 
        previous outputs as context to improve the consistency of future plans.

        ISS-015 FIX: Use upsert instead of add to prevent DuplicateIDError when
        the same task_id is written multiple times (e.g., on retry or re-run).
        """
        metadata = _sanitize_metadata(metadata)
        try:
            self.collection.upsert(
                documents=[content],
                metadatas=[metadata],
                ids=[id]
            )
        except Exception as upsert_error:
            if self._should_use_local_hash_recovery(upsert_error):
                self._switch_to_local_hash_recovery(upsert_error)
                self.collection.upsert(
                    documents=[content],
                    metadatas=[metadata],
                    ids=[id]
                )
                return

            # Fallback for older ChromaDB versions
            try:
                self.collection.add(
                    documents=[content],
                    metadatas=[metadata],
                    ids=[id]
                )
            except Exception as add_error:
                if self._should_use_local_hash_recovery(add_error):
                    self._switch_to_local_hash_recovery(add_error)
                    self.collection.upsert(
                        documents=[content],
                        metadatas=[metadata],
                        ids=[id]
                    )
                    return
                raise

    def search_similar(
        self,
        query: str,
        n_results: int = 1,
        metadata_filter: dict = None,
        exclude_synthetic: bool = False,
        min_confidence_pct: Optional[float] = None
    ) -> List[Dict]:
        """
        RAG (Retrieval-Augmented Generation) with Semantic Scoring & Logic Slicing

        ISS-016 FIX: exclude_synthetic=True filters out AI-generated entries
        (synthesis_sample, test_plan) so user-facing queries return only real documents.

        ISS-015 FIX: Confidence threshold + safe fetch_n capped to actual collection size.
        """
        MIN_CONFIDENCE_THRESHOLD = settings.VECTOR_MIN_CONFIDENCE_PCT if min_confidence_pct is None else float(min_confidence_pct)
        SYNTHETIC_TYPES = {"synthesis_sample", "test_plan"}

        # Build the active metadata filter
        active_filter = metadata_filter

        if exclude_synthetic:
            # Use $nin to exclude both synthetic types in one filter
            synthetic_exclusion = {"type": {"$nin": list(SYNTHETIC_TYPES)}}
            if active_filter:
                active_filter = {"$and": [active_filter, synthetic_exclusion]}
            else:
                active_filter = synthetic_exclusion

        logger.info(f"[VECTOR-DB] Semantic recall (filter={active_filter}, exclude_synthetic={exclude_synthetic})...")

        query_kwargs = {
            "query_texts": [query],
            "n_results": 0,
            "include": ["documents", "metadatas", "distances"]
        }
        if active_filter:
            query_kwargs["where"] = active_filter

        try:
            # Get total count of items that match the filter to avoid ChromaDB
            # "n_results > collection size" error which crashes the query entirely
            if active_filter:
                count_data = self.collection.get(where=active_filter)
            else:
                count_data = self.collection.get()

            available = len(count_data.get("ids", []))

            if available == 0:
                logger.info("[VECTOR-DB] No documents match the filter criteria.")
                return []

            # Cap fetch_n to available items — ChromaDB errors if n_results > collection size
            fetch_n = min(max(n_results * 2, n_results + 3), available)
            query_kwargs["n_results"] = fetch_n

            results = self.collection.query(**query_kwargs)

            output = []
            if results["documents"] and len(results["documents"][0]) > 0:
                for i, doc in enumerate(results["documents"][0]):
                    raw_dist = results["distances"][0][i]
                    # ChromaDB 0.4.x uses L2 squared distance.
                    # Convert to a 0-100 confidence score: lower distance = higher confidence.
                    # Cap at distance=2.0 (empirically: anything above this is noise).
                    confidence_pct = round(max(0.0, 1.0 - (raw_dist / 2.0)) * 100, 1)
                    vector_similarity = round(confidence_pct / 100.0, 4)

                    if confidence_pct < MIN_CONFIDENCE_THRESHOLD:
                        logger.debug(f"[VECTOR-DB] Skipping low-confidence result ({confidence_pct}%): {results['ids'][0][i]}")
                        continue

                    # Double-check synthetic exclusion in Python as a safety net
                    # (in case the $nin filter has edge cases with older ChromaDB)
                    meta = results["metadatas"][0][i] or {}
                    if exclude_synthetic and meta.get("type") in SYNTHETIC_TYPES:
                        continue

                    output.append({
                        "id": results["ids"][0][i],
                        "content": doc,
                        "metadata": meta,
                        "confidence": confidence_pct,
                        "vector_similarity": vector_similarity,
                        "raw_distance": raw_dist,
                    })

                    if len(output) >= n_results:
                        break

            if not output:
                # If the semantic cutoff is too aggressive, still return the best
                # available hits so the UI can show a useful recall result.
                if results["documents"] and len(results["documents"][0]) > 0:
                    for i, doc in enumerate(results["documents"][0][:n_results]):
                        raw_dist = results["distances"][0][i]
                        confidence_pct = round(max(0.0, 1.0 - (raw_dist / 2.0)) * 100, 1)
                        vector_similarity = round(confidence_pct / 100.0, 4)
                        meta = results["metadatas"][0][i] or {}
                        if exclude_synthetic and meta.get("type") in SYNTHETIC_TYPES:
                            continue
                        output.append({
                            "id": results["ids"][0][i],
                            "content": doc,
                            "metadata": meta,
                            "confidence": confidence_pct,
                            "vector_similarity": vector_similarity,
                            "raw_distance": raw_dist,
                        })
                        if len(output) >= n_results:
                            break

                if not output:
                    logger.info(f"[VECTOR-DB] No results above {MIN_CONFIDENCE_THRESHOLD}% confidence (available={available}).")

            return output

        except Exception as e:
            if self._should_use_local_hash_recovery(e):
                try:
                    self._switch_to_local_hash_recovery(e)
                    results = self.collection.query(**query_kwargs)
                    output = []
                    if results["documents"] and len(results["documents"][0]) > 0:
                        for i, doc in enumerate(results["documents"][0]):
                            raw_dist = results["distances"][0][i]
                            confidence_pct = round(max(0.0, 1.0 - (raw_dist / 2.0)) * 100, 1)
                            vector_similarity = round(confidence_pct / 100.0, 4)
                            if confidence_pct < MIN_CONFIDENCE_THRESHOLD:
                                continue
                            meta = results["metadatas"][0][i] or {}
                            if exclude_synthetic and meta.get("type") in SYNTHETIC_TYPES:
                                continue
                            output.append({
                                "id": results["ids"][0][i],
                                "content": doc,
                                "metadata": meta,
                                "confidence": confidence_pct,
                                "vector_similarity": vector_similarity,
                                "raw_distance": raw_dist,
                            })
                            if len(output) >= n_results:
                                break
                    return output
                except Exception as retry_error:
                    logger.error(f"[VECTOR-DB] Recall recovery failed: {retry_error}")

            logger.error(f"[VECTOR-DB] Recall failure: {e}")
            return []

# Singleton: Instantiate the global vector store used across the LangGraph workflow.
vector_store = VectorDBAgent()
