"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - JIRA ISSUE FETCHER
================================================================================
This module handles communication with Jira Cloud/Server. It fetches User Stories
and normalizes their schema for downstream Agentic analysis.
"""

import os
import json
import requests
import logging
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
from backend.core.base_fetcher import BaseFetcher
from bs4 import BeautifulSoup

# Configure local logger for requirement ingestion diagnostics
logger = logging.getLogger(__name__)
load_dotenv()

class JiraIssueFetcher(BaseFetcher):
    """
    ENTERPRISE JIRA ADAPTER
    Logic: Fetches requirement data from Jira's REST API. Supports both Cloud 
    (Personal Access Tokens) and Server variants.
    """
    
    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Credential Injection and Precedence Logic.
        Logic: Prioritizes credentials from the 'Identity Vault' (router calls), 
        falling back to .env for developer-local execution.
        """
        self.jira_url = url or os.getenv("JIRA_URL")
        self.user_email = email or os.getenv("JIRA_EMAIL")
        self.api_token = token or os.getenv("JIRA_API_TOKEN")
        self.mock_path = mock_path

    def fetch(self, resource_id: str):
        """
        CORE FETCH LOGIC
        Flow:
        1. Handle Mock Data (If enabled in the environment).
        2. Validate credentials presence.
        3. Iterate through multiple API paths (Discovery Mode).
        4. Detect HTML-redirects (Security Layer).
        5. Map Jira fields (Summary, Desc) to the internal VVNT schema.
        """
        
        # Step 1: Handling the 'Mock Offline Source'
        # Logic: If a mock_path is provided, bypass Jira API and return a localized JSON sample.
        if self.mock_path and os.path.exists(self.mock_path):
            logger.info(f"[JIRA] Using Mock Data Source: {self.mock_path}")
            with open(self.mock_path, 'r', encoding='utf-8') as f:
                mock_data = json.load(f)
                return self.normalize({
                    "id": mock_data.get("jira_id"),
                    "summary": mock_data.get("summary"),
                    "description": mock_data.get("description"),
                    "acceptance_criteria": mock_data.get("acceptance_criteria"),
                    "platform": "jira"
                })

        # Step 2: Runtime Credential Availability Guard
        if not all([self.jira_url, self.user_email, self.api_token]):
            raise ValueError("Jira Authentication context is incomplete. Check Vault settings.")

        # Step 3: Multi-Path API Discovery
        # Logic: Some Jira Server versions require '/rest/api/latest' while Cloud 
        # prefers '/rest/api/2'. We try both sequentially.
        api_paths = [
            f"{self.jira_url.rstrip('/')}/rest/api/2/issue/{resource_id}?fields=summary,description,issuetype,status,project",
            f"{self.jira_url.rstrip('/')}/rest/api/latest/issue/{resource_id}?fields=summary,description,issuetype,status,project",
        ]
        
        # Standard Jira Auth: Basic Auth with Email/Token
        auth = HTTPBasicAuth(self.user_email, self.api_token)
        headers = {"Accept": "application/json"}
        last_error = None

        for url in api_paths:
            try:
                logger.info(f"[JIRA] Retrieval attempt: {url}")
                # Action: Perform the HTTP GET request to Jira REST.
                response = requests.get(url, headers=headers, auth=auth, timeout=15)
                content_type = response.headers.get("Content-Type", "")
                
                # Validation Logic: Status 200 OK
                if response.status_code == 200:
                    # Security Detail: If Jira returns HTML on a REST call, it means the URL 
                    # pointed to a Login Redirect or SSO screen, not the API.
                    if "text/html" in content_type:
                        raise Exception("Jira API returned HTML instead of JSON. Check the Context Path / SSO settings.")
                    
                    # Logic: Successfully retrieved JSON.
                    data = response.json()
                    fields = data.get("fields", {})
                    
                    # Normalization Step: Extract only what we need for the agentic reasoning.
                    raw_payload = {
                        "id": data.get("key"),
                        "project_key": fields.get("project", {}).get("key"),
                        "summary": fields.get("summary"),
                        # Logic: Use the helper to clean ADF/HTML from the description field.
                        "description": self._extract_description(fields.get("description")),
                        # AC extraction: try known custom field names before falling back to summary.
                        # Jira Cloud stores AC in customfield_10016 (Acceptance Criteria) or
                        # customfield_10014 depending on the project scheme. We try all common ones.
                        "acceptance_criteria": self._extract_acceptance_criteria(fields),
                        "platform": "jira"
                    }
                    # Return converted payload.
                    return self.normalize(raw_payload)
                
                # Logic: Specific handling for 404 (Ticket not found vs incorrect URL context).
                elif response.status_code == 404:
                    if "text/html" in content_type:
                        logger.warning(f"[JIRA] 404-HTML detected. URL likely invalid for this Jira instance.")
                        continue # Try the next URL in api_paths
                    else:
                        raise Exception(f"Issue '{resource_id}' does not exist in the targeted Jira instance.")
                
            except Exception as e:
                last_error = str(e)
                # Logic: If the error is specific to URL context, keep trying. 
                # Otherwise, break and report.
                if "API returned HTML" not in str(e):
                    break
        
        # Final failure reporting.
        raise Exception(f"Jira Retrieval Blocked: {last_error or 'Unknown error — all API paths exhausted'}")


    def fetch_historical_defects(self, project_key: str, days: int = 180):
        """
        EMPIRICAL SIGNAL: DEFECT DENSITY
        Logic: Fetches the count of recent bugs in the targeted project.
        This provides a quantitative risk multiplier for the AI agent.
        """
        if not all([self.jira_url, self.user_email, self.api_token]):
            return {"error": "Auth missing for defect mining"}
            
        # JQL: Bugs created in the last N days for this project.
        jql = f"project = {project_key} AND issuetype = Bug AND created >= -{days}d"
        url = f"{self.jira_url.rstrip('/')}/rest/api/2/search?jql={requests.utils.quote(jql)}&maxResults=0"
        
        auth = HTTPBasicAuth(self.user_email, self.api_token)
        try:
            logger.info(f"[JIRA] Mining defect trends: {jql}")
            response = requests.get(url, auth=auth, timeout=15)
            if response.status_code == 200:
                data = response.json()
                return {
                    "bug_count": data.get("total", 0),
                    "window_days": days,
                    "jql": jql
                }
        except Exception as e:
            logger.error(f"[JIRA-DEFECT-MINING-FAIL] {e}")
            
        return {"bug_count": 0, "error": "Search failed"}

    def _extract_acceptance_criteria(self, fields: dict) -> list:
        """
        AC EXTRACTION — tries all known Jira custom field names for Acceptance Criteria.
        Jira stores AC in different customfield_* IDs depending on the project scheme.
        Falls back to the summary only if no AC field is found at all.
        """
        # Common Jira custom field IDs for Acceptance Criteria across Cloud/Server schemes
        ac_field_candidates = [
            "customfield_10016",  # Most common Jira Cloud AC field
            "customfield_10014",  # Alternate AC field (some project templates)
            "customfield_10028",  # Jira Software AC field
            "customfield_10034",  # Another common variant
            "acceptance_criteria",  # Some custom Jira Server setups use this key directly
        ]

        for field_key in ac_field_candidates:
            value = fields.get(field_key)
            if not value:
                continue
            # ADF object (Jira Cloud)
            if isinstance(value, dict):
                text = self._extract_description(value)
                if text.strip():
                    return [line.strip() for line in text.splitlines() if line.strip()]
            # Plain string (Jira Server)
            if isinstance(value, str) and value.strip():
                from bs4 import BeautifulSoup
                try:
                    soup = BeautifulSoup(value, "html.parser")
                    text = soup.get_text(separator="\n").strip()
                except Exception:
                    text = value.strip()
                return [line.strip() for line in text.splitlines() if line.strip()]
            # List of strings
            if isinstance(value, list) and value:
                return [str(item).strip() for item in value if item]

        # Fallback: use summary as a minimal AC placeholder
        summary = fields.get("summary", "")
        return [summary] if summary else ["Acceptance criteria not specified"]

    def _extract_description(self, adf_desc):
        """
        TEXT EXTRACTION & CLEANING (ADF/HTML Layer)
        Action: Sanitizes Jira's 'Description' field.
        Logic: Jira Cloud uses 'Atlassian Document Format' (ADF) which is a nested 
        JSON object, not HTML. We must recursively parse ADF to extract pure text.
        If it's already a string (Jira Server), we strip HTML.
        """
        if not adf_desc:
            return ""

        # Logic: If it's ADF (dictionary), parse recursively.
        if isinstance(adf_desc, dict):
            return self._parse_adf_node(adf_desc)
            
        # If it's a string that looks like JSON ADF
        if isinstance(adf_desc, str) and adf_desc.strip().startswith('{"version"'):
            try:
                parsed_json = json.loads(adf_desc)
                return self._parse_adf_node(parsed_json)
            except:
                pass

        try:
            # Action: Treat input as HTML and strip all tags if not ADF.
            soup = BeautifulSoup(str(adf_desc), "html.parser")
            plain_text = soup.get_text(separator="\n").strip()
            return plain_text if plain_text else str(adf_desc)
        except Exception as e:
            logger.error(f"[JIRA] Desc-Parser failure: {e}")
            return str(adf_desc)

    def _parse_adf_node(self, node):
        """Recursively extracts plain text from an ADF JSON node."""
        if not isinstance(node, dict):
            return ""
            
        text_blocks = []
        
        # If the node is of type 'text', it has the actual string
        if node.get("type") == "text" and "text" in node:
            text_blocks.append(node["text"])
            
        # Recursive processing of children
        for key in ["content", "marks", "attrs"]:
            if key in node and isinstance(node[key], list):
                for child in node[key]:
                    if isinstance(child, dict):
                        text_blocks.append(self._parse_adf_node(child))
                        
        return "\n".join(filter(None, text_blocks))
