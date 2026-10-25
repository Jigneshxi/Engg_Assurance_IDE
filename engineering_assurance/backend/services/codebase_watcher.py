import threading
import logging
import time
from typing import Dict
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logger = logging.getLogger(__name__)

_watcher_registry: Dict[str, Observer] = {}
_registry_lock = threading.Lock()

class CodebaseEventHandler(FileSystemEventHandler):
    def __init__(self, mission_id: str, base_path: str):
        self.mission_id = mission_id
        self.base_path = base_path
        super().__init__()

    def _handle_file_event(self, event):
        if event.is_directory:
            return
        
        file_path = event.src_path
        # Skip temporary files, git directories, test files (prevent infinite loop)
        if ".git" in file_path or "__pycache__" in file_path or ".pytest_cache" in file_path or "node_modules" in file_path:
            return
        
        import os
        import json
        
        basename = os.path.basename(file_path)
        if basename.startswith("test_") or basename.startswith("_test_"):
            return
        
        # Always broadcast file events to the TDD Execution Stream
        try:
            from backend.services.test_broadcaster import broadcaster
            import asyncio
            rel_path = os.path.relpath(file_path, self.base_path) if self.base_path else file_path
            event_type = getattr(event, 'event_type', 'modified')
            
            async def _broadcast():
                await broadcaster.broadcast(self.mission_id, f"[WATCHER] File {event_type}: {rel_path}")
            
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(_broadcast())
            except RuntimeError:
                asyncio.run(_broadcast())
        except Exception as be:
            logger.debug(f"[WATCHER] Broadcast failed (non-fatal): {be}")
        
        # Defer to TDD executor for running tests on changed files
        def invoke_tdd(changed_files_batch):
            import asyncio
            from backend.services.tdd_executor import run_tdd_for_changed_files
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(run_tdd_for_changed_files(self.mission_id, list(changed_files_batch)))
            except RuntimeError:
                asyncio.run(run_tdd_for_changed_files(self.mission_id, list(changed_files_batch)))
                
        # Debounce execution
        with _registry_lock:
            if not hasattr(self, "_pending_files"):
                self._pending_files = set()
            if not hasattr(self, "_debounce_timer") or self._debounce_timer is None:
                self._debounce_timer = None
                
            self._pending_files.add(file_path)
            
            if self._debounce_timer is not None:
                self._debounce_timer.cancel()
                
            def timer_callback():
                with _registry_lock:
                    batch = self._pending_files.copy()
                    self._pending_files.clear()
                    self._debounce_timer = None
                if batch:
                    invoke_tdd(batch)
                    
            self._debounce_timer = threading.Timer(2.0, timer_callback)
            self._debounce_timer.start()

    def on_modified(self, event):
        self._handle_file_event(event)

    def on_created(self, event):
        self._handle_file_event(event)


def start_watcher(mission_id: str, path: str):
    """Start a codebase watcher for the given mission."""
    with _registry_lock:
        if mission_id in _watcher_registry:
            logger.info(f"Watcher already running for mission {mission_id}")
            return True
            
        try:
            event_handler = CodebaseEventHandler(mission_id, path)
            observer = Observer()
            observer.schedule(event_handler, path, recursive=True)
            observer.start()
            _watcher_registry[mission_id] = observer
            logger.info(f"Started watcher for mission {mission_id} at {path}")
            return True
        except Exception as e:
            logger.error(f"Failed to start watcher for mission {mission_id}: {e}")
            return False

def stop_watcher(mission_id: str):
    """Stop the codebase watcher for the given mission."""
    with _registry_lock:
        observer = _watcher_registry.pop(mission_id, None)
        
    if observer:
        try:
            observer.stop()
            observer.join(timeout=2)
            logger.info(f"Stopped watcher for mission {mission_id}")
            return True
        except Exception as e:
            logger.error(f"Error stopping watcher for mission {mission_id}: {e}")
            return False
    return True

def stop_all_watchers():
    """Stop all active watchers, used for shutdown events."""
    with _registry_lock:
        mission_ids = list(_watcher_registry.keys())
        
    for mission_id in mission_ids:
        stop_watcher(mission_id)
