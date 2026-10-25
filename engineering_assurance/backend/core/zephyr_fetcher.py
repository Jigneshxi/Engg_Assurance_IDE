"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - ZEPHYR FETCHER
================================================================================
This module handles communication with Zephyr Scale (SmartBear) Cloud. 
It ingests existing Test Cases and normalizes them for the Agentic pipeline.
"""

import re
import requests
import json
import os
import logging
from .base_fetcher import BaseFetcher

# Configure local logger for ingestion diagnostics
logger = logging.getLogger(__name__)

class ZephyrFetcher(BaseFetcher):
    """
    ENTERPRISE ZEPHYR ADAPTER
    Logic: Fetches test cases from Zephyr Scale (SmartBear).
    Maps 'TestCase' abstraction to the 'Requirement' abstraction required by 
    the LangGraph intelligence routing.
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Variable Injection for Zephyr Auth.
        Logic: Zephyr Scale Cloud specifically uses a singular Bearer Token 
        for authorization, unlike Jira's Basic Auth or X-Ray's JWT handshake.
        """
        self.token = token or os.getenv("ZEPHYR_TOKEN")
        self.mock_path = mock_path

    # ── Resource ID format: PROJECT-T123 ──────────────────────────────────────
    _RESOURCE_ID_RE = re.compile(r'^[A-Z]+-T\d+$')

    def fetch(self, resource_id):
        """
        CORE FETCH (Zephyr Scale Cloud API v2)
        Flow:
        1. Validate Mock Configuration.
        2. Validate resource_id format.
        3. Verify Bearer Token.
        4. Dispatch GET request to SmartBear API.
        5. Normalize JSON payload.
        """
        try:
            # Step 1: Handling the 'Mock Offline Source'
            enable_mocks = os.getenv("ENABLE_OFFLINE_MOCKS", "false").lower() == "true"
            if enable_mocks and (resource_id.upper() == "REST-101" or (self.mock_path and os.path.exists(self.mock_path))):
                path = self.mock_path if (self.mock_path and os.path.exists(self.mock_path)) else None
                if path:
                    logger.info("[ZEPHYR] Utilizing isolated mock payload.")
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    return self.normalize({
                        "key": data.get("jira_id") or "ZEP-101",
                        "name": data.get("summary") or "Zephyr Test Case",
                        "description": data.get("description") or "Imported from Zephyr.",
                        "platform": "zephyr"
                    })
                if self.mock_path:
                    raise FileNotFoundError(f"Zephyr mock file not found: {self.mock_path}")

            # Step 2: Validate resource_id format (skip for mock sentinel)
            if not self._RESOURCE_ID_RE.match(resource_id):
                raise ValueError(
                    "Invalid Zephyr resource ID format. "
                    "Expected format: PROJECT-T123 (e.g., MYPROJ-T42)"
                )

            # Step 3: Ensure Active Credentials
            if not self.token:
                raise Exception("Zephyr API Key (Bearer Token) missing in Vault / .env.")

            # Step 4: Dispatch API Request
            # Note: Zephyr Cloud operates on a central SmartBear URL, not a custom tenant URL.
            headers = {
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json'
            }
            fetch_url = f"https://api.zephyrscale.smartbear.com/v2/testcases/{resource_id}"
            
            logger.info(f"[ZEPHYR] Dispatching fetch for Test Case: {resource_id}")
            try:
                res = requests.get(fetch_url, headers=headers, timeout=15)
            except requests.exceptions.Timeout:
                raise Exception(
                    "Zephyr API request timed out after 15s. Check your network connection."
                )
            
            if res.status_code == 200:
                data = res.json()
                return self.normalize(data)  # Forward to mapper
            elif res.status_code == 401:
                raise Exception(
                    "Zephyr authentication failed. Check your API token in Settings → Vault & AI."
                )
            elif res.status_code == 403:
                raise Exception(
                    "Zephyr access denied. Ensure your token has read permissions for this project."
                )
            elif res.status_code == 404:
                raise Exception(
                    "Zephyr test case not found. Verify the resource ID exists in your Zephyr project."
                )
            elif res.status_code == 429:
                raise Exception(
                    "Zephyr rate limit exceeded. Please wait before retrying."
                )
            else:
                raise Exception(
                    f"Zephyr API error (HTTP {res.status_code}): {res.text[:300]}"
                )

        except Exception as e:
            logger.error(f"[ZEPHYR_FETCH] Network or Parsing Exception: {str(e)}")
            raise e

    def normalize(self, data):
        """
        DATA MAPPER (Zephyr schema to VVNT schema)
        Logic: Maps the 'name' and 'precondition'/'description' nodes outputted by
        SmartBear into the strictly typed schema required by the AI Analyst.
        Calls BaseFetcher.normalize() to apply RequirementSanitizer HTML cleaning.
        """
        intermediate = {
            # Zephyr uses 'key' instead of 'id' in its JSON root.
            "id": data.get("key"),
            "summary": data.get("name", "Untitled Zephyr Case"),
            # Merge preconditions into the core description block for LLM parsing.
            "description": (data.get("description", "") + "\n" + data.get("precondition", "")).strip(),
            # Extract acceptance criteria from steps or objective field if present
            "acceptance_criteria": (
                [s.get("description", "") for s in data.get("testScript", {}).get("steps", []) if s.get("description")]
                or ([data.get("objective")] if data.get("objective") else [])
                or []
            ),
            "platform": "zephyr",
        }
        return super().normalize(intermediate)
