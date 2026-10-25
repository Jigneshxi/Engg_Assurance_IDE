import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

def normalize_path(path: str) -> str:
    """Normalize path slashes to forward slashes for matching."""
    return path.replace('\\', '/')

def get_tasks_for_file_change(file_path: str, tasks: List[Dict]) -> List[str]:
    """
    Given an absolute file path from watchdog, match it against the explicit 
    target_paths convention in the tasks array and return the matched task_ids.
    
    Convention from engineering_contract_node:
    Frontend changes -> "apps/frontend/src/..."
    Backend changes -> "packages/backend/api/..." or "packages/backend/core/..."
    Database changes -> "infrastructure/db/..."
    """
    matched_task_ids = set()
    normalized_file_path = normalize_path(file_path)
    
    for task in tasks:
        target_paths = task.get('target_paths', [])
        # The AI might return a single string or a list of strings
        if isinstance(target_paths, str):
            target_paths = [target_paths]
            
        for tp in target_paths:
            normalized_tp = normalize_path(tp)
            # Remove leading slash or dot-slash if present
            if normalized_tp.startswith('./'):
                normalized_tp = normalized_tp[2:]
            elif normalized_tp.startswith('/'):
                normalized_tp = normalized_tp[1:]
                
            # Basic substring match, assuming target paths are unique enough prefixes or suffixes
            # e.g., 'apps/frontend/src/App.tsx' in 'C:/Workspace/apps/frontend/src/App.tsx'
            if normalized_tp in normalized_file_path:
                matched_task_ids.add(task.get('task_id'))
                
    return list(matched_task_ids)
