"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - TESTRAIL FETCHER
================================================================================
This module handles communication with TestRail. It ingests existing Test Cases 
and normalizes them into the universal STLC Schema for agentic context mapping.
"""

import requests
import json
import os
import logging
from .base_fetcher import BaseFetcher

# Configure local logger for integration diagnostics
logger = logging.getLogger(__name__)

class TestRailFetcher(BaseFetcher):
    """
    ENTERPRISE TESTRAIL ADAPTER
    Logic: Pulls test cases from TestRail's v2 REST API. 
    Maps TestRail's internal 'Case' abstractions to our 'Requirement/Context' abstraction.
    """
    
    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Variable Injection for TestRail Auth.
        Logic: Prioritizes credentials from the Identity Vault, falling back to 
        the local .env for development.
        """
        self.url = url or os.getenv("TESTRAIL_URL")
        self.email = email or os.getenv("TESTRAIL_USER")
        self.token = token or os.getenv("TESTRAIL_KEY")
        self.mock_path = mock_path

    def fetch(self, resource_id):
        """
        CORE FETCH (TestRail API v2)
        Flow:
        1. Handle Mock offline routing.
        2. Verify Auth Context.
        3. Trim the 'C' prefix standard in TestRail UI IDs.
        4. Execute GET and normalize payload.
        """
        try:
            # Step 1: Handling the 'Mock Offline Source'
            enable_mocks = os.getenv("ENABLE_OFFLINE_MOCKS", "false").lower() == "true"
            if enable_mocks and (resource_id.upper() == "REST-101" or (self.mock_path and os.path.exists(self.mock_path))):
                path = self.mock_path if (self.mock_path and os.path.exists(self.mock_path)) else None
                if path:
                    logger.info("[TESTRAIL] Utilizing isolated mock payload.")
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    return self.normalize({
                        "id": f"C{data.get('id') or '101'}",
                        "title": data.get("summary", "Test Case Ingested"),
                        "description": data.get("description", "Imported from Mock TestRail."),
                        "platform": "testrail"
                    })
                # If mock_path was requested but file doesn't exist, raise clearly
                if self.mock_path:
                    raise FileNotFoundError(f"TestRail mock file not found: {self.mock_path}")

            # Step 2: Ensure Active Credentials
            if not all([self.url, self.email, self.token]):
                raise Exception("TestRail Credentials missing. Ensure URL, USER, and KEY are provided.")

            # Step 3: Prefix Normalization
            # TestRail engineers often copy IDs with 'C' (e.g., C1234). 
            # The API strictly demands pure integers.
            case_id = resource_id.lstrip('C')
            
            # Construct standard v2 API URI
            fetch_url = f"{self.url.rstrip('/')}/index.php?/api/v2/get_case/{case_id}"
            
            # Step 4: Dispatch Request
            # Note: TestRail allows basic auth using Email and API Key.
            auth = (self.email, self.token)
            logger.info(f"[TESTRAIL] Dispatching request for Case ID: {case_id}")
            res = requests.get(fetch_url, auth=auth, headers={'Content-Type': 'application/json'}, timeout=15)
            
            if res.status_code == 200:
                data = res.json()
                return self.normalize(data) # Route to internal mapper
            else:
                raise Exception(f"TestRail API Rejection (Status {res.status_code}): {res.text}")

        except Exception as e:
            logger.error(f"[TESTRAIL_FETCH] Exception: {str(e)}")
            raise e

    def normalize(self, data):
        """
        DATA MAPPER (TestRail schema to VVNT schema)
        Logic: Maps the idiosyncratic JSON from `get_case` to our LangGraph payload map.
        Specifically merges custom fields (preconds + steps) into the unified 'description'.
        Calls BaseFetcher.normalize() to apply RequirementSanitizer HTML cleaning.
        """
        # Safe extraction of complex step strings
        preconditions = data.get("custom_preconds", "")
        steps = data.get("custom_steps_separated", "")
        combined_desc = data.get("description") or f"Preconditions:\n{preconditions}\n\nSteps:\n{steps}"

        # Build the intermediate payload and route through BaseFetcher for HTML sanitization
        intermediate = {
            # Reattach the 'C' for UI consistency if missing
            "id": f"C{data.get('id', 'N/A')}" if not str(data.get('id', '')).startswith('C') else data.get('id'),
            "summary": data.get("title") or data.get("summary") or "Untitled Test Case",
            "description": combined_desc,
            "acceptance_criteria": data.get("acceptance_criteria") or [],
            "platform": "testrail",
        }
        return super().normalize(intermediate)
