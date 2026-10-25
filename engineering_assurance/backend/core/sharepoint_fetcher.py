"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - SHAREPOINT / ONEDRIVE FETCHER
================================================================================
This module handles communication with Microsoft 365 via the Graph API.
Supports SharePoint document libraries and OneDrive personal/business drives.
"""

import os
import io
import logging
import requests
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


class SharePointFetcher(BaseFetcher):
    """
    MICROSOFT 365 ADAPTER (SharePoint + OneDrive)
    Logic: Fetches requirement documents from M365 using the Microsoft Graph API.
    Supports DOCX, PDF, and plain text/Markdown files.

    Authentication: OAuth2 Bearer token (obtained via MSAL or passed directly).
    The token must have Files.Read or Sites.Read.All scope.

    Resource ID formats:
      SharePoint:  /sites/{site-id}/drive/items/{item-id}
      OneDrive:    /me/drive/items/{item-id}
                   /drives/{drive-id}/items/{item-id}
    """

    GRAPH_BASE = "https://graph.microsoft.com/v1.0"

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        url:   Optional Graph API base URL override (for sovereign clouds).
        email: Not used for Graph API auth (token-based only).
        token: OAuth2 Bearer token with Files.Read or Sites.Read.All scope.
        """
        self.graph_base = (url or self.GRAPH_BASE).rstrip("/")
        self.token = token or os.getenv("SHAREPOINT_TOKEN") or os.getenv("GRAPH_API_TOKEN")
        self.mock_path = mock_path

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }

    def fetch(self, resource_id: str) -> dict:
        """
        CORE FETCH (Microsoft Graph API)
        resource_id: Graph API path to the item, e.g.:
          /sites/mysite.sharepoint.com,abc123/drive/items/def456
          /me/drive/items/xyz789
          /drives/b!abc/items/def

        Flow:
        1. Handle mock path.
        2. Validate token.
        3. Fetch item metadata to get file name and download URL.
        4. Download file content.
        5. Extract text from DOCX/PDF/TXT.
        6. Normalize to VVNT schema.
        """
        import json as _json

        # Mock path support
        enable_mocks = os.getenv("ENABLE_OFFLINE_MOCKS", "false").lower() == "true"
        if enable_mocks and self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[SHAREPOINT] Using mock data source: {self.mock_path}")
            with open(self.mock_path, "r", encoding="utf-8") as f:
                return self.normalize(_json.load(f))

        if not self.token:
            raise ValueError(
                "SharePoint/OneDrive token missing. "
                "Set SHAREPOINT_TOKEN or GRAPH_API_TOKEN with Files.Read scope."
            )

        # Ensure resource_id starts with /
        path = resource_id if resource_id.startswith("/") else f"/{resource_id}"
        metadata_url = f"{self.graph_base}{path}"

        logger.info(f"[SHAREPOINT] Fetching item metadata: {path}")
        meta_resp = requests.get(metadata_url, headers=self._headers(), timeout=15)

        if meta_resp.status_code != 200:
            raise Exception(
                f"Graph API metadata error (Status {meta_resp.status_code}): {meta_resp.text[:200]}"
            )

        meta = meta_resp.json()
        file_name = meta.get("name", "document")
        download_url = meta.get("@microsoft.graph.downloadUrl") or meta.get("downloadUrl")

        if not download_url:
            raise Exception(
                f"Graph API did not return a download URL for '{file_name}'. "
                "Ensure the token has Files.Read scope and the item is a file (not a folder)."
            )

        logger.info(f"[SHAREPOINT] Downloading file: {file_name}")
        file_resp = requests.get(download_url, timeout=30)

        if file_resp.status_code != 200:
            raise Exception(f"File download failed (Status {file_resp.status_code})")

        content = self._extract_text(file_name, file_resp.content)

        raw_payload = {
            "id": meta.get("id", path),
            "summary": file_name.rsplit(".", 1)[0].replace("-", " ").replace("_", " "),
            "description": content,
            "acceptance_criteria": [],
            "platform": "sharepoint",
        }
        return self.normalize(raw_payload)

    def _extract_text(self, file_name: str, content: bytes) -> str:
        """
        Extract plain text from DOCX, PDF, or text/Markdown files.
        Falls back to UTF-8 decode for unknown types.
        """
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

        if ext == "docx":
            return self._extract_docx(content)
        elif ext == "pdf":
            return self._extract_pdf(content)
        else:
            # Plain text, Markdown, CSV, etc.
            try:
                return content.decode("utf-8", errors="replace")
            except Exception:
                return ""

    @staticmethod
    def _extract_docx(content: bytes) -> str:
        """Extract text from a DOCX file using python-docx if available."""
        try:
            import docx  # python-docx
            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            logger.warning("[SHAREPOINT] python-docx not installed — falling back to raw bytes decode.")
            return content.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error(f"[SHAREPOINT] DOCX extraction failed: {e}")
            return ""

    @staticmethod
    def _extract_pdf(content: bytes) -> str:
        """Extract text from a PDF file using PyPDF2 if available."""
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages).strip()
        except ImportError:
            logger.warning("[SHAREPOINT] PyPDF2 not installed — PDF text extraction unavailable.")
            return "[PDF content — install PyPDF2 for text extraction]"
        except Exception as e:
            logger.error(f"[SHAREPOINT] PDF extraction failed: {e}")
            return ""
