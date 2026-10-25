"""
================================================================================
CONVERGE — VAULT SEEDER (ENV → DB Auto-Population)
================================================================================
PURPOSE:
  Reads all API keys from .env and bulk-inserts them into the LLMKeyIdentity
  vault DB in tier-wise order. Runs idempotently at startup — never duplicates
  an existing key, never overwrites a manually configured identity.

TIER ASSIGNMENT STRATEGY:
  ┌─────────────┬──────────────────────────────────────────────────────────┐
  │ STRATEGIC   │ Gemini (gemini-2.0-flash-exp) — highest quality,         │
  │             │ complex multi-step reasoning, large context window        │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ PRIMARY     │ Groq llama-3.3-70b-versatile — fast, high quality,       │
  │             │ primary workhorse for all agent nodes                     │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ ECONOMY     │ Groq llama-3.1-8b-instant + OpenRouter (free tier)       │
  │             │ — lightweight tasks, fallback, high-volume operations     │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ LOCAL       │ Ollama (offline) — zero-cost fallback, no internet needed │
  └─────────────┴──────────────────────────────────────────────────────────┘

USAGE:
  Called automatically from backend/main.py lifespan on every startup.
  Safe to call multiple times — fully idempotent.
"""

import os
import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)


# ── Tier Definitions ──────────────────────────────────────────────────────────
# Each entry: (provider, model_name, base_url_or_None)
# Keys are injected from .env at runtime.

STRATEGIC_MODEL  = "gemini-2.5-flash"
PRIMARY_MODEL    = "llama-3.3-70b-versatile"
ECONOMY_MODEL_G  = "llama-3.1-8b-instant"          # Groq economy
ECONOMY_MODEL_OR = "meta-llama/llama-3.3-70b-instruct:free"  # OpenRouter free
GEMINI_BASE_URL  = "https://generativelanguage.googleapis.com/v1beta/openai/"
OPENROUTER_URL   = "https://openrouter.ai/api/v1"


def _parse_key_list(env_var: str) -> List[str]:
    """Parse a comma-separated key list from an env var, stripping quotes/whitespace."""
    raw = os.getenv(env_var, "").strip().strip('"').strip("'")
    if not raw:
        return []
    return [k.strip() for k in raw.split(",") if k.strip()]


def _get_all_groq_keys() -> List[str]:
    """Collect all unique Groq keys from both GROQ_API_KEY and GROQ_API_KEYS."""
    keys = []
    single = os.getenv("GROQ_API_KEY", "").strip()
    if single:
        keys.append(single)
    keys.extend(_parse_key_list("GROQ_API_KEYS"))
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            unique.append(k)
    return unique


def _get_all_gemini_keys() -> List[str]:
    """Collect all unique Gemini keys."""
    keys = []
    single = os.getenv("GEMINI_API_KEY", "").strip()
    if single:
        keys.append(single)
    keys.extend(_parse_key_list("GEMINI_API_KEYS"))
    seen = set()
    unique = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            unique.append(k)
    return unique


def _get_all_openrouter_keys() -> List[str]:
    """Collect all unique OpenRouter keys."""
    keys = []
    single = os.getenv("OPENROUTER_API_KEY", "").strip()
    if single:
        keys.append(single)
    keys.extend(_parse_key_list("OPENROUTER_API_KEYS"))
    seen = set()
    unique = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            unique.append(k)
    return unique


def seed_vault_from_env() -> dict:
    """
    MAIN ENTRY POINT — Idempotent vault seeder.

    Reads all keys from .env and inserts them into the LLMKeyIdentity table
    if they don't already exist. Returns a summary dict for logging.

    Returns:
        {
          "strategic": int,   # identities added to strategic tier
          "primary":   int,   # identities added to primary tier
          "economy":   int,   # identities added to economy tier
          "local":     int,   # identities added to local tier
          "skipped":   int,   # already-existing identities skipped
          "total":     int    # total new identities added
        }
    """
    from backend.core.database import SessionLocal, LLMKeyPool, LLMKeyIdentity
    from backend.core.vault import SecretVault

    summary = {"strategic": 0, "primary": 0, "economy": 0, "local": 0, "skipped": 0, "total": 0}

    from backend.core.config import settings
    
    groq_keys      = _get_all_groq_keys()
    gemini_keys    = _get_all_gemini_keys()
    openrouter_keys = _get_all_openrouter_keys()
    ollama_url     = settings.OLLAMA_BASE_URL.rstrip("/")

    if not any([groq_keys, gemini_keys, openrouter_keys]):
        logger.warning("[VAULT-SEEDER] No API keys found in .env. Vault not seeded.")
        return summary

    db = SessionLocal()
    try:
        # ── Ensure all 4 tier pools exist ─────────────────────────────────────
        pools = {}
        for tier_name in ("strategic", "primary", "economy", "local"):
            pool = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier_name).first()
            if not pool:
                pool = LLMKeyPool(tier=tier_name, is_active=1)
                db.add(pool)
                db.flush()
            pools[tier_name] = pool

        # ── Helper: insert if not duplicate ───────────────────────────────────
        def _insert_if_new(pool_id: int, provider: str, model: str,
                           raw_key: str, base_url: str = None) -> bool:
            """Returns True if inserted, False if skipped (duplicate)."""
            # Check for existing identity with same provider+model+key_prefix
            # We compare encrypted keys by checking the first 8 chars of the raw key
            # (full comparison would require decrypting every row — too expensive)
            key_prefix = raw_key[:12] if len(raw_key) >= 12 else raw_key
            # Enforce strict global uniqueness: check if the key already exists in ANY pool/tier
            existing = db.query(LLMKeyIdentity).filter(
                LLMKeyIdentity.provider.ilike(provider)
            ).all()

            for ex in existing:
                try:
                    decrypted = SecretVault.decrypt(ex.encrypted_key)
                    if decrypted and decrypted.strip() == raw_key.strip():
                        return False  # Already exists globally
                except Exception:
                    pass

            encrypted = SecretVault.encrypt(raw_key)
            if not encrypted:
                logger.warning(f"[VAULT-SEEDER] Encryption failed for {provider} key (prefix: {key_prefix[:6]}…)")
                return False

            identity = LLMKeyIdentity(
                pool_id=pool_id,
                provider=provider,
                model_name=model,
                encrypted_key=encrypted,
                base_url=base_url,
                status="active",
                usage_tokens=0,
                usage_requests=0,
            )
            db.add(identity)
            return True

        # ══════════════════════════════════════════════════════════════════════
        # TIER: STRATEGIC — Gemini (all keys, gemini-2.0-flash-exp)
        # ══════════════════════════════════════════════════════════════════════
        strategic_pool_id = pools["strategic"].id
        for key in gemini_keys:
            added = _insert_if_new(
                pool_id=strategic_pool_id,
                provider="gemini",
                model=STRATEGIC_MODEL,
                raw_key=key,
                base_url=GEMINI_BASE_URL,
            )
            if added:
                summary["strategic"] += 1
            else:
                summary["skipped"] += 1

        # ══════════════════════════════════════════════════════════════════════
        # TIER: PRIMARY — Groq llama-3.3-70b-versatile (all Groq keys)
        # ══════════════════════════════════════════════════════════════════════
        primary_pool_id = pools["primary"].id
        for key in groq_keys:
            added = _insert_if_new(
                pool_id=primary_pool_id,
                provider="groq",
                model=PRIMARY_MODEL,
                raw_key=key,
                base_url=None,
            )
            if added:
                summary["primary"] += 1
            else:
                summary["skipped"] += 1

        # ══════════════════════════════════════════════════════════════════════
        # TIER: ECONOMY — Groq llama-3.1-8b-instant (all Groq keys)
        #               + OpenRouter free tier (all OR keys)
        # ══════════════════════════════════════════════════════════════════════
        economy_pool_id = pools["economy"].id

        # Groq economy (fast/cheap model)
        for key in groq_keys:
            added = _insert_if_new(
                pool_id=economy_pool_id,
                provider="groq",
                model=ECONOMY_MODEL_G,
                raw_key=key,
                base_url=None,
            )
            if added:
                summary["economy"] += 1
            else:
                summary["skipped"] += 1

        # OpenRouter economy (free tier models)
        for key in openrouter_keys:
            added = _insert_if_new(
                pool_id=economy_pool_id,
                provider="openrouter",
                model=ECONOMY_MODEL_OR,
                raw_key=key,
                base_url=OPENROUTER_URL,
            )
            if added:
                summary["economy"] += 1
            else:
                summary["skipped"] += 1

        # ══════════════════════════════════════════════════════════════════════
        # TIER: LOCAL — Ollama (single entry, no key needed)
        # ══════════════════════════════════════════════════════════════════════
        local_pool_id = pools["local"].id
        ollama_model = settings.DEFAULT_OLLAMA_MODEL
        ollama_key = "ollama"  # Ollama doesn't need a real API key

        added = _insert_if_new(
            pool_id=local_pool_id,
            provider="ollama",
            model=ollama_model,
            raw_key=ollama_key,
            base_url=f"{ollama_url}/v1",
        )
        if added:
            summary["local"] += 1
        else:
            summary["skipped"] += 1

        db.commit()
        summary["total"] = summary["strategic"] + summary["primary"] + summary["economy"] + summary["local"]

        return summary

    except Exception as e:
        db.rollback()
        logger.error(f"[VAULT-SEEDER] Seeding failed: {e}")
        return summary
    finally:
        db.close()


def log_vault_summary(summary: dict):
    """Log a clean summary table of the seeding results."""
    total = summary.get("total", 0)
    skipped = summary.get("skipped", 0)

    if total == 0 and skipped == 0:
        logger.warning("[VAULT-SEEDER] No keys processed. Check .env for GROQ_API_KEYS, GEMINI_API_KEYS, OPENROUTER_API_KEYS.")
        return

    logger.info("=" * 60)
    logger.info("[VAULT-SEEDER] ✅ Vault Population Complete")
    logger.info(f"  STRATEGIC  (Gemini 2.0 Flash)          : +{summary['strategic']} identities")
    logger.info(f"  PRIMARY    (Groq llama-3.3-70b)         : +{summary['primary']} identities")
    logger.info(f"  ECONOMY    (Groq 8b + OpenRouter)       : +{summary['economy']} identities")
    logger.info(f"  LOCAL      (Ollama offline)              : +{summary['local']} identities")
    logger.info(f"  SKIPPED    (already in vault)            :  {skipped} identities")
    logger.info(f"  TOTAL NEW                                : {total} identities added")
    logger.info("=" * 60)
