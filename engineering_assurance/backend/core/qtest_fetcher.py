"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - QTEST FETCHER
================================================================================
This module handles communication with Tricentis qTest Manager.
It fetches requirements and normalizes them for the Agentic pipeline.
"""

import requests
import json
import os
import logging
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


class QtestFetcher(BaseFetcher):
    """
    TRICENTIS QTEST ADAPTER
    Logic: Fetches requirements from qTest Manager and maps them to the STLC Schema.
    Supports multi-project environments via constructor-injected project_id.
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        self.url = url or os.getenv("QTEST_URL")
        self.token = token or os.getenv("QTEST_TOKEN")
        # email field carries project_id in the FetcherFactory convention for qTest
        # (qTest doesn't use email auth — Bearer token only)
        self.project_id = email or os.getenv("QTEST_PROJECT_ID", "1")
        self.mock_path = mock_path

    def fetch(self, resource_id: str):
        """
        CORE FETCH (qTest Manager REST API v3)
        Flow:
        1. Handle mock offline routing.
        2. Verify credentials.
        3. Dispatch GET to /api/v3/projects/{project_id}/requirements/{id}.
        4. Normalize payload.
        """
        try:
            # Step 1: Mock offline routing
            enable_mocks = os.getenv("ENABLE_OFFLINE_MOCKS", "false").lower() == "true"
            if enable_mocks and (resource_id.upper() == "REST-101" or (self.mock_path and os.path.exists(self.mock_path))):
                path = self.mock_path if (self.mock_path and os.path.exists(self.mock_path)) else None
                if path:
                    logger.info("[QTEST] Using mock data source.")
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    return self.normalize({
                        "id": data.get("jira_id") or "QT-101",
                        "name": data.get("summary") or "qTest Requirement",
                        "description": data.get("description") or "Imported from qTest.",
                        "acceptance_criteria": data.get("acceptance_criteria") or [],
                        "platform": "qtest",
                    })
                if self.mock_path:
                    raise FileNotFoundError(f"qTest mock file not found: {self.mock_path}")

            # Step 2: Credential guard
            if not self.url or not self.token:
                raise ValueError("qTest API credentials (URL/Token) missing. Set QTEST_URL and QTEST_TOKEN.")

            # Step 3: Dispatch request using project_id from constructor
            fetch_url = f"{self.url.rstrip('/')}/api/v3/projects/{self.project_id}/requirements/{resource_id}"
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            }

            logger.info(f"[QTEST] Fetching requirement {resource_id} from project {self.project_id}...")
            res = requests.get(fetch_url, headers=headers, timeout=15)

            if res.status_code == 200:
                return self.normalize(res.json())
            else:
                raise Exception(f"qTest API Rejection (Status {res.status_code}): {res.text[:200]}")

        except Exception as e:
            logger.error(f"[QTEST] Fetch error: {e}")
            raise

    def normalize(self, data: dict) -> dict:
        """
        DATA MAPPER (qTest schema to VVNT schema).
        Calls BaseFetcher.normalize() to apply RequirementSanitizer HTML cleaning.
        """
        intermediate = {
            "id": str(data.get("id", "N/A")),
            "summary": data.get("name") or data.get("summary") or "Untitled qTest Req",
            "description": data.get("description", ""),
            "acceptance_criteria": data.get("acceptance_criteria") or [],
            "platform": "qtest",
        }
        return super().normalize(intermediate)
