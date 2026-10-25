import logging
import random
import threading
from datetime import datetime
from sqlalchemy.orm import Session
from backend.core.database import SessionLocal, LLMKeyPool, LLMKeyIdentity, InferenceAudit
from backend.core.vault import SecretVault

logger = logging.getLogger(__name__)

# PERF: In-process pool ID cache — avoids a DB round-trip on every get_identity() call.
# Pool rows are static (tier names don't change at runtime). TTL = 5 minutes.
_POOL_ID_CACHE: dict = {}   # tier_name → (pool_id, cached_at_monotonic)
_POOL_CACHE_TTL = 300.0     # seconds

# PARALLEL THROTTLE: Track which identity IDs are currently in-use by active LLM calls.
# When 15+ nodes run in parallel, they all compete for the same pool. This set ensures
# each parallel node gets a different identity, preventing simultaneous rate-limit hits.
_IN_USE_LOCK = threading.Lock()
_IN_USE_IDS: set = set()   # identity IDs currently executing an LLM call

class IdentityOrchestrator:
    """
    ARCHITECTURE: RESILIENT IDENTITY MESH - Orchestration Layer
    
    PURPOSE:
    Coordinates the dynamic selection and preparation of 'Inference Identities' from 
    secure pools. It acts as the intelligent bridge between the LangGraph execution 
    cycle and the Secure Vault.
    
    KEY RESPONSIBILITIES:
    1. POOL RESOLUTION: Finds active Tier Pools (Strategic, Primary, Economy, Local).
    2. LOAD BALANCING (ROUND-ROBIN): Selects the identity with the least 'usage_requests' 
       to prevent localized rate-limiting.
    3. CRYPTO DECOUPLING: Transparently decrypts keys from the vault only at the 
       point of execution.
    4. AUDIT MESH: Tracks success/fail telemetry for every single AI inference call.
    """
    
    @classmethod
    def get_identity(cls, tier: str, exclude_ids: list = None) -> dict:
        """
        ACTION: Retrieves an active, least-used, non-cooldown identity for the tier.
        Auto-creates the tier pool row if it doesn't exist (self-healing).
        """
        import time as _time
        db = SessionLocal()
        try:
            # Step 1: Resolve the Tier Pool — use cache to avoid DB round-trip per call
            tier_lower = tier.lower()
            now_mono = _time.monotonic()
            cached = _POOL_ID_CACHE.get(tier_lower)
            pool_id = None

            if cached and (now_mono - cached[1]) < _POOL_CACHE_TTL:
                pool_id = cached[0]
                pool = db.query(LLMKeyPool).filter(LLMKeyPool.id == pool_id, LLMKeyPool.is_active == 1).first()
            else:
                pool = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier_lower, LLMKeyPool.is_active == 1).first()

            if not pool:
                # Auto-seed the missing pool so future identity additions work correctly
                logger.warning(f"[ORCHESTRATOR] Tier Pool '{tier}' not found — auto-creating.")
                try:
                    pool = LLMKeyPool(tier=tier_lower, is_active=1)
                    db.add(pool)
                    db.commit()
                    db.refresh(pool)
                    logger.info(f"[ORCHESTRATOR] Tier Pool '{tier}' created. Add identities via Settings → LLM Vault.")
                except Exception as create_err:
                    logger.error(f"[ORCHESTRATOR] Could not auto-create pool for tier '{tier}': {create_err}")
                    return None

            # Cache the pool ID
            _POOL_ID_CACHE[tier_lower] = (pool.id, now_mono)
            
            # Step 2: Optimal Identity Selection (Active + Not in Cooldown + Not Excluded + Not In-Use)
            now = datetime.utcnow()
            query = db.query(LLMKeyIdentity).filter(
                LLMKeyIdentity.pool_id == pool.id,
                LLMKeyIdentity.status == "active",
                (LLMKeyIdentity.cooldown_until == None) | (LLMKeyIdentity.cooldown_until < now)
            )
            
            # Combine caller's exclude_ids with the global in-use set
            with _IN_USE_LOCK:
                in_use_snapshot = set(_IN_USE_IDS)
            
            all_exclude = set(exclude_ids or []) | in_use_snapshot
            if all_exclude:
                query = query.filter(LLMKeyIdentity.id.notin_(all_exclude))
            
            identity = query.order_by(LLMKeyIdentity.usage_requests.asc()).first()
            
            if not identity:
                # Fallback: if all non-in-use identities are exhausted, try including in-use ones
                # (they may have finished by now, and we need to make progress)
                fallback_query = db.query(LLMKeyIdentity).filter(
                    LLMKeyIdentity.pool_id == pool.id,
                    LLMKeyIdentity.status == "active",
                    (LLMKeyIdentity.cooldown_until == None) | (LLMKeyIdentity.cooldown_until < now)
                )
                if exclude_ids:
                    fallback_query = fallback_query.filter(LLMKeyIdentity.id.notin_(exclude_ids))
                identity = fallback_query.order_by(LLMKeyIdentity.usage_requests.asc()).first()
            
            if not identity:
                # --- HYBRID FALLBACK: Original V2 Framework Logic ---
                # Logic: If the vault is empty, we check the .env settings as a last cloud resort.
                from backend.core.config import settings
                fallback_key = None
                provider = "unknown"
                model = "llama-3.3-70b-versatile"
                
                if tier_lower == "strategic" and settings.GEMINI_API_KEY:
                    fallback_key, provider, model = settings.GEMINI_API_KEY, "gemini", "gemini-2.5-flash"
                elif tier_lower == "primary" and settings.GROQ_API_KEY:
                    fallback_key, provider, model = settings.GROQ_API_KEY, "groq", settings.DEFAULT_GROQ_MODEL or "llama-3.3-70b-versatile"
                elif tier_lower == "economy" and settings.OPENROUTER_API_KEY:
                    fallback_key, provider, model = settings.OPENROUTER_API_KEY, "openrouter", "meta-llama/llama-3.3-70b-instruct:free"
                
                if fallback_key and f"fallback_{provider}" not in (exclude_ids or []):
                    logger.info(f"[ORCHESTRATOR] Vault empty for {tier}. Activating V2 fallback for {provider.upper()}.")
                    return {
                        "id": f"fallback_{provider}",
                        "tier": tier,
                        "provider": provider,
                        "model": model,
                        "key": fallback_key,
                        "url": ""
                    }

                logger.warning(
                    f"[ORCHESTRATOR] Tier '{tier}' pool exists but has no active, non-cooldown identities. "
                    f"Add cloud API keys via Settings → LLM Vault → {tier.upper()} tier."
                )
                return None
            
            # Mark this identity as in-use so parallel nodes skip it
            with _IN_USE_LOCK:
                _IN_USE_IDS.add(identity.id)
            
            # Step 3: Runtime Preparation
            decrypted_key = SecretVault.decrypt(identity.encrypted_key)
            
            return {
                "id": identity.id,
                "tier": tier,
                "provider": identity.provider,
                "model": identity.model_name,
                "key": decrypted_key,
                "url": identity.base_url
            }
        finally:
            db.close()

    @classmethod
    def mark_cooldown(cls, identity_id: int, minutes: int = 15):
        """
        ACTION: Benches an identity for a specific duration (Circuit Breaking).
        Also releases the in-use lock so other nodes don't wait for it.
        """
        # Release in-use lock first
        with _IN_USE_LOCK:
            _IN_USE_IDS.discard(identity_id)
        db = SessionLocal()
        try:
            identity = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == identity_id).first()
            if identity:
                from datetime import timedelta
                identity.cooldown_until = datetime.utcnow() + timedelta(minutes=minutes)
                db.commit()
                logger.info(f"[ORCHESTRATOR] Identity #{identity_id} benched for {minutes} mins due to Rate Limits.")
        finally:
            db.close()

    @classmethod
    def record_usage(cls, identity_id: int, task_id: str, tokens: int, status: str, latency_ms: int = 0, cost_usd: float = 0.0, error_msg: str = None):
        """
        ACTION: Commits inference telemetry (usage + latency + cost) to the mesh.
        Also releases the in-use lock so parallel nodes can reuse this identity.
        """
        # Release the in-use lock immediately — the LLM call is done
        if isinstance(identity_id, str) and identity_id.startswith("fallback_"):
            return # Fallbacks don't use the DB lock
        
        with _IN_USE_LOCK:
            _IN_USE_IDS.discard(identity_id)
        db = SessionLocal()
        try:
            identity = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == identity_id).first()
            if identity:
                identity.usage_tokens += tokens
                identity.usage_requests += 1
                identity.last_used = datetime.utcnow()
                # Clear cooldown if it was successfully used (auto-recovery)
                identity.cooldown_until = None
            
            audit = InferenceAudit(
                task_id=task_id,
                tier=str(identity.pool_id) if identity else "unknown", 
                provider=identity.provider if identity else "unknown",
                model=identity.model_name if identity else "unknown",
                tokens_used=tokens,
                latency_ms=latency_ms,
                cost_usd=cost_usd,
                status=status,
                error_msg=error_msg
            )
            db.add(audit)
            db.commit()
        except Exception as e:
            logger.error(f"[ORCHESTRATOR] Audit failure: {e}")
            db.rollback()
        finally:
            db.close()
