"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - ADO WORK ITEM FETCHER
================================================================================
This module handles communication with Azure DevOps (ADO) Services. It fetches 
Work Items (User Stories, Tasks) and normalizes their schema for AI analysis.
"""

import os
import json
import base64
import requests
import logging
from dotenv import load_dotenv
from .base_fetcher import BaseFetcher

# Configure local logger for ADO-specific ingestion diagnostics
logger = logging.getLogger(__name__)
load_dotenv()

class AdoIssueFetcher(BaseFetcher):
    """
    ENTERPRISE ADO ADAPTER
    Logic: Fetches requirement data from ADO's REST API using Personal Access Tokens (PAT).
    Maps System-level fields (e.g. System.Title) to our universal internal model.
    """
    
    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Credential Injection and Precedence Logic.
        Logic: Prioritizes credentials from the 'Identity Vault' (router calls), 
        falling back to .env for developer-local execution.
        Note: ADO uses PAT tokens which are technically 'alternate passwords'.
        """
        self.ado_url = url or os.getenv("ADO_URL")
        # Support both ADO_PAT and injected 'token' for flexibility.
        self.ado_token = token or os.getenv("ADO_PAT") or token
        # ADO_PROJECT can be embedded in the URL as a path segment or passed separately.
        # If url contains a project path (e.g. https://dev.azure.com/org/MyProject),
        # we extract it; otherwise fall back to the ADO_PROJECT env var.
        self._project_from_url = self._parse_project_from_url(self.ado_url)
        self.mock_path = mock_path

    @staticmethod
    def _parse_project_from_url(url: str) -> str:
        """
        Extract the project name from an ADO URL if embedded.
        e.g. https://dev.azure.com/myorg/MyProject -> 'MyProject'
        Returns empty string if not found.
        """
        if not url:
            return ""
        parts = url.rstrip("/").split("/")
        # dev.azure.com/org/project or org.visualstudio.com/project
        if "dev.azure.com" in url and len(parts) >= 5:
            return parts[4]
        if "visualstudio.com" in url and len(parts) >= 4:
            return parts[3]
        return ""

    def fetch(self, resource_id: str):
        """
        CORE FETCH LOGIC
        Flow:
        1. Handle Mock Offline Data (If enabled).
        2. Resolve Project Context from environment.
        3. Prepare B64-Encoded PAT Auth Header.
        4. Dispatch GET request to ADO WIT (Work Item Tracking) API.
        5. Map ADO's hierarchical field map to the internal VVNT schema.
        """
        
        # Step 1: Handling the 'Mock Offline Source'
        # Logic: If a mock_path is provided, bypass ADO API and return a localized JSON sample.
        if self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[ADO] Using Mock Data Source: {self.mock_path}")
            with open(self.mock_path, 'r', encoding='utf-8') as f:
                mock_data = json.load(f)
                return self.normalize({
                    "id": mock_data.get("id"),
                    "summary": mock_data.get("summary"),
                    "description": mock_data.get("description"),
                    "acceptance_criteria": mock_data.get("acceptance_criteria"),
                    "platform": "ado"
                })

        # Step 2: Runtime Environment Guard
        # ADO project: prefer URL-embedded project, then env var.
        ado_project = self._project_from_url or os.getenv("ADO_PROJECT")
        if not all([self.ado_url, ado_project, self.ado_token]):
            raise ValueError("ADO Ingestion Context is incomplete. Ensure URL (with project path), and PAT are set.")

        # Step 3: Base64 Authentication Preparation
        # Logic: ADO's PAT-based Basic Auth uses an empty username and the token.
        # Format: ":[PAT_TOKEN]" -> encode to UTF-8 -> b64encode.
        auth_string = f":{self.ado_token}"
        auth_header = base64.b64encode(auth_string.encode()).decode()
        
        # Action: Construct the REST URL targeting ADO WIT v7.1.
        url = f"{self.ado_url.rstrip('/')}/{ado_project}/_apis/wit/workitems/{resource_id}?api-version=7.1"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Basic {auth_header}"
        }

        logger.info(f"[ADO] Requesting Work Item ID: {resource_id}...")
        
        try:
            # Step 4: Dispatch Network Call
            response = requests.get(url, headers=headers, timeout=15)
            
            # Logic: Status 200 OK Check.
            if response.status_code == 200:
                data = response.json()
                fields = data.get("fields", {})
                
                # Step 5: Hierarchical Field Normalization
                # Logic: ADO stores data in a flat dictionary using dotted keys (System.*).
                # Title -> System.Title
                # Description -> System.Description
                # AC -> Microsoft.VSTS.Common.AcceptanceCriteria (Standard CMMI/Scrum field)
                raw_payload = {
                    "id": data.get("id"),
                    "summary": fields.get("System.Title", "Untitled ADO Item"),
                    "description": fields.get("System.Description", "No description provided."),
                    "acceptance_criteria": [fields.get("Microsoft.VSTS.Common.AcceptanceCriteria", "AC Pending Analysis")],
                    "platform": "ado"
                }
                # Return converted payload for agentic consumption.
                return self.normalize(raw_payload)
            else:
                # Logic: Log non-200 responses (401 Unauthorized, 404 Not Found).
                error_msg = f"ADO API Rejection (Status {response.status_code}): {response.text[:200]}"
                logger.error(f"[ADO] {error_msg}")
                raise Exception(error_msg)
                
        except Exception as e:
            # Generic error handling for timeouts or network interruptions.
            logger.error(f"[ADO] Network or Parsing catastrophic failure: {e}")
            raise
