"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - GOOGLE DRIVE FETCHER
================================================================================
This module handles communication with Google Drive via the Drive API v3.
Supports Google Docs, Sheets, and uploaded files (DOCX, PDF, TXT).
"""

import io
import os
import logging
import requests
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


class GoogleDriveFetcher(BaseFetcher):
    """
    GOOGLE DRIVE ADAPTER
    Logic: Fetches requirement documents from Google Drive using the Drive API v3.
    Supports Google Docs (exported as plain text), uploaded DOCX/PDF/TXT files.

    Authentication: OAuth2 Bearer token with drive.readonly scope.

    Resource ID formats:
      Google Drive file ID:  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
      (The file ID from the Google Drive URL: /file/d/{FILE_ID}/view)
    """

    DRIVE_BASE = "https://www.googleapis.com/drive/v3"
    EXPORT_BASE = "https://www.googleapis.com/drive/v3/files"

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        url:   Not used (Google Drive API has a fixed endpoint).
        email: Not used (token-based auth only).
        token: OAuth2 Bearer token with drive.readonly scope.
        """
        self.token = token or os.getenv("GOOGLE_DRIVE_TOKEN")
        self.mock_path = mock_path

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    def fetch(self, resource_id: str) -> dict:
        """
        CORE FETCH (Google Drive API v3)
        resource_id: Google Drive file ID.

        Flow:
        1. Handle mock path.
        2. Validate token.
        3. Fetch file metadata (name, mimeType).
        4. Export or download file content.
        5. Extract text.
        6. Normalize to VVNT schema.
        """
        import json as _json

        # Mock path support
        if self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[GOOGLEDRIVE] Using mock data source: {self.mock_path}")
            with open(self.mock_path, "r", encoding="utf-8") as f:
                return self.normalize(_json.load(f))

        if not self.token:
            raise ValueError(
                "Google Drive token missing. "
                "Set GOOGLE_DRIVE_TOKEN with drive.readonly scope."
            )

        # Step 1: Fetch metadata
        meta_url = f"{self.DRIVE_BASE}/files/{resource_id}?fields=id,name,mimeType"
        logger.info(f"[GOOGLEDRIVE] Fetching metadata for file: {resource_id}")
        meta_resp = requests.get(meta_url, headers=self._headers(), timeout=15)

        if meta_resp.status_code != 200:
            raise Exception(
                f"Google Drive metadata error (Status {meta_resp.status_code}): {meta_resp.text[:200]}"
            )

        meta = meta_resp.json()
        file_name = meta.get("name", "document")
        mime_type = meta.get("mimeType", "")

        # Step 2: Export or download
        content = self._get_content(resource_id, file_name, mime_type)

        raw_payload = {
            "id": resource_id,
            "summary": file_name.rsplit(".", 1)[0].replace("-", " ").replace("_", " "),
            "description": content,
            "acceptance_criteria": [],
            "platform": "googledrive",
        }
        return self.normalize(raw_payload)

    def _get_content(self, file_id: str, file_name: str, mime_type: str) -> str:
        """Export Google Workspace files or download binary files."""
        # Google Docs → export as plain text
        if mime_type == "application/vnd.google-apps.document":
            export_url = f"{self.EXPORT_BASE}/{file_id}/export?mimeType=text/plain"
            logger.info(f"[GOOGLEDRIVE] Exporting Google Doc as plain text: {file_name}")
            resp = requests.get(export_url, headers=self._headers(), timeout=30)
            if resp.status_code == 200:
                return resp.text
            raise Exception(f"Google Doc export failed (Status {resp.status_code}): {resp.text[:200]}")

        # Google Sheets → export as CSV
        if mime_type == "application/vnd.google-apps.spreadsheet":
            export_url = f"{self.EXPORT_BASE}/{file_id}/export?mimeType=text/csv"
            logger.info(f"[GOOGLEDRIVE] Exporting Google Sheet as CSV: {file_name}")
            resp = requests.get(export_url, headers=self._headers(), timeout=30)
            if resp.status_code == 200:
                return resp.text
            raise Exception(f"Google Sheet export failed (Status {resp.status_code}): {resp.text[:200]}")

        # Binary files (DOCX, PDF, TXT) → download directly
        download_url = f"{self.EXPORT_BASE}/{file_id}?alt=media"
        logger.info(f"[GOOGLEDRIVE] Downloading file: {file_name} ({mime_type})")
        resp = requests.get(download_url, headers=self._headers(), timeout=30)

        if resp.status_code != 200:
            raise Exception(f"Google Drive download failed (Status {resp.status_code}): {resp.text[:200]}")

        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        if ext == "docx":
            return self._extract_docx(resp.content)
        elif ext == "pdf":
            return self._extract_pdf(resp.content)
        else:
            return resp.content.decode("utf-8", errors="replace")

    @staticmethod
    def _extract_docx(content: bytes) -> str:
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            logger.warning("[GOOGLEDRIVE] python-docx not installed.")
            return content.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error(f"[GOOGLEDRIVE] DOCX extraction failed: {e}")
            return ""

    @staticmethod
    def _extract_pdf(content: bytes) -> str:
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        except ImportError:
            logger.warning("[GOOGLEDRIVE] PyPDF2 not installed.")
            return "[PDF content — install PyPDF2 for text extraction]"
        except Exception as e:
            logger.error(f"[GOOGLEDRIVE] PDF extraction failed: {e}")
            return ""
