"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - FETCHER FACTORY (Registry Pattern)
================================================================================
Architecture: Universal Requirement Ingestion Dispatcher.

PURPOSE:
This module implements a classic Registry/Factory pattern to decouple the 
Agentic Workflow from the idiosyncratic APIs of varied ALM (Application 
Lifecycle Management) and SCM (Source Control Management) tools.

EXTENSIBILITY:
To add a new source (e.g., Salesforce, ServiceNow):
1. Create a concrete class implementing the BaseFetcher interface.
2. Register the string identifier in the 'platforms' dictionary below.
"""

# Concrete Adapters: Each encapsulates the logic for a specific external API.
from .jira_issue_fetcher import JiraIssueFetcher
from .ado_issue_fetcher import AdoIssueFetcher
from .xray_fetcher import XrayFetcher
from .testrail_fetcher import TestRailFetcher
from .zephyr_fetcher import ZephyrFetcher
from .qtest_fetcher import QtestFetcher
from .microfocus_fetcher import MicroFocusFetcher
from .github_fetcher import GitHubFetcher
from .sharepoint_fetcher import SharePointFetcher
from .google_drive_fetcher import GoogleDriveFetcher
from .local_fetcher import LocalFetcher
from .institutional_fetcher import InstitutionalFetcher
# ISS-011 FIX: New dedicated fetchers for previously unsupported source types
from .video_transcript_fetcher import VideoTranscriptFetcher
from .image_ocr_fetcher import ImageOCRFetcher
from .network_path_fetcher import NetworkPathFetcher

class FetcherFactory:
    """
    ARCHITECTURE: UNIVERSAL DISPATCHER
    
    The Factory acts as a single point of failure and logging for all 
    credential injection and external data retrieval.
    """
    
    @staticmethod
    def get_fetcher(platform: str, url=None, email=None, token=None, mock_path=None):
        """
        ACTION: Instantiates the dedicated Concrete Fetcher for the requested tier.
        
        LOGIC STAGES:
        1. NORMALIZATION: Lowercases the platform string to handle 'Jira' vs 'jira'.
        2. LOOKUP: Validates the request against the 'platforms' registry.
        3. INJECTION: Passes credentials (decrypted by the Vault) into the constructor.
        4. MOCKING: If 'mock_path' is provided, the fetcher returns local sample data 
           instead of querying the external API (Critical for E2E Testing).
        """
        
        # PLATFORM REGISTRY: The authoritative mapping of tool-IDs to Logic Adapters.
        platforms = {
            # --- ALM & Test Management ---
            "jira": JiraIssueFetcher,
            "ado": AdoIssueFetcher,
            "rally": InstitutionalFetcher,
            "swagger": InstitutionalFetcher,
            "xray": XrayFetcher,
            "testrail": TestRailFetcher,
            "zephyr": ZephyrFetcher,
            "qtest": QtestFetcher,
            "alm": MicroFocusFetcher,
            "microfocus": MicroFocusFetcher,
            "polarion": InstitutionalFetcher,

            # --- SCM & Git Platforms (Shared Logic) ---
            "github": GitHubFetcher,
            "gitlab": GitHubFetcher,
            "bitbucket": GitHubFetcher,

            # --- Strategic & Cloud Repositories ---
            "sharepoint": SharePointFetcher,
            "onedrive": SharePointFetcher,
            "googledrive": GoogleDriveFetcher,   # Google Drive API v3 — separate from SharePoint
            "notion": InstitutionalFetcher,
            "confluence": InstitutionalFetcher,

            # --- Ad-Hoc & Conversational Sources ---
            "directpaste": LocalFetcher,
            "slack": LocalFetcher,
            "teams": LocalFetcher,
            "fileupload": LocalFetcher,

            # ISS-011 FIX: Dedicated fetchers for media/network sources
            # Previously these fell through to InstitutionalFetcher (generic/mock output)
            "mediaupload": ImageOCRFetcher,     # Image files → OCR extraction
            "video": VideoTranscriptFetcher,    # Video/audio files → Whisper transcription
            "networkpath": NetworkPathFetcher,  # URLs, Swagger specs, local/UNC paths
            "swagger": NetworkPathFetcher,      # OpenAPI/Swagger specs → endpoint requirements

            "doors": InstitutionalFetcher,
            "jama": InstitutionalFetcher,
        }
        
        # Stage 1: Normalize identification key.
        platform_key = platform.lower()
        fetcher_class = platforms.get(platform_key)
        
        # Stage 2: Guard Clause for Unsupported Sources.
        if not fetcher_class:
            # ISS-012 FIX: Distinguish "platform not supported" from "token not configured"
            # to give users a clear, actionable error message.
            raise ValueError(
                f"Platform '{platform}' is not supported. "
                "If this is a new integration, contact the Core Engineering team to add a Logic Adapter. "
                "If you expected this platform to work, check that your vault credentials are configured "
                "in Settings → Environment Vault."
            )
            
        # Stage 3: Operational Logging.
        # This print event helps trace connectivity in the backend logs during agent reasoning.
        print(f"[FETCH-FACTORY] Routing request to dedicated {platform.upper()} Adapter.")
        
        # Stage 4: Constructive Dependency Injection.
        # All Registered classes MUST adhere to the (url, email, token, mock_path) 
        # signature in their __init__ method.
        return fetcher_class(url=url, email=email, token=token, mock_path=mock_path)
