"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - LOCAL & MANUAL FETCHER
================================================================================
This module handles direct user input or local file parsing when an organization 
is not using a connected ALM.
"""

import os
import json
import logging
from .base_fetcher import BaseFetcher

# Configure local logger
logger = logging.getLogger(__name__)

class LocalFetcher(BaseFetcher):
    """
    MANUAL INGESTION ADAPTER
    Logic: Supports direct content injection (paste from the UI) or 
    future processing of local markdown/text files.
    """
    
    def __init__(self, url=None, email=None, token=None, mock_path=None):
        """
        Action: Initializes local processing context. 
        Note: Credentials are intentionally ignored.
        """
        self.mock_path = mock_path

    def fetch(self, resource_id):
        """
        CORE FETCH (Direct Passthrough)
        Flow: In the 'Local' configuration, the React UI sends the full 
        pasted requirement text *as* the 'resource_id'. 
        """
        # Logic: We truncate the log output to avoid blasting the terminal with huge text blocks.
        logger.info(f"[FETCH-LOCAL] Processing manual/local source: {resource_id[:50]}...")
        
        text_content = resource_id
        if len(resource_id) < 255 and '\n' not in resource_id:
            try:
                from backend.core.config import settings
                temp_dir = os.path.join(settings.BASE_DIR, "temp_data")
                file_path = os.path.join(temp_dir, resource_id)
                if os.path.exists(file_path):
                    logger.info(f"[FETCH-LOCAL] Identified local file {file_path}. Extracting content.")
                    import re
                    if file_path.lower().endswith('.docx'):
                        import docx
                        doc = docx.Document(file_path)
                        raw_text = "\n".join([p.text for p in doc.paragraphs])
                    else:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            raw_text = f.read()
                    
                    # Heal hard line breaks from PDF to DOCX conversions immediately
                    text_content = re.sub(r"([^.!?:\n])\s*\n\s*([a-zA-Z0-9.,])", r"\1 \2", raw_text)
            except Exception as e:
                logger.error(f"[FETCH-LOCAL] Failed to read {resource_id}: {e}")

        # Map the direct paste into the LangGraph expected schema.
        data = {
            "id": "MANUAL-001",
            "summary": resource_id.split('\n')[0][:80], # First line parsed as the Title
            "description": text_content,                # Full block parsed as Description
            "acceptance_criteria": ["Manual validation required"],
            "platform": "local"
        }
        
        return self.normalize(data)

