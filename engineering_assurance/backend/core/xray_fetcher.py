"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - XRAY FETCHER
================================================================================
This module handles communication with X-Ray for Jira Cloud. It fetches Test
Cases via GraphQL and normalizes them for the Agentic pipeline.
"""

import os
import json
import logging
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from .base_fetcher import BaseFetcher

load_dotenv()
logger = logging.getLogger(__name__)


class XrayFetcher(BaseFetcher):
    """
    X-RAY FOR JIRA CLOUD ADAPTER
    Logic: Fetches professional Test Case definitions directly from X-Ray by ID.
    Uses OAuth2 Client Credentials flow. Tokens are cached and refreshed on expiry.
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        # email maps to client_id, token maps to client_secret (FetcherFactory convention)
        self.client_id = email or os.getenv("XRAY_CLIENT_ID")
        self.client_secret = token or os.getenv("XRAY_CLIENT_SECRET")
        self.auth_url = "https://xray.cloud.getxray.app/api/v2/authenticate"
        self.graphql_url = "https://xray.cloud.getxray.app/api/v2/graphql"
        self._token: str | None = None
        self._token_expires_at: datetime | None = None
        self.mock_path = mock_path

    def _authenticate(self) -> bool:
        """
        Obtain a fresh OAuth2 token from X-Ray Cloud.
        Tokens are valid for ~1 hour; we cache and refresh proactively.
        """
        if not self.client_id or not self.client_secret:
            raise ValueError("X-Ray credentials missing. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.")

        payload = {"client_id": self.client_id, "client_secret": self.client_secret}
        try:
            response = requests.post(self.auth_url, json=payload, timeout=15)
            if response.status_code == 200:
                self._token = response.json()
                # X-Ray tokens expire in ~3600s; refresh 5 minutes early
                self._token_expires_at = datetime.utcnow() + timedelta(seconds=3300)
                logger.info("[XRAY] Authentication successful. Token cached.")
                return True
            else:
                raise Exception(f"X-Ray Auth Failed (Status {response.status_code}): {response.text[:200]}")
        except Exception as e:
            logger.error(f"[XRAY] Authentication error: {e}")
            raise

    def _ensure_token(self):
        """Ensure we have a valid, non-expired token. Re-authenticate if needed."""
        if not self._token or (self._token_expires_at and datetime.utcnow() >= self._token_expires_at):
            logger.info("[XRAY] Token missing or expired — re-authenticating.")
            self._authenticate()

    def fetch(self, resource_id: str):
        """
        Fetches detailed Test Cases from X-Ray using GraphQL and normalizes them.
        """
        # Mock path support
        enable_mocks = os.getenv("ENABLE_OFFLINE_MOCKS", "false").lower() == "true"
        if enable_mocks and self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[XRAY] Using mock data source: {self.mock_path}")
            with open(self.mock_path, 'r', encoding='utf-8') as f:
                return self.normalize(json.load(f))

        self._ensure_token()

        query = """
        query($id: String!) {
          getTest(issueId: $id) {
            issueId
            testType { name }
            steps { action data result }
          }
        }
        """
        variables = {"id": resource_id}
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

        try:
            logger.info(f"[XRAY] Fetching test case: {resource_id}")
            response = requests.post(
                self.graphql_url,
                json={"query": query, "variables": variables},
                headers=headers,
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json().get("data", {}).get("getTest")
                if not data:
                    raise Exception(f"X-Ray returned no data for issue ID '{resource_id}'.")

                raw_payload = {
                    "id": data.get("issueId"),
                    "summary": f"X-Ray Test: {data.get('issueId')}",
                    "description": f"Test Type: {data.get('testType', {}).get('name', 'N/A')}",
                    "acceptance_criteria": [
                        f"{s.get('action', '')} → {s.get('result', '')}"
                        for s in data.get("steps", [])
                        if s.get("action") or s.get("result")
                    ],
                    "platform": "xray",
                }
                return self.normalize(raw_payload)
            else:
                raise Exception(f"X-Ray GraphQL Fetch Failed (Status {response.status_code}): {response.text[:200]}")
        except Exception as e:
            logger.error(f"[XRAY] Fetch error for {resource_id}: {e}")
            raise
