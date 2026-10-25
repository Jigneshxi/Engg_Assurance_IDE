"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - BASE ALM ADAPTER (ABC contract)
================================================================================
This module defines the strict abstract schema required for extending the 
A.N.T. architecture to new Application Lifecycle Management (ALM) tools.
"""

from abc import ABC, abstractmethod
import json
import re

class BaseFetcher(ABC):
    """
    UNIVERSAL INGESTION CONTRACT
    Logic: Abstract Base Class defining the operational blueprint for all fetchers.
    Forces polymorphism so the `workflow.py` state graph can confidently call `.fetch()`
    on any instantiated ALM connector without knowing its specific network logic.
    """
    
    @abstractmethod
    def fetch(self, resource_id):
        """
        ACTION CONTRACT: 
        Must accept a string ID, negotiate authentication with the underlying ALM, 
        execute the REST/GraphQL network call, and return the `normalize()`d dictionary.
        """
        pass

    def normalize(self, raw_data: dict) -> dict:
        """
        DATA MAPPER: The 'Unified VVNT Schema' Enforcement
        
        Architecture Decision:
            Sanitization is applied HERE at the contract boundary, not inside
            individual fetchers. This guarantees that regardless of source
            (Jira ADF, ADO HTML, SharePoint DOCX, etc.) ALL downstream code 
            receives clean plain-English text.
        """
        from backend.core.utils import RequirementSanitizer
        from backend.core.ingestion_intelligence import build_requirement_intelligence

        raw_desc = raw_data.get("description") or ""
        raw_ac = raw_data.get("acceptance_criteria") or []

        # Sanitize description (handles HTML, macros, encoded entities from any source)
        clean_desc = RequirementSanitizer.run(raw_desc) if isinstance(raw_desc, str) else str(raw_desc)

        # Sanitize each acceptance criteria entry (may be list or raw string)
        if isinstance(raw_ac, list):
            clean_ac = [RequirementSanitizer.run(str(item)) for item in raw_ac if item]
        else:
            clean_ac = [RequirementSanitizer.run(str(raw_ac))] if raw_ac else []

        def _is_generic_acceptance(text: str) -> bool:
            candidate = re.sub(r"\s+", " ", str(text or "")).strip().lower()
            if not candidate:
                return True
            return candidate in {
                "manual validation required",
                "manual validation required (audit failed)",
                "manual review required",
                "verify requirements as described",
                "acceptance criteria not specified",
                "tbd",
                "pending",
                "...",
            } or candidate.startswith("manual validation required")

        if not clean_ac or all(_is_generic_acceptance(item) for item in clean_ac):
            derived = build_requirement_intelligence(
                raw_desc if isinstance(raw_desc, str) else str(raw_desc),
                summary=str(raw_data.get("summary") or ""),
                description=str(raw_desc or ""),
                acceptance_criteria=raw_ac if isinstance(raw_ac, list) else ([raw_ac] if raw_ac else []),
                modules=raw_data.get("modules") if isinstance(raw_data.get("modules"), list) else [],
                platform=str(raw_data.get("platform", "unknown")),
            )
            derived_ac = derived.get("acceptance_criteria", [])
            if derived_ac:
                clean_ac = [RequirementSanitizer.run(str(item)) for item in derived_ac if item]
            metadata_hint = derived.get("metadata", {})
        else:
            metadata_hint = {}

        # NUCLEAR-GRADE METADATA SCRUB: Prevents 'FetchSource' object leakage.
        def force_json_native(obj):
            try:
                return json.loads(json.dumps(obj, default=str))
            except:
                return {"parsing_error": "Metadata could not be safely serialized"}

        return {
            "id": raw_data.get("id"),
            "summary": (raw_data.get("summary") or "").strip() or "No Summary",
            "description": clean_desc,
            "acceptance_criteria": clean_ac,
            "platform": raw_data.get("platform", "unknown"),
            "metadata": force_json_native({**raw_data, **({"ingestion_intelligence": metadata_hint} if metadata_hint else {})})
        }
