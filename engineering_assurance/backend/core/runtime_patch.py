import sys
import io
import os
import socket
import logging

# ── CRITICAL: Load .env into os.environ BEFORE any module reads environment vars ──
# pydantic-settings loads .env into the Settings object but does NOT export values
# to os.environ. Any code that calls os.getenv() directly (like SecretVault,
# litellm, httpx) will miss these values unless we export them here first.
# This must run before any other import in the application.
def _load_dotenv_to_environ():
    _root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    _env_path = os.path.join(_root, ".env")
    if not os.path.exists(_env_path):
        return
    try:
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#") or "=" not in _line:
                    continue
                _key, _, _val = _line.partition("=")
                _key = _key.strip()
                _val = _val.strip().strip('"').strip("'")
                # Only set if not already in environment (don't override shell exports)
                if _key and _val and _key not in os.environ:
                    os.environ[_key] = _val
    except Exception:
        pass

_load_dotenv_to_environ()

# --- NUCLEAR TIMEOUT SHIELD ---
# Sets a global default timeout for ALL socket operations in the process.
# This overrides library defaults (like the mysterious 12s) at the OS level.
socket.setdefaulttimeout(600.0)

# Enforce library specific overrides
# CRITICAL: These MUST be set before litellm is imported anywhere.
# litellm's Ollama handler (ollama_chat_completions.py) reads these during
# its initialization and caches them in an httpx.Client() instance.
os.environ["HTTPX_TIMEOUT"] = "600.0"
os.environ["HTTPX_CONNECT_TIMEOUT"] = "600.0"
os.environ["HTTPX_WRITE_TIMEOUT"] = "600.0"
os.environ["HTTPX_POOL_TIMEOUT"] = "600.0"
os.environ["LITELLM_REQUEST_TIMEOUT"] = "600"
os.environ["LITELLM_DEFAULT_TIMEOUT"] = "600"
os.environ["LITELLM_CONNECTION_TIMEOUT"] = "600"
os.environ["LITELLM_CONNECT_TIMEOUT"] = "600"
os.environ["LITELLM_API_TIMEOUT"] = "600"
os.environ["OLLAMA_TIMEOUT"] = "600"

# DIRECT LIBRARY PATCHING (Forceful)
try:
    import litellm
    litellm.request_timeout = 600
    litellm.timeout = 600
    litellm.connection_timeout = 600
    litellm.num_retries = 3
    litellm.drop_params = True # Safety for Ollama/Groq param drift
except ImportError:
    pass

def apply_production_hardening():
    """
    ACTION: Patches the Python runtime environment for high-concurrency 
    Mesh operations on Windows/Production hosts.
    """
    # 1. UTF-8 Force Protocol (Windows Fix)
    if sys.platform == "win32":
        import _locale
        _locale._getdefaultlocale = (lambda *args: ['en_US', 'utf8'])
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
        
    os.environ["LITELLM_CONNECT_TIMEOUT"] = "600"
    
    # 3. Suppress LiteLLM redundant debug noise
    os.environ["LITELLM_LOG"] = "ERROR"

if __name__ == "__main__":
    apply_production_hardening()
