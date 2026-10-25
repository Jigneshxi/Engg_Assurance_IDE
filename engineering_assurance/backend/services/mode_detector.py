"""
================================================================================
MODE DETECTOR — Greenfield / Brownfield Classification
================================================================================
Analyzes a cloned repository to determine the generation mode:
- Greenfield: Empty or near-empty repo (scaffolding + full generation)
- Brownfield: Existing codebase (context model + append/update generation)
"""

import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Thresholds
GREENFIELD_MAX_FILES = 10        # Repos with <= this many source files are greenfield
GREENFIELD_MAX_SOURCE_FILES = 5  # Repos with <= this many code files are greenfield


def detect_mode(repo_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Determine if the repo is greenfield or brownfield based on the RepoProfile.
    
    Args:
        repo_profile: Output from build_repo_profile()
    
    Returns:
        {
            "mode": "greenfield" | "brownfield",
            "confidence": float (0.0-1.0),
            "reason": str,
            "file_count": int,
            "source_file_count": int,
            "languages": list
        }
    """
    file_count = repo_profile.get("file_count", 0)
    source_file_count = repo_profile.get("source_file_count", 0)
    languages = repo_profile.get("languages", [])
    frameworks = repo_profile.get("frameworks", [])

    # Decision logic
    if file_count == 0:
        return {
            "mode": "greenfield",
            "confidence": 1.0,
            "reason": "Repository is completely empty",
            "file_count": 0,
            "source_file_count": 0,
            "languages": [],
        }

    if source_file_count <= GREENFIELD_MAX_SOURCE_FILES:
        # Near-empty: only boilerplate files (README, LICENSE, .gitignore, etc.)
        return {
            "mode": "greenfield",
            "confidence": 0.9,
            "reason": f"Only {source_file_count} source files detected — likely scaffolding only",
            "file_count": file_count,
            "source_file_count": source_file_count,
            "languages": [l["name"] for l in languages],
        }

    if file_count <= GREENFIELD_MAX_FILES and not frameworks:
        return {
            "mode": "greenfield",
            "confidence": 0.8,
            "reason": f"{file_count} total files, no framework detected — appears to be a starter project",
            "file_count": file_count,
            "source_file_count": source_file_count,
            "languages": [l["name"] for l in languages],
        }

    # Brownfield
    confidence = min(0.95, 0.7 + (source_file_count / 100) * 0.25)
    return {
        "mode": "brownfield",
        "confidence": round(confidence, 2),
        "reason": f"{source_file_count} source files across {len(languages)} language(s) with frameworks: {frameworks}",
        "file_count": file_count,
        "source_file_count": source_file_count,
        "languages": [l["name"] for l in languages],
    }
