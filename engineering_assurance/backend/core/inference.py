"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - HARDENED INFERENCE COORDINATOR
================================================================================
Architecture: Eager Strategy Pattern with High-Fidelity Multi-Tier Mesh.

OPERATIONAL CORE:
- Orchestrates failover across Strategic, Primary, and Economy cloud pools.
- Implements a zero-down-time failover to Local Ollama (Privacy Shield).
- Enforces strict JSON refusal trapping to prevent 'Hollow' AI responses.
- HARDENED: 90s per-call timeout + 120s crew execution ceiling to prevent hangs.
"""

import os
import json
import logging
import re
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from backend.core.database import SessionLocal
from backend.core.identity_orchestrator import IdentityOrchestrator
from backend.core.rotation_engine import MaintenanceEngine
from backend.core.crew_nodes import LLMConfig

logger = logging.getLogger(__name__)

from backend.core.config import settings
import os
import litellm

# --- TITANIUM TIMEOUT ARMOR (Production Grade) ---
# Logic: We set these in os.environ to ensure underlying libraries like httpx/aiohttp 
# capture them regardless of litellm's internal global state.
os.environ["LITELLM_REQUEST_TIMEOUT"] = "600"
os.environ["OLLAMA_TIMEOUT"] = "600"
os.environ["HTT_TIMEOUT"] = "600"

# NUCLEAR OVERRIDE: Eliminate hidden 12-second library timeouts
litellm.request_timeout = 600 
litellm.timeout = 600 
litellm.connection_timeout = 600
litellm.num_retries = 2  # Increased for socket resiliency
litellm.drop_params = True
litellm.set_verbose = False
litellm.suppress_debug_info = True

# CRITICAL: Prevent 12s timeout for Ollama specifically.
# Older LiteLLM releases reject bare provider names here during import.
# We rely on the runtime Ollama normalization below instead of registering
# a prompt template at import time.

# PERF: Module-level shared executor — avoids spawning/tearing down a thread pool
# for every single LLM call (59 times in Phase 2). Thread is reused across calls.
# Increased to 8 to handle high-fan-out mesh without excessive queuing.
_INFERENCE_EXECUTOR = ThreadPoolExecutor(max_workers=8)

# --- PROVIDER SHIELD (RMF-QT) ---
# Logic: Prevents parallel fan-outs (32 nodes) from overwhelming a single 
# provider's rate limits (429) simultaneously. 
_PROVIDER_LOCKS = threading.Lock()
_PROVIDER_SEMAPHORES: dict[str, threading.BoundedSemaphore] = {}
_PROVIDER_SPACING_LOCK = threading.Lock()
_PROVIDER_LAST_CALL: dict[str, float] = {}
_PROVIDER_MIN_INTERVAL: dict[str, float] = {
    "gemini": 4.0,      # 15 RPM free-tier ceiling -> 1 request every 4s
    "groq": 0.5,
    "openrouter": 0.5,
    "openai": 0.5,
}


def _pick_local_only_model(available_models: list[str]) -> str:
    """Prefer the configured primary local model, then the fallback model."""
    preferred = [
        settings.LOCAL_ONLY_PRIMARY_MODEL,
        settings.LOCAL_ONLY_FALLBACK_MODEL,
    ]
    avail_lower = [m.lower() for m in available_models if m]
    for target in preferred:
        if not target:
            continue
        target_base = target.split(":")[0].lower()
        for avail in available_models:
            avail_base = avail.split(":")[0].lower()
            if target.lower() == avail.lower() or target_base == avail_base or target.lower() in avail.lower():
                return avail
    return preferred[0] if preferred[0] else (available_models[0] if available_models else settings.DEFAULT_OLLAMA_MODEL)


def _normalize_gemini_openai_base_url(url: str | None) -> str:
    """
    Gemini's OpenAI-compatible endpoint must point at /v1beta/openai/.

    Users often enter the root host only, which yields 404s at runtime even if
    a shallow connectivity test looks fine. Normalize that here so both the
    runtime path and vault smoke tests hit the documented endpoint.
    """
    default_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
    if not url:
        return default_url

    base = url.strip().rstrip("/")
    if "generativelanguage.googleapis.com" not in base:
        return base + "/" if base else default_url

    if base.endswith("/v1beta/openai"):
        return base + "/"
    if base.endswith("/v1beta"):
        return base + "/openai/"
    if base.endswith("/v1"):
        return base + "beta/openai/"
    if "/v1beta/openai" in base:
        return base + "/"

    return base + "/v1beta/openai/"


def _normalize_gemini_model_name(model_name: str) -> str:
    """
    Map short Gemini aliases to supported Gemini model IDs.

    This prevents 404s from marketing-style names such as `gemini-3-flash`
    which are not valid API model IDs in the OpenAI-compatible endpoint.
    """
    clean = (model_name or "").strip()
    if not clean:
        return "gemini-3.5-flash"

    clean = clean.replace("openai/", "").replace("gemini/", "")
    aliases = {
        "gemini-3-flash": "gemini-3-flash-preview",
        "gemini-3-pro": "gemini-3-pro-preview",
        "gemini-3.1-pro": "gemini-3.1-pro-preview",
    }
    return aliases.get(clean, clean)

def _get_provider_semaphore(provider_name: str) -> threading.BoundedSemaphore:
    p = provider_name.lower().strip()
    with _PROVIDER_LOCKS:
        if p not in _PROVIDER_SEMAPHORES:
            # RMF-QT: Dynamically tuned concurrency to exploit multi-key pools
            limit = 5
            if "gemini" in p: limit = 1      # Serialize Gemini to avoid thundering herd
            if "groq" in p: limit = 10       # 5+ keys available in Strategic pool
            if "openrouter" in p: limit = 10 # 5 keys available in Primary pool
            _PROVIDER_SEMAPHORES[p] = threading.BoundedSemaphore(limit)
        return _PROVIDER_SEMAPHORES[p]


def _enforce_provider_spacing(provider_name: str) -> None:
    """
    Enforce a minimum gap between calls to the same provider.

    This prevents bursty retry loops from creating a self-amplifying rate-limit
    storm when multiple nodes share the same provider pool.
    """
    provider = provider_name.lower().strip()
    min_interval = _PROVIDER_MIN_INTERVAL.get(provider, 0.0)
    if min_interval <= 0:
        return

    while True:
        with _PROVIDER_SPACING_LOCK:
            now = time.monotonic()
            last = _PROVIDER_LAST_CALL.get(provider, 0.0)
            wait_for = min_interval - (now - last)
            if wait_for <= 0:
                _PROVIDER_LAST_CALL[provider] = now
                return
        time.sleep(wait_for)

def preflight_token_check(prompt: str, model_tpm_limit: int, node_name: str) -> bool:
    estimated_tokens = len(prompt) // 4
    if estimated_tokens > model_tpm_limit:
        logger.error(
            f"[PREFLIGHT] {node_name} prompt too large: "
            f"~{estimated_tokens} tokens > {model_tpm_limit} limit. "
            f"Skipping this identity."
        )
        return False
    return True

NODE_TOKEN_BUDGETS = {
    # Phase 1
    "ingestor_node": 3000,
    "prd_threats_extractor": 2500,
    "prd_capabilities_extractor": 2500,
    "prd_compliance_extractor": 2500,
    "repository_intelligence_node": 500,   # static file read, tiny
    "requirement_clarifier_node": 3000,
    "security_intel_node": 2000,
    "governance_node": 1500,
    "accessibility_intel_node": 1500,
    
    # Phase 2
    "logician_node": 2000,
    "architect_node": 2000,
    "service_architecture_mesh_node": 4000,
    "db_architect_node": 3000,
    "planning_agent_node": 16000,
    "creator_node": 4000,
    "api_mock_node": 3000,
    "engineering_contract_node": 4000,
    
    # Phase 3
    "frontend_forge_node": 4000,
    "backend_forge_node": 4000,
    "database_forge_node": 3000,
    "automation_forge_node": 3000,
    "api_coder_node": 3000,
    "migration_agent_node": 2000,
    "self_healing_node": 2000,
    "env_provisioner_node": 2000,
    "run_orchestrator_node": 2000,
    
    # Phase 4
    "security_audit_node": 3000,
    "accessibility_audit_node": 2000,
    "performance_audit_node": 2000,
    "nfr_aggregator_node": 1000,
    
    # Default for any unlisted node
    "default": 3000
}

def enforce_token_budget(prompt: str, node_name: str) -> str:
    budget = NODE_TOKEN_BUDGETS.get(node_name, NODE_TOKEN_BUDGETS["default"])
    max_chars = budget * 4
    estimated_tokens = len(prompt) // 4
    
    if len(prompt) <= max_chars:
        logger.debug(f"[TOKEN-BUDGET] {node_name}: ~{estimated_tokens} tokens — within budget {budget}")
        return prompt
    
    logger.warning(
        f"[TOKEN-BUDGET] {node_name}: ~{estimated_tokens} tokens "
        f"exceeds budget {budget} — truncating"
    )
    
    # Smart truncation: keep first 60% and last 40%
    # First 60% = system prompt + context start
    # Last 40% = output format instructions (critical to keep)
    keep_start = int(max_chars * 0.6)
    keep_end = max_chars - keep_start
    
    return (
        prompt[:keep_start] +
        "\n\n[... CONTEXT TRUNCATED TO FIT TOKEN BUDGET ...]\n\n" +
        prompt[-keep_end:]
    )

class InferenceCoordinator:
    """
    ARCHITECTURE: RESILIENT IDENTITY MESH COORDINATOR
    
    This class is the logical 'heart' of the reasoning engine. It manages the 
    complex lifecycle of an LLM request, handling failures, rate-limits, and 
    provider tilt without bubbling errors to the user until all tiers are depleted.
    """

    @classmethod
    def _build_execution_llm(cls, identity: dict, temperature: float = 0.1, timeout_override: int | None = None) -> tuple[LLMConfig, str]:
        """
        Normalize a vaulted identity exactly the way the production runtime does.

        This is used by the runtime smoke test so vault health reflects the same
        model/base_url handling that live agents exercise.
        """
        raw_model = identity["model"]
        proxy_url = identity.get("url") or ""
        if proxy_url.endswith("/"):
            proxy_url = proxy_url[:-1]

        api_key = identity["key"]
        req_timeout = timeout_override or settings.GROQ_TIMEOUT
        provider_format = identity["provider"].lower().strip()

        if provider_format == "groq" and "/" not in raw_model:
            raw_model = f"groq/{raw_model}"
        elif provider_format == "openrouter":
            if not proxy_url:
                proxy_url = "https://openrouter.ai/api/v1"
            req_timeout = settings.OPENAI_TIMEOUT
            if not raw_model.startswith("openrouter/"):
                raw_model = f"openrouter/{raw_model}"
        elif provider_format == "gemini":
            req_timeout = settings.OPENAI_TIMEOUT
            if proxy_url and "googleapis.com" in proxy_url:
                proxy_url = _normalize_gemini_openai_base_url(proxy_url)
                if not raw_model.startswith("openai/"):
                    clean_name = _normalize_gemini_model_name(raw_model)
                    raw_model = f"openai/{clean_name}"
            else:
                proxy_url = _normalize_gemini_openai_base_url(proxy_url)
                if not raw_model.startswith("gemini/"):
                    raw_model = f"gemini/{_normalize_gemini_model_name(raw_model)}"
        elif provider_format == "openai" or "/" in raw_model:
            if not proxy_url:
                proxy_url = "https://api.openai.com/v1"
            req_timeout = settings.OPENAI_TIMEOUT
            if not raw_model.startswith("openai/") and not raw_model.startswith("openrouter/"):
                raw_model = f"openai/{raw_model}"
        elif provider_format == "ollama":
            if not proxy_url:
                proxy_url = settings.OLLAMA_BASE_URL
            api_key = "ollama"
            req_timeout = timeout_override or 600
            if not proxy_url.endswith("/v1"):
                proxy_url = f"{proxy_url}/v1"
            raw_model = f"openai/{raw_model.replace('ollama/', '')}"
        else:
            raise ValueError(f"Unsupported Provider specified in Vault: {identity['provider']}")

        llm = LLMConfig(
            model=raw_model,
            temperature=temperature,
            api_key=api_key,
            base_url=proxy_url if proxy_url else None,
            timeout=req_timeout,
            max_retries=settings.MESH_MAX_RETRIES,
        )
        return llm, provider_format

    @classmethod
    def run_identity_smoke(cls, identity: dict, prompt: str, log_step_fn, task_id: str, topology_id: str = "System", temperature: float = 0.0, max_tokens: int = 64) -> str:
        """
        Execute a runtime-equivalent smoke test against one explicit vaulted identity.
        This uses the same model/base_url normalization and crew execution path as live agents.
        """
        provider_format = identity["provider"].lower().strip()
        timeout_override = 600 if provider_format == "ollama" else 8
        llm, provider_format = cls._build_execution_llm(identity, temperature=temperature, timeout_override=timeout_override)
        log_step_fn(task_id, f"Runtime smoke on {identity['provider']}/{identity['model']}...", topology_id)
        log_step_fn(task_id, f"[DEBUG] Smoke initialized. Provider: {provider_format.upper()}, Model: {llm.model}, Timeout: {llm.timeout}s", topology_id)
        return cls._run_crew(
            llm,
            "SmokeTester",
            "Verify live runtime connectivity",
            "Production-path vault smoke test",
            prompt,
            max_tokens=max_tokens,
            allow_short_response=True,
        )

    @classmethod
    def _run_local_only_mesh(cls, role: str, goal: str, backstory: str, prompt: str, log_step_fn, task_id: str, temperature: float = 0.1, topology_id: str = "System", max_tokens: int = 2048) -> str:
        """
        Minimal local-only execution path used when the vault is temporarily bypassed.
        It prefers deepseek-r1:32b and falls back to gemma3:27b, keeping the change
        reversible via config only.
        """
        local_url_base = settings.OLLAMA_BASE_URL.rstrip("/")
        if not local_url_base:
            local_url_base = settings.OLLAMA_BASE_URL

        log_step_fn(task_id, "[LOCAL-ONLY] Bypassing identity vault. Using Ollama models only.", "System")
        log_step_fn(task_id, f"[LOCAL-ONLY] Base URL: {local_url_base}", "System")

        available_models = []
        try:
            ping_resp = requests.get(f"{local_url_base}/api/tags", timeout=10)
            available_models = [m.get("name", "") for m in ping_resp.json().get("models", []) if m.get("name")]
            log_step_fn(task_id, f"✅ Local Vault ONLINE. Available models: {', '.join(available_models[:5])}", "System")
        except Exception as ping_err:
            log_step_fn(task_id, f"⚠️ Local Vault ping failed: {str(ping_err)[:120]}. Falling back to configured local models.", "System")

        chosen_model = _pick_local_only_model(available_models)
        openai_compat_url = f"{local_url_base}/v1"
        model_path = f"openai/{chosen_model.replace('ollama/', '')}"

        for attempt in range(3):
            try:
                start_time = time.time()
                backoff_delay = [0, 5, 15][attempt]
                if backoff_delay > 0:
                    log_step_fn(task_id, f"⏳ Backoff: waiting {backoff_delay}s before retry...", "System")
                    time.sleep(backoff_delay)

                log_step_fn(task_id, f"⚙️ Local-only reasoning on {chosen_model} via OpenAI-compat. Attempt {attempt+1}/3...", "System")

                llm = LLMConfig(
                    model=model_path,
                    base_url=openai_compat_url,
                    api_key="ollama",
                    temperature=temperature,
                    timeout=600,
                    max_retries=2,
                )

                from backend.agents.state import LogLevel
                log_step_fn(task_id, f"[DEBUG] Local-only initialized. Bypass endpoint used for {model_path}.", "System", LogLevel.DEBUG)
                log_step_fn(task_id, f"[TRACE] Raw LLM Prompt Construct:\n{prompt}", "System", LogLevel.TRACE)

                # Pass the original prompt directly — no INSTRUCTION/CONTEXT wrapper
                # that confuses reasoning models into echoing the prefix as JSON keys.
                result = cls._run_crew(llm, role, goal, backstory, prompt, max_tokens=max_tokens)
                log_step_fn(task_id, f"[TRACE] Raw LLM Response Construct:\n{result}", "System", LogLevel.TRACE)
                log_step_fn(task_id, f"✅ Local-only reasoning complete ({len(result)} chars).", "System")

                latency = int((time.time() - start_time) * 1000)
                return result
            except Exception as e:
                elapsed = int(time.time() - start_time) if 'start_time' in locals() else 0
                log_step_fn(task_id, f"⚠️ Local-only Attempt {attempt+1}/3 Failed ({elapsed}s): {str(e)[:120]}...", "System")
                if attempt == 2:
                    CRITICAL_NODES = {'ServiceMesh', 'Architect', 'DBArchitect', 'EngineeringContract', 'planning_agent_node'}
                    if topology_id in CRITICAL_NODES:
                        raise RuntimeError(f"[MESH-DEPLETED] Critical node {topology_id} failed — all tiers exhausted. Mission cannot continue with empty state. Error: {e}")
                    else:
                        log_step_fn(task_id, f"⚠️ LOCAL MESH DEPLETED: {str(e)[:120]}. Triggering Auto-Recovery (Empty State) for non-critical node {topology_id}...", "System")
                        return "{}"
    
    LLM_SEMAPHORE = __import__('threading').Semaphore(3)
    OLLAMA_SEMAPHORE = __import__('threading').Semaphore(1)
    
    PROVIDER_CHAIN = [
        {
            "name": "GEMINI",
            "model": "gemini/gemini-2.5-flash",
            "api_key_env": "GEMINI_API_KEY",
            "api_keys_env": "GEMINI_API_KEYS",
            "tpm_limit": 100000,
            "rpm_limit": 15
        },
        {
            "name": "GROQ", 
            "model": "groq/llama-3.3-70b-versatile",
            "api_key_env": "GROQ_API_KEY",
            "api_keys_env": "GROQ_API_KEYS",
            "tpm_limit": 12000,
            "rpm_limit": 30,
            "timeout": 300
        },
        {
            "name": "OPENROUTER",
            "model": "openrouter/meta-llama/llama-3.3-70b-instruct",
            "api_key_env": "OPENROUTER_API_KEY",
            "api_keys_env": "OPENROUTER_API_KEYS",
            "tpm_limit": 50000,
            "rpm_limit": 100,
            "timeout": 300
        },
        {
            "name": "OPENAI",
            "model": "gpt-4o-mini",
            "api_key_env": "OPENAI_API_KEY", 
            "tpm_limit": 200000,
            "rpm_limit": 500,
            "timeout": 300
        },
        {
            "name": "OLLAMA",
            "model": f"ollama/{settings.DEFAULT_OLLAMA_MODEL}",
            "base_url": settings.OLLAMA_BASE_URL,
            "api_key_env": None,
            "tpm_limit": 999999,
            "rpm_limit": 999999,
            "timeout": 600
        }
    ]

    _key_indexes = {}

    _cooldowns = {}
    _cooldown_lock = __import__('threading').Lock()
    COOLDOWN_SECONDS = 120
    
    _dead_keys = set()
    _key_failures = {}
    _dead_keys_file = __import__('pathlib').Path(__import__('os').getenv("WORKSPACE_DIR", "./workspace")) / ".dead_keys.json"
    
    @classmethod
    def load_dead_keys(cls):
        import json
        if not cls._dead_keys and cls._dead_keys_file.exists():
            try:
                with open(cls._dead_keys_file, "r") as f:
                    cls._dead_keys = set(json.load(f))
            except Exception:
                pass
                
    @classmethod
    def mark_key_dead(cls, key: str):
        import json
        if key not in cls._dead_keys:
            cls._dead_keys.add(key)
            try:
                cls._dead_keys_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cls._dead_keys_file, "w") as f:
                    json.dump(list(cls._dead_keys), f)
            except Exception:
                pass

    @classmethod
    def is_on_cooldown(cls, provider_name: str) -> bool:
        import time
        with cls._cooldown_lock:
            return time.time() < cls._cooldowns.get(provider_name, 0)

    @classmethod
    def set_cooldown(cls, provider_name: str):
        import time
        with cls._cooldown_lock:
            cls._cooldowns[provider_name] = time.time() + cls.COOLDOWN_SECONDS
            logger.info(f"[COOLDOWN] {provider_name} cooling down for {cls.COOLDOWN_SECONDS}s")

    @classmethod
    def execute(cls, role: str, goal: str, backstory: str, prompt: str, log_step_fn, task_id: str, temperature: float = 0.1, topology_id: str = "System", max_tokens: int = 2048, require_json: bool = True):
        import os
        import time
        from backend.agents.state import LogLevel
        
        # Enforce budget BEFORE provider selection
        prompt = enforce_token_budget(prompt, topology_id)
        
        estimated_tokens = len(prompt) // 4
        
        with cls.LLM_SEMAPHORE:
            providers_to_use = cls.PROVIDER_CHAIN
            if getattr(settings, "LOCAL_ONLY_MESH", False):
                providers_to_use = [p for p in cls.PROVIDER_CHAIN if p["name"] == "OLLAMA"]
                
            for provider in providers_to_use:
                provider_name = provider["name"]
                
                if cls.is_on_cooldown(provider_name):
                    log_step_fn(task_id, f"[COOLDOWN] {provider_name} skipped — still cooling down", topology_id)
                    continue

                if estimated_tokens > provider["tpm_limit"]:
                    log_step_fn(task_id, f"[PREFLIGHT] {topology_id} → {provider_name} skipped: ~{estimated_tokens} tokens > {provider['tpm_limit']} limit", topology_id)
                    continue
                
                keys_env = provider.get("api_keys_env")
                key_env = provider.get("api_key_env")
                
                keys = []
                if key_env and os.environ.get(key_env):
                    primary_key = os.environ.get(key_env).strip().strip('"\'')
                    if primary_key and not primary_key.startswith("your_"):
                        keys.append(primary_key)
                
                if keys_env and os.environ.get(keys_env):
                    pool = [k.strip().strip('"\'') for k in os.environ.get(keys_env).split(',') if k.strip()]
                    for k in pool:
                        if k and k not in keys and not k.startswith("your_"):
                            keys.append(k)
                    
                if not keys and provider_name != "OLLAMA":
                    continue
                
                if keys and all(k.startswith("your_") for k in keys):
                    log_step_fn(task_id, f"[PROVIDER] {provider_name} skipped: {key_env} is placeholder", topology_id)
                    continue
                    
                if not keys:
                    keys = ["ollama"]
                    
                start_idx = cls._key_indexes.get(provider_name, 0) % len(keys)
                provider_timeout = provider.get("timeout", 180)
                
                log_step_fn(task_id, f"Engaging {role} reasoning on {provider['model']}...", topology_id)
                
                success = False
                cls.load_dead_keys()
                for i in range(len(keys)):
                    current_idx = (start_idx + i) % len(keys)
                    api_key = keys[current_idx]
                    
                    if api_key in cls._dead_keys:
                        continue
                    
                    llm = LLMConfig(
                        model=provider["model"],
                        temperature=temperature,
                        api_key=api_key,
                        base_url=provider.get("base_url"),
                        timeout=provider_timeout,
                        max_retries=0,
                    )
                    
                    try:
                        if provider_name == "OLLAMA":
                            with cls.OLLAMA_SEMAPHORE:
                                result = cls._run_crew(llm, role, goal, backstory, prompt, max_tokens=max_tokens, require_json=require_json)
                        else:
                            result = cls._run_crew(llm, role, goal, backstory, prompt, max_tokens=max_tokens, require_json=require_json)
                        if i > 0:
                            # Only log success after a silent rotation
                            log_step_fn(task_id, f"[PROVIDER] {topology_id} → {provider_name} succeeded after key rotation", topology_id)
                        cls._key_indexes[provider_name] = current_idx
                        success = True
                        return result
                    except TimeoutError:
                        logger.warning(f"[PROVIDER TIMEOUT] {topology_id} → {provider_name} exceeded network timeout.")
                        break # timeout is a model/network issue, not an auth/limit issue. Next provider.
                    except Exception as e:
                        error_str = str(e).lower()
                        if any(err in error_str for err in ["429", "rate limit", "503", "insufficient_quota", "401", "authentication", "invalid api key"]):
                            is_auth_error = any(err in error_str for err in ["401", "authentication", "invalid api key", "insufficient_quota"])
                            
                            if is_auth_error:
                                logger.warning(f"[PROVIDER PERM-FAIL] {topology_id} → {provider_name} Key {current_idx} exhausted/invalid: {str(e)[:50]}")
                                cls.mark_key_dead(api_key)
                            else:
                                failures = cls._key_failures.get(api_key, 0) + 1
                                cls._key_failures[api_key] = failures
                                if failures >= 3:
                                    logger.warning(f"[PROVIDER RATE-LIMIT] {topology_id} → {provider_name} Key {current_idx} hit 429 3x, marking dead for session.")
                                    cls.mark_key_dead(api_key)
                                else:
                                    logger.warning(f"[PROVIDER RATELIMIT] {topology_id} → {provider_name} Key {current_idx} hit rate limit ({failures}/3): {str(e)[:50]}")
                            
                            cls._key_indexes[provider_name] = (current_idx + 1) % len(keys)
                            continue # silently try the next key
                        else:
                            # If it's a real error (e.g. invalid prompt, connection refused), log and try next provider
                            logger.error(f"[PROVIDER ERROR] {topology_id} → {provider_name} failed with {type(e).__name__}: {str(e)}")
                            log_step_fn(task_id, f"[PROVIDER] {topology_id} → {provider_name} failed: {type(e).__name__}", topology_id)
                            break
                            
                if not success:
                    if provider_name != "OLLAMA":
                        cls.set_cooldown(provider_name)
                    log_step_fn(task_id, f"[PROVIDER] {topology_id} → {provider_name} exhausted all available keys/capacity", topology_id)
                        
            # All providers failed
            logger.error(f"[INFERENCE] All providers exhausted for {topology_id}")
            CRITICAL_NODES = {'ServiceMesh', 'Architect', 'DBArchitect', 'EngineeringContract', 'planning_agent_node'}
            if topology_id in CRITICAL_NODES:
                raise RuntimeError(f"All LLM providers failed for node {topology_id}. Check API keys and Ollama connectivity.")
            else:
                log_step_fn(task_id, f"⚠️ MESH DEPLETED: All tiers exhausted. Triggering Auto-Recovery (Empty State) for non-critical node {topology_id}...", "System")
                return "{}"

    @staticmethod
    def _estimate_cost(model: str, tokens: int) -> float:
        """
        HEURISTIC COST CALCULATOR (USD)
        Based on standard industry pricing models (OpenRouter/Groq).
        """
        price_per_1k = 0.0006 # Default (e.g. Llama 3.1 70B)
        if "gpt-4" in model: price_per_1k = 0.01
        elif "claude-3-5" in model: price_per_1k = 0.003
        elif "deepseek" in model: price_per_1k = 0.0002
        elif "8b" in model: price_per_1k = 0.0001
        
        return (tokens / 1000.0) * price_per_1k

    @classmethod
    def _run_crew(cls, llm, role, goal, backstory, prompt, max_tokens: int = 2048, allow_short_response: bool = False, require_json: bool = True):
        """
        INTERNAL: Direct litellm completion — replaces CrewAI overhead.

        ARCHITECTURE CHANGE (V5.1):
        Previously used CrewAI Agent/Task/Crew for every LLM call, adding
        ~5-15s of framework initialization overhead per node (agent setup,
        task planning, crew kickoff). With 6 nodes in Phase 1 that's 30-90s
        of pure overhead before any LLM token is generated.

        Now uses litellm.completion() directly — same model, same prompt,
        zero framework overhead. The role/goal/backstory are injected as a
        system message so the model still has full context.

        RELIABILITY:
        1. ThreadPoolExecutor enforces a hard execution ceiling.
        2. Refusal trap detects model refusals and forces mesh failover.
        """
        import asyncio
        import json
        async def _execute_direct(target_model, target_key, target_url, target_timeout, target_temp, ceiling):
            system_msg = (
                f"You are a {role}. "
                f"Your goal: {goal}. "
                f"Background: {backstory}. "
            )
            
            if require_json:
                system_msg += "Return only valid JSON — no markdown fences, no prose. Do NOT wrap the JSON in ```json blocks."

            # Detect local/Ollama models — they don't support response_format: json_object
            # when routed through the OpenAI-compatible endpoint (/v1).
            # Sending it causes the model to return an error JSON instead of content.
            _is_local_model = (
                target_url and ("11434" in str(target_url) or "localhost" in str(target_url) or "127.0.0.1" in str(target_url))
            ) or "ollama" in str(target_model).lower() or str(target_key).lower() == "ollama"

            kwargs = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user",   "content": prompt},
                ],
                "temperature": target_temp,
                "timeout": target_timeout,
                "max_tokens": max_tokens,
            }
            # Only add response_format for cloud models that support it and when json is required
            if not _is_local_model and require_json:
                kwargs["response_format"] = {"type": "json_object"}

            # For local/Ollama models, explicitly set a larger context window.
            # Ollama defaults to num_ctx=2048 which is too small for structured JSON extraction.
            # deepseek-r1:32b supports up to 128k; we use 16384 as a safe production ceiling.
            if _is_local_model:
                kwargs["extra_body"] = {"options": {"num_ctx": 16384}}

            if target_key:
                kwargs["api_key"] = target_key
            if target_url:
                kwargs["base_url"] = target_url

            try:
                # Use litellm.acompletion to natively support async cancellation and timeout tear-down
                response = await asyncio.wait_for(litellm.acompletion(**kwargs), timeout=ceiling)
            except asyncio.TimeoutError:
                raise TimeoutError(f"LLM call exceeded {ceiling}s hard ceiling (Local/Queued wait). Forcing mesh rotation.")

            if response is None:
                raise RuntimeError("LLM provider returned None response — no output generated.")
            if not response.choices or response.choices[0] is None:
                raise RuntimeError("LLM response has no choices — empty completion returned.")
            message = response.choices[0].message
            content = getattr(message, "content", None)

            if content is None:
                refusal = getattr(message, "refusal", None)
                if refusal:
                    raise RuntimeError(f"LLM refusal returned instead of text: {refusal}")

                tool_calls = getattr(message, "tool_calls", None)
                if tool_calls:
                    try:
                        normalized_calls = []
                        for call in tool_calls:
                            fn = getattr(getattr(call, "function", None), "name", None)
                            args = getattr(getattr(call, "function", None), "arguments", None)
                            normalized_calls.append({
                                "name": fn,
                                "arguments": args,
                            })
                        content = json.dumps({"tool_calls": normalized_calls}, ensure_ascii=False)
                    except Exception:
                        content = None

            if content is None:
                # Some providers emit an assistant envelope without plain text.
                # Fall back to a serialized payload so the mesh can keep moving.
                if hasattr(message, "model_dump"):
                    dumped = message.model_dump()
                    content = json.dumps(dumped, ensure_ascii=False, default=str)
                elif hasattr(message, "dict"):
                    dumped = message.dict()
                    content = json.dumps(dumped, ensure_ascii=False, default=str)

            if content is None:
                raise RuntimeError("LLM response choice has None content — model produced no text.")

            content = str(content).strip()
            # Strip <think>...</think> blocks from reasoning models (DeepSeek-R1, etc.)
            # before any downstream parsing or refusal checks.
            import re as _re
            content = _re.sub(r'<think>.*?</think>', '', content, flags=_re.DOTALL).strip()
            content = _re.sub(r'</?think>', '', content).strip()
            if not content:
                raise RuntimeError("LLM response choice was empty after normalization.")
            return content

        # HARD TIMEOUT: Uses asyncio to natively cancel and teardown sockets if hung.
        model_name = getattr(llm, 'model', None) or getattr(llm, 'model_name', 'gpt-3.5-turbo')
        api_key    = getattr(llm, 'api_key', None)
        base_url   = getattr(llm, 'base_url', None)
        timeout    = getattr(llm, 'timeout', 120)
        temperature = getattr(llm, 'temperature', 0.1)
        configured_ceiling = max(120, int(getattr(settings, "MESH_EXECUTION_CEILING", 300) or 300))

        base_timeout = getattr(llm, 'timeout', None)
        if not isinstance(base_timeout, (int, float)):
            base_timeout = configured_ceiling
        
        is_local = (base_url and ("11434" in str(base_url) or "localhost" in str(base_url) or "127.0.0.1" in str(base_url))) or "ollama" in model_name.lower() or api_key == "ollama"
        ceiling = min(configured_ceiling, max(int(base_timeout), 120) + 60)
        if is_local:
            ceiling = min(ceiling, configured_ceiling)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            def _thread_wrapper():
                return asyncio.run(_execute_direct(model_name, api_key, base_url, timeout, temperature, ceiling))
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as temp_exec:
                future = temp_exec.submit(_thread_wrapper)
                try:
                    result = future.result(timeout=ceiling + 5)
                except concurrent.futures.TimeoutError:
                    raise TimeoutError(f"LLM call exceeded {ceiling}s hard ceiling (Local/Queued wait). Forcing mesh rotation.")
        else:
            result = asyncio.run(_execute_direct(model_name, api_key, base_url, timeout, temperature, ceiling))

        # --- THINK TAG STRIPPER ---
        # DeepSeek-R1 and other reasoning models emit <think>...</think> blocks
        # before their actual JSON output. Strip them so downstream JSON parsers
        # see clean content and don't try to parse the reasoning text as JSON.
        result = re.sub(r'<think>.*?</think>', '', result, flags=re.DOTALL).strip()
        # Also strip any residual opening/closing think fragments
        result = re.sub(r'</?think>', '', result).strip()

        # --- SCHEMA GUARD: HOLLOW RESPONSE PROTECTION ---
        # Only flag clear refusal phrases — NOT substring matches that could appear
        # in legitimate JSON content (e.g. "cannot_be_null", "sorry_count", etc.)
        # Check the first 300 chars only (refusals appear at the start, not mid-JSON).
        result_head = result[:300].lower()
        refusal_patterns = [
            "i'm sorry", "i am sorry", "i cannot", "i can't",
            "i'm unable", "i am unable", "i apologize",
            "reach your limit", "forbidden"
        ]
        if any(p in result_head for p in refusal_patterns):
            raise RuntimeError("Model Identity refused reasoning (Pattern Match).")

        # --- SCHEMA GUARD: ERROR JSON DETECTION ---
        # Ollama and some providers return a JSON error object like:
        # [{"error": "The provided input does not contain..."}]
        # when they cannot fulfill the request. Treat this as a failure so
        # the mesh can rotate to the next identity instead of passing garbage downstream.
        if require_json:
            try:
                _quick_parse = json.loads(result.strip())
                if isinstance(_quick_parse, list) and len(_quick_parse) > 0:
                    _first = _quick_parse[0]
                    if isinstance(_first, dict) and "error" in _first and len(_quick_parse[0]) == 1:
                        raise RuntimeError(f"Model returned error JSON: {_first['error'][:120]}")
                elif isinstance(_quick_parse, dict) and "error" in _quick_parse and len(_quick_parse) == 1:
                    raise RuntimeError(f"Model returned error JSON: {_quick_parse['error'][:120]}")
            except (json.JSONDecodeError, KeyError):
                pass  # Not JSON or no error key — continue normally

        if allow_short_response:
            return result

        if len(result.strip()) < 20:
            raise RuntimeError(f"Hollow Response Caught: Produced only {len(result)} chars.")
            
        # Detect catastrophic truncation on massive generation nodes (e.g. rate limit cutoff)
        # If the output is < 2000 chars but is supposed to be a massive plan, the provider cut it off.
        if "planning_agent" in role.lower() or "planning_agent" in goal.lower():
            if len(result.strip()) < 5000:
                raise RuntimeError(f"Catastrophic truncation detected: Planning agent returned only {len(result)} chars (expected >5000). Forcing failover.")

        if len(result) < 400:
            if require_json:
                try:
                    parsed = json.loads(
                        result.replace("```json", "").replace("```", "").strip()
                    )
                    if isinstance(parsed, (dict, list)) and len(parsed) > 0:
                        return result
                except Exception:
                    pass
                raise RuntimeError(
                    f"Hollow Response Caught: Produced only {len(result)} chars of unparseable content."
                )
            else:
                return result

        return result
