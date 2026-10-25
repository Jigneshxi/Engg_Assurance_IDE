"""
LLM IDENTITY MESH — LIVE PULSE TEST
Tests every vaulted identity by making a real API ping call.
Mirrors the _run_pulse() logic from backend/api/routes/llm.py.
"""
import sys
import os
import time
from datetime import datetime
from dotenv import load_dotenv

project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(project_root)
load_dotenv(os.path.join(project_root, ".env"))

from backend.core.database import LLMKeyPool, LLMKeyIdentity, SessionLocal
from backend.core.vault import SecretVault


def pulse_test(provider: str, model: str, key: str, url: str) -> dict:
    """Single identity live ping. Returns {pass: bool, message: str, latency_ms: int}"""
    start = time.time()
    try:
        p = provider.lower()

        if p == "groq":
            from groq import Groq
            client = Groq(api_key=key)
            client.chat.completions.create(
                messages=[{"role": "user", "content": "ping"}],
                model=model,
                max_tokens=1
            )

        elif p in ("openai", "openrouter", "gemini"):
            from openai import OpenAI
            DEFAULT_URLS = {
                "openai":    "https://api.openai.com/v1",
                "openrouter":"https://openrouter.ai/api/v1",
                "gemini":    "https://generativelanguage.googleapis.com/v1beta/openai/"
            }
            clean_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
            client = OpenAI(
                api_key=key,
                base_url=url or DEFAULT_URLS.get(p, "https://api.openai.com/v1")
            )
            client.chat.completions.create(
                messages=[{"role": "user", "content": "ping"}],
                model=clean_model,
                max_tokens=1
            )

        elif p == "ollama":
            import requests as req
            from backend.core.config import settings
            base = (url or settings.OLLAMA_BASE_URL).rstrip("/")
            resp = req.post(
                f"{base}/api/generate",
                json={"model": model, "prompt": "hi", "stream": False},
                timeout=20
            )
            if resp.status_code != 200:
                raise Exception(f"Ollama HTTP {resp.status_code}: {resp.text[:100]}")
        else:
            raise Exception(f"Unknown provider: {provider}")

        latency = int((time.time() - start) * 1000)
        return {"pass": True, "message": f"PASS ({latency}ms)", "latency_ms": latency}

    except Exception as e:
        latency = int((time.time() - start) * 1000)
        err = str(e)
        # Classify the error for quick triage
        if "401" in err or "authentication" in err.lower() or "invalid api key" in err.lower():
            tag = "[KEY_INVALID]"
        elif "429" in err:
            tag = "[RATE_LIMITED]"
        elif "refused" in err.lower() or "connect" in err.lower():
            tag = "[UNREACHABLE]"
        elif "model" in err.lower() and "not found" in err.lower():
            tag = "[MODEL_NOT_FOUND]"
        else:
            tag = "[ERROR]"
        return {"pass": False, "message": f"FAIL {tag} - {err[:120]}", "latency_ms": latency}


def run_all_pulse_tests():
    db = SessionLocal()
    try:
        print("=" * 80)
        print("LLM IDENTITY MESH — LIVE PULSE TEST")
        print(f"Started: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
        print("=" * 80)

        pools = db.query(LLMKeyPool).order_by(LLMKeyPool.tier).all()

        total = 0
        passed = 0
        failed = 0
        skipped = 0
        failures = []

        # Track which models we've already tested per provider (avoid hammering duplicates)
        tested_signatures = {}

        for pool in pools:
            print(f"\n[TIER: {pool.tier.upper()}]")
            print("-" * 60)

            identities = db.query(LLMKeyIdentity).filter(
                LLMKeyIdentity.pool_id == pool.id,
                LLMKeyIdentity.status == "active"
            ).all()

            if not identities:
                print("  No active identities in this tier.")
                continue

            for ident in identities:
                total += 1
                sig = f"{ident.provider}|{ident.model_name}"

                # Decrypt the key
                try:
                    raw_key = SecretVault.decrypt(ident.encrypted_key) or ""
                except Exception as e:
                    print(f"  #{ident.id:4d} {ident.provider:12s} / {ident.model_name:40s}  [VAULT_FAIL] Cannot decrypt: {e}")
                    failed += 1
                    failures.append((ident.id, ident.provider, ident.model_name, "VAULT_FAIL"))
                    continue

                if not raw_key and ident.provider.lower() != "ollama":
                    print(f"  #{ident.id:4d} {ident.provider:12s} / {ident.model_name:40s}  [EMPTY_KEY] Skipped")
                    skipped += 1
                    continue

                # Skip duplicate model/provider combos (test one representative per unique sig)
                if sig in tested_signatures:
                    prior = tested_signatures[sig]
                    status = "PASS" if prior["pass"] else "FAIL"
                    print(f"  #{ident.id:4d} {ident.provider:12s} / {ident.model_name:40s}  [SKIP - same model, prior result: {status}]")
                    skipped += 1
                    if not prior["pass"]:
                        failed += 1
                    else:
                        passed += 1
                    continue

                result = pulse_test(ident.provider, ident.model_name, raw_key, ident.base_url)
                tested_signatures[sig] = result

                status_label = "PASS" if result["pass"] else "FAIL"
                print(f"  #{ident.id:4d} {ident.provider:12s} / {ident.model_name:40s}  [{status_label}] {result['message']}")

                if result["pass"]:
                    passed += 1
                else:
                    failed += 1
                    failures.append((ident.id, ident.provider, ident.model_name, result["message"]))

                # Throttle slightly to avoid consecutive rate-limit hits on same provider
                time.sleep(0.5)

        print("\n" + "=" * 80)
        print("PULSE TEST SUMMARY")
        print("=" * 80)
        print(f"  Total Identities : {total}")
        print(f"  Unique Tests Run : {len(tested_signatures)}")
        print(f"  PASSED           : {passed}")
        print(f"  FAILED           : {failed}")
        print(f"  SKIPPED          : {skipped}")
        print(f"  Overall Status   : {'ALL SYSTEMS GO' if failed == 0 else 'DEGRADED - ACTION REQUIRED'}")

        if failures:
            print("\nFAILED IDENTITIES:")
            for fid, fprov, fmodel, fmsg in failures:
                print(f"  #{fid} {fprov} / {fmodel}")
                print(f"    >> {fmsg}")

        print("=" * 80)

    finally:
        db.close()


if __name__ == "__main__":
    run_all_pulse_tests()
