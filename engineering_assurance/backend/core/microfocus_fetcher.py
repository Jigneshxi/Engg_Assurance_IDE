"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - MICRO FOCUS / HP ALM FETCHER
================================================================================
This module handles communication with historical/legacy Test Management 
platforms like HP ALM / Micro Focus Quality Center. 
"""

import requests
import json
import os
import logging
from .base_fetcher import BaseFetcher

# Configure local logger
logger = logging.getLogger(__name__)

class MicroFocusFetcher(BaseFetcher):
    """
    LEGACY ENTERPRISE ADAPTER
    Logic: Pulls requirements from ALM's REST API. Crucial for organizations 
    migrating from legacy waterfall processes to modern AI-driven agile strategies.
    """
    
    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Variable Injection for ALM Auth.
        Logic: Prioritizes UI Vault variables over `.env` fallbacks.
        Note: ALM uses literal username/password (basic auth) rather than PATs.
        Domain and project can be embedded in the URL as path segments
        (e.g. https://alm.company.com/qcbin/rest/domains/MYDOM/projects/MYPROJ)
        or set via ALM_DOMAIN / ALM_PROJECT env vars.
        """
        self.url = url or os.getenv("ALM_URL")
        self.email = email or os.getenv("ALM_USER")
        self.token = token or os.getenv("ALM_PASS")
        self.mock_path = mock_path
        # Extract domain/project from URL if embedded, else use env vars
        self.domain, self.project = self._parse_domain_project(self.url)

    @staticmethod
    def _parse_domain_project(url: str):
        """
        Extract domain and project from an ALM URL if embedded.
        e.g. https://alm.co/qcbin/rest/domains/MYDOM/projects/MYPROJ -> ('MYDOM', 'MYPROJ')
        Falls back to env vars ALM_DOMAIN / ALM_PROJECT.
        """
        import re
        if url:
            m = re.search(r'/domains/([^/]+)/projects/([^/]+)', url)
            if m:
                return m.group(1), m.group(2)
        return os.getenv("ALM_DOMAIN", "DEFAULT"), os.getenv("ALM_PROJECT", "DEMO")

    def fetch(self, resource_id):
        """
        CORE FETCH (HP ALM REST API)
        Flow:
        1. Validate Mock Configuration.
        2. Verify ALM credentials.
        3. Dispatch GET request to qcbin/rest endpoint.
        4. Transmute ALM's deeply nested 'Fields' array to standard VVNT schema.
        """
        try:
            # Step 1: Handling the 'Mock Offline Source'
            # Logic: If resource_id is a known demo ("REST-101"), bypass API.
            if resource_id.upper() == "REST-101" or (self.mock_path and os.path.exists(self.mock_path)):
                path = self.mock_path if self.mock_path and os.path.exists(self.mock_path) else os.path.join(os.getcwd(), ".tmp", "mock_jira_issue.json")
                if os.path.exists(path):
                    logger.info("[ALM] Using offline mock data.")
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    return self.normalize({
                        "id": data.get("jira_id") or "ALM-101",
                        "summary": data.get("summary") or "HP ALM Requirement",
                        "description": data.get("description") or "Imported from Micro Focus ALM.",
                        "platform": "alm"
                    })

            # Step 2: Ensure Active Credentials
            if not all([self.url, self.email, self.token]):
                raise Exception("HP ALM Credentials missing. Ensure URL, User, and Pass are provided.")

            # Step 3: Dispatch API Request using domain/project from constructor
            fetch_url = f"{self.url.rstrip('/')}/qcbin/rest/domains/{self.domain}/projects/{self.project}/requirements/{resource_id}"
            auth = (self.email, self.token)
            
            logger.info(f"[ALM] Fetching requirement {resource_id}...")
            res = requests.get(fetch_url, auth=auth, headers={'Accept': 'application/json'}, timeout=15)
            
            if res.status_code == 200:
                data = res.json()
                return self.normalize(data) # The normalize method maps the data
            else:
                raise Exception(f"HP ALM API Rejection (Status {res.status_code}): {res.text}")

        except Exception as e:
            logger.error(f"[ALM_FETCH] Network or Parsing Exception: {str(e)}")
            raise e

    def normalize(self, data):
        """
        DATA MAPPER (ALM schema to VVNT schema)
        Logic: HP ALM wraps metadata inside an array of 'Fields' objects rather 
        than a traditional flat JSON structure.
        Calls BaseFetcher.normalize() to apply RequirementSanitizer HTML cleaning.
        """
        fields = data.get('Fields', [])
        
        # Scenario A: Real ALM Payload (Nested Field Dictionary)
        if fields:
            title = next((f['values'][0]['value'] for f in fields if f['Name'] == 'name'), "Untitled QC Req")
            desc = next((f['values'][0]['value'] for f in fields if f['Name'] == 'description'), "")
            ac_raw = next((f['values'][0]['value'] for f in fields if f['Name'] == 'user-acceptance-criteria'), "")
            rid = str(data.get('id', 'N/A'))
        
        # Scenario B: Mock Payload Handling (Flat Dictionary)
        else:
            title = data.get('summary') or data.get('title', "Untitled QC Req")
            desc = data.get('description', "")
            ac_raw = data.get('acceptance_criteria', "")
            rid = str(data.get('id', 'N/A'))

        intermediate = {
            "id": rid,
            "summary": title,
            "description": desc,
            "acceptance_criteria": [ac_raw] if isinstance(ac_raw, str) and ac_raw else (ac_raw if isinstance(ac_raw, list) else []),
            "platform": "alm",
        }
        return super().normalize(intermediate)
