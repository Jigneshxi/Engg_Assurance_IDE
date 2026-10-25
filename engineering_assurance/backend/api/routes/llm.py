"""
LLM CONFIGURATION & CONNECTIVITY
Handles real-time testing and persistent storage of AI Provider settings.
"""
import logging
import requests
from fastapi import APIRouter, HTTPException, Depends
from backend.api.routes.auth import get_current_user, require_admin
from backend.core.auth_models import User
from sqlalchemy.orm import Session
from groq import Groq

from sqlalchemy import func
from backend.api.models import LLMConfig
from backend.core.database import get_db, LLMKeyPool, LLMKeyIdentity, InferenceAudit
from backend.core.inference import InferenceCoordinator, _normalize_gemini_openai_base_url, _normalize_gemini_model_name
from backend.core.config import settings
from backend.core.vault import SecretVault

router = APIRouter(prefix="/api/llm", tags=["LLM Identity Mesh"])
logger = logging.getLogger(__name__)


# ── DIAGNOSTIC ENGINE ────────────────────────────────────────────────────────

class ConnectionDiagnostic:
    @classmethod
    def analyze(cls, provider: str, error: Exception) -> str:
        err_str = str(error).lower()
        if provider.lower() in ("groq", "openai", "openrouter", "gemini"):
            if "401" in err_str or "authentication" in err_str or "invalid api key" in err_str:
                desc  = "API Key rejected (401 Unauthorized). The vaulted key is invalid or expired."
                steps = ["Log in to console.groq.com and regenerate a new key",
                         "Revoke this identity, then vault the new key",
                         "Ensure there are no leading/trailing spaces in the key"]
            elif provider.lower() == "gemini" and "403" in err_str:
                if "consumer_suspended" in err_str or "has been suspended" in err_str:
                    desc = (
                        "Gemini access is suspended for the Google consumer/project behind this key. "
                        "All keys from that project will fail until Google restores access or you switch "
                        "to a different unsuspended project."
                    )
                    steps = [
                        "Revoke all Gemini keys issued by the suspended Google project",
                        "Create a new key from a different Google AI Studio project with Gemini enabled",
                        "Contact Google support if the suspension should be lifted",
                    ]
                else:
                    desc  = (
                        "Gemini denied access (403 Permission Denied). The key is valid, but the "
                        "Google project/account behind it is not allowed to use this API/model."
                    )
                    steps = [
                        "Verify Gemini API is enabled for the Google project that issued the key",
                        "Confirm the account/project has access to the requested Gemini model",
                        "Regenerate the key in the correct Google AI Studio project if needed",
                    ]
            elif "429" in err_str:
                desc  = "Rate limit hit (429). Key is valid but quota is exhausted."
                steps = ["Wait 60 seconds and retry",
                         "Add a second identity to this tier for automatic rotation"]
            elif "refused" in err_str or "connect" in err_str:
                desc  = "Connection refused — Groq API endpoint unreachable."
                steps = ["Check your internet connection", "Retry in 30 seconds"]
            elif provider.lower() == "gemini" and "404" in err_str:
                desc  = (
                    "Gemini returned 404. The OpenAI-compatible endpoint must end with "
                    "/v1beta/openai/, and the model ID must be a valid Gemini model."
                )
                steps = [
                    "Use base_url: https://generativelanguage.googleapis.com/v1beta/openai/",
                    "Verify the model ID against the Gemini docs, such as gemini-3.5-flash or gemini-3-flash-preview",
                ]
            else:
                desc  = f"Unexpected error: {str(error)[:200]}"
                steps = ["Check backend logs for full traceback"]
        elif provider.lower() == "ollama":
            if "refused" in err_str or "connect" in err_str:
                desc  = "Local Ollama server is not running."
                steps = ["Open a terminal and run: ollama serve", "Then retry the pulse test"]
            else:
                desc  = f"Ollama error: {str(error)[:200]}"
                steps = ["Run: ollama list  — to verify available models",
                         "Run: ollama pull <modelname>  — if model is missing"]
        else:
            desc  = f"Verification failed: {str(error)[:200]}"
            steps = ["Check the provider name is correct (Groq / OpenAI / Ollama)", "Retry"]

        report = f"❌ IDENTITY FAULT\n\n[TRACE]\n{str(error)}\n\n[REMEDY]\n{desc}\n"
        for i, s in enumerate(steps, 1):
            report += f"{i}. {s}\n"
        return report


# ── SHARED PULSE LOGIC ───────────────────────────────────────────────────────

def _run_pulse(provider: str, model: str, key: str, url: str | None) -> dict:
    """Core connection test shared by both vault-aware and pre-vault routes."""
    try:
        p = provider.lower()
        
        # UI VALIDATION INTERCEPT: Prevent OpenRouter models from being tested under Groq.
        # This mirrors the Smart Router logic in Inference, directly blocking fake "Pass" responses.
        if p == "groq" and "/" in model:
            return {
                "success": False,
                "message": f"❌ CONFIG ERROR: '{model}' contains a proxy slash ('/') which is incompatible with the Groq API provider. Delete this identity and re-add it using the 'OpenAI' provider for OpenRouter proxies."
            }
            
        if p == "groq":
            import litellm
            # Ensure model is prefixed with groq/ for LiteLLM routing
            test_model = f"groq/{model}" if not model.startswith("groq/") else model
            litellm.completion(
                model=test_model,
                messages=[{"role": "user", "content": "ping"}],
                api_key=key,
                max_tokens=1,
                timeout=8.0
            )
        elif p in ("openai", "openrouter", "gemini"):
            from openai import OpenAI
            default_urls = {
                "openai": "https://api.openai.com/v1",
                "openrouter": "https://openrouter.ai/api/v1",
                "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/"
            }
            if p == "gemini":
                url = _normalize_gemini_openai_base_url(url)
            client = OpenAI(
                api_key=key,
                base_url=url or default_urls.get(p, "https://api.openai.com/v1")
            )
            ping_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
            if p == "gemini":
                ping_model = _normalize_gemini_model_name(ping_model)
            client.chat.completions.create(
                messages=[{"role": "user", "content": "ping"}],
                model=ping_model,
                max_tokens=1
            )
        elif p == "ollama":
            base = (url or settings.OLLAMA_BASE_URL).rstrip("/")
            resp = requests.post(
                f"{base}/api/generate",
                json={"model": model, "prompt": "hi", "stream": False},
                timeout=20
            )
            if resp.status_code != 200:
                raise Exception(f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}")
        else:
            raise Exception(f"Unknown provider '{provider}'. Supported: Groq, OpenAI, Ollama, OpenRouter, Gemini.")

        return {"success": True, "message": f"✅ {provider} / {model} — ONLINE"}

    except Exception as e:
        return {"success": False, "message": ConnectionDiagnostic.analyze(provider, e)}


def _run_runtime_smoke(provider: str, model: str, key: str, url: str | None) -> dict:
    """Runtime-equivalent identity validation using the same normalization path as live agents."""
    try:
        identity = {
            "provider": provider,
            "model": model,
            "key": key,
            "url": url,
        }
        prompt = "Reply with the single word: pong."

        result = InferenceCoordinator.run_identity_smoke(
            identity=identity,
            prompt=prompt,
            log_step_fn=lambda *args, **kwargs: None,
            task_id="identity_smoke",
            topology_id="IdentitySmoke",
            temperature=0.0,
            max_tokens=32,
        )
        return {
            "success": True,
            "message": f"✅ {provider} / {model} — RUNTIME OK",
            "sample": result[:200],
        }
    except Exception as e:
        return {"success": False, "message": ConnectionDiagnostic.analyze(provider, e)}


# ── API ENDPOINTS ────────────────────────────────────────────────────────────

@router.get("/health")
def get_global_mesh_health(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns real-time telemetry from the Inference Audit mesh for the Financial Dashboard."""
    total_calls = db.query(InferenceAudit).count()
    success_rate = 0
    if total_calls > 0:
        successes = db.query(InferenceAudit).filter(InferenceAudit.status == "success").count()
        success_rate = (successes / total_calls) * 100
        
    stats = db.query(
        func.sum(InferenceAudit.tokens_used).label("total_tokens"),
        func.sum(InferenceAudit.cost_usd).label("total_cost"),
        func.avg(InferenceAudit.latency_ms).label("avg_latency")
    ).first()
    
    return {
        "calls": total_calls,
        "success_percent": round(success_rate, 1),
        "total_tokens": stats.total_tokens or 0,
        "total_cost_usd": round(stats.total_cost or 0.0, 4),
        "avg_latency_ms": int(stats.avg_latency or 0)
    }

@router.get("/vault")
def get_identity_vault(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Returns all tier pools with masked identity keys and live circuit-breaking status."""
    pools  = db.query(LLMKeyPool).all()
    result = []
    from datetime import datetime
    now = datetime.utcnow()
    
    for pool in pools:
        idents = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.pool_id == pool.id).all()
        result.append({
            "id":         pool.id,
            "tier":       pool.tier,
            "policy":     pool.rotation_policy,
            "identities": [
                {
                    "id":         i.id,
                    "provider":   i.provider,
                    "model":      i.model_name,
                    "status":     "benched" if i.cooldown_until and i.cooldown_until > now else i.status,
                    "cooldown":   i.cooldown_until.isoformat() if i.cooldown_until and i.cooldown_until > now else None,
                    "usage":      i.usage_tokens,
                    "requests":   i.usage_requests,
                    "last_used":  i.last_used,
                    "key_masked": (
                        f"{SecretVault.decrypt(i.encrypted_key)[:4]}****"
                        if i.encrypted_key else "EMPTY"
                    ),
                }
                for i in idents
            ],
        })
    return result


@router.post("/identity")
def add_identity_to_vault(req: LLMConfig, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Encrypts and persists a new identity into the specified tier pool."""
    if settings.LOCAL_ONLY_MESH:
        raise HTTPException(
            status_code=409,
            detail="Local-only mesh mode is enabled. Identity vault add/test is temporarily disabled so all agents use Ollama only.",
        )
    try:
        provider = req.provider.lower().strip()
        initial_status = (req.status or "standby").strip().lower()
        if initial_status not in {"active", "standby", "rotated", "revoked"}:
            initial_status = "standby"
        preflight_warning = None
        if provider == "gemini" and req.key:
            preflight = _run_runtime_smoke(provider, req.model, req.key, req.url)
            if not preflight.get("success"):
                preflight_warning = preflight.get("message", "Gemini preflight failed.")
                initial_status = "standby"

        tier = (req.tier or "primary").lower()
        pool = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier).first()
        if not pool:
            pool = LLMKeyPool(tier=tier)
            db.add(pool)
            db.flush()

        new_ident = LLMKeyIdentity(
            pool_id       = pool.id,
            provider      = req.provider,
            model_name    = req.model,
            encrypted_key = SecretVault.encrypt(req.key),
            base_url      = req.url or (
                settings.OLLAMA_BASE_URL if req.provider.lower() == "ollama" else None
            ),
            status        = initial_status,
        )
        db.add(new_ident)
        db.commit()
        response = {"success": True, "message": f"Identity vaulted in {tier.upper()} Pool."}
        if preflight_warning:
            response["warning"] = preflight_warning
            response["message"] = (
                f"Identity vaulted in {tier.upper()} Pool as STANDBY because preflight failed."
            )
        elif initial_status != "active":
            response["message"] = (
                f"Identity vaulted in {tier.upper()} Pool as {initial_status.upper()}."
            )
        return response
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tier-health")
def get_tier_health(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    TIER HEALTH SUMMARY
    Returns a quick diagnostic of which LLM tiers are populated and ready.
    Use this to diagnose why the mesh is falling back to Local Vault unexpectedly.
    
    Expected healthy state:
      strategic: 1+ active identities (high-quality cloud models)
      primary:   2+ active identities (general cloud models, rotation pool)
      economy:   2+ active identities (fast/cheap cloud models)
      local:     1 identity (Ollama — last resort only)
    """
    from datetime import datetime
    now = datetime.utcnow()
    
    REQUIRED_TIERS = ["strategic", "primary", "economy", "local"]
    result = {}
    warnings = []
    
    for tier_name in REQUIRED_TIERS:
        pool = db.query(LLMKeyPool).filter(
            LLMKeyPool.tier == tier_name,
            LLMKeyPool.is_active == 1
        ).first()
        
        if not pool:
            result[tier_name] = {"status": "❌ POOL MISSING", "active": 0, "on_cooldown": 0, "total": 0}
            if tier_name != "local":
                warnings.append(f"Tier '{tier_name}' pool does not exist — create it in Settings → LLM Vault")
            continue
        
        all_idents = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.pool_id == pool.id).all()
        active = [i for i in all_idents if i.status == "active" and (i.cooldown_until is None or i.cooldown_until < now)]
        on_cooldown = [i for i in all_idents if i.cooldown_until and i.cooldown_until >= now]
        
        status = "✅ READY" if active else ("⚠️ ALL ON COOLDOWN" if on_cooldown else "❌ NO ACTIVE IDENTITIES")
        result[tier_name] = {
            "status": status,
            "active": len(active),
            "on_cooldown": len(on_cooldown),
            "total": len(all_idents),
            "models": [i.model_name for i in active[:5]],
        }
        
        if tier_name != "local" and not active:
            warnings.append(
                f"Tier '{tier_name}' has no active identities "
                f"({len(on_cooldown)} on cooldown, {len(all_idents)} total). "
                f"Add cloud API keys in Settings → LLM Vault to prevent Local Vault fallback."
            )
    
    overall = "✅ HEALTHY" if not warnings else ("⚠️ DEGRADED" if result.get("primary", {}).get("active", 0) > 0 else "❌ CLOUD DEPLETED")
    
    return {
        "overall": overall,
        "tiers": result,
        "warnings": warnings,
        "recommendation": (
            "Add Groq/OpenRouter/Gemini API keys to strategic, primary, and economy tiers. "
            "Each tier should have 2+ identities for rotation. "
            "Local Vault (Ollama) should only activate when all cloud tiers are exhausted."
        ) if warnings else "All tiers are healthy."
    }


@router.delete("/identity/{ident_id}")
def revoke_identity(ident_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Permanently removes an identity from the mesh."""
    ident = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == ident_id).first()
    if not ident:
        raise HTTPException(status_code=404, detail="Identity not found.")
    db.delete(ident)
    db.commit()
    return {"success": True, "message": f"Identity {ident_id} revoked."}


@router.patch("/identity/{ident_id}/status")
def set_identity_status(ident_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Updates an identity's operational state without deleting it."""
    ident = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == ident_id).first()
    if not ident:
        raise HTTPException(status_code=404, detail="Identity not found.")

    status = str(payload.get("status", "")).strip().lower()
    allowed = {"active", "standby", "rotated", "revoked"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status '{status}'. Allowed: {', '.join(sorted(allowed))}")

    ident.status = status
    if status == "active":
        ident.cooldown_until = None
    db.commit()
    return {"success": True, "message": f"Identity {ident_id} marked as {status}."}


@router.post("/identity/{ident_id}/test")
def test_vaulted_identity(ident_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    VAULT-AWARE TEST — decrypts the stored key server-side.
    The frontend sends only the identity ID; the vault provides the key.
    This is the correct way to test an existing vaulted identity.
    """
    if settings.LOCAL_ONLY_MESH:
        return {
            "success": True,
            "message": "⚠️ Local-only mesh mode is enabled. Vault identity tests are bypassed; agents are using Ollama only.",
        }

    ident = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == ident_id).first()
    if not ident:
        raise HTTPException(status_code=404, detail="Identity not found.")

    decrypted_key = SecretVault.decrypt(ident.encrypted_key)
    if not decrypted_key and ident.provider.lower() != "ollama":
        return {
            "success": False,
            "message": "❌ Vault decryption failed — key is empty or corrupted. Revoke and re-vault.",
        }

    logger.info(f"[PULSE] Testing vaulted identity #{ident_id} ({ident.provider}/{ident.model_name})")
    return _run_runtime_smoke(ident.provider, ident.model_name, decrypted_key, ident.base_url)


@router.post("/test")
async def test_identity_pulse(req: LLMConfig, current_user: User = Depends(require_admin)):
    """
    PRE-VAULT TEST — used when testing a NEW identity before saving it.
    The caller must provide the raw key in the request body (except for Ollama).
    """
    if settings.LOCAL_ONLY_MESH:
        return {
            "success": True,
            "message": "⚠️ Local-only mesh mode is enabled. Vault identity testing is bypassed; agents are using Ollama only.",
        }

    if req.provider.lower() != "ollama" and not req.key:
        return {
            "success": False,
            "message": "❌ No API key provided. Enter the key in the form before testing.",
        }
    return _run_runtime_smoke(req.provider, req.model, req.key or "", req.url)


@router.get("/config")
def legacy_bridge_config(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Legacy bridge — returns active identities in the original flat format.
    SECURITY: API keys are masked (first 4 chars + ****). Use POST /identity/{id}/test
    for vault-aware connectivity testing which decrypts server-side without exposing keys.
    """
    pools  = db.query(LLMKeyPool).all()
    legacy = []
    for p in pools:
        ident = db.query(LLMKeyIdentity).filter(
            LLMKeyIdentity.pool_id == p.id,
            LLMKeyIdentity.status  == "active"
        ).first()
        if ident:
            decrypted = SecretVault.decrypt(ident.encrypted_key)
            legacy.append({
                "tier":       p.tier,
                "provider":   ident.provider,
                "model_name": ident.model_name,
                "api_key":    f"{decrypted[:4]}****" if decrypted else "EMPTY",
                "base_url":   ident.base_url,
                "is_active":  1,
            })
    return legacy


# ── INTELLIGENCE OPERATIONS & MESH POLICIES ───────────────────────────────────

@router.get("/intelligence-ops")
def get_intelligence_ops(current_user: User = Depends(get_current_user)):
    """Retrieves current global intelligence policies (Cache, Trace Depth, etc)."""
    from backend.core.config import settings
    return {
        "use_node_cache": getattr(settings, "USE_NODE_CACHE", True),
        "env": settings.ENV,
        "debug": settings.DEBUG
    }

@router.post("/intelligence-ops")
async def update_intelligence_ops(req: dict, current_user: User = Depends(require_admin)):
    """Updates global mesh policies at runtime."""
    from backend.core.config import settings
    
    if "use_node_cache" in req:
        val = bool(req["use_node_cache"])
        settings.USE_NODE_CACHE = val
        logger.info(f"[CONFIG] Intelligence Ops Override: USE_NODE_CACHE = {val}")
        
    return {
        "success": True, 
        "use_node_cache": getattr(settings, "USE_NODE_CACHE", True)
    }
