"""
Fix 3 identified pulse test failures:
1. Identity #124 - model name has a stray backtick (data entry typo)
2. Identity #102 - Gemini 429 rate limited; identify which key is exhausted
3. Identity #39  - Ollama offline (local only; no DB fix needed)
"""
import sys
import os
from dotenv import load_dotenv

project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(project_root)
load_dotenv(os.path.join(project_root, ".env"))

from backend.core.database import LLMKeyIdentity, LLMKeyPool, SessionLocal
from backend.core.vault import SecretVault

db = SessionLocal()

print("=" * 70)
print("FIX #1: Correcting model name for Identity #124")
print("=" * 70)

ident124 = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == 124).first()
if ident124:
    old_name = ident124.model_name
    # Remove stray backtick from model name
    fixed_name = old_name.replace("`", "").strip()
    ident124.model_name = fixed_name
    db.commit()
    print(f"  OLD: {repr(old_name)}")
    print(f"  NEW: {repr(fixed_name)}")
    print("  Status: FIXED")
else:
    print("  Identity #124 not found.")

print()
print("=" * 70)
print("FIX #2: Diagnosing Gemini 429 rate-limited identities")
print("=" * 70)

ident102 = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.id == 102).first()
if ident102:
    try:
        key102 = SecretVault.decrypt(ident102.encrypted_key) or ""
        prefix102 = key102[:10] if key102 else ""
        print(f"  Identity #102 key prefix: {prefix102}...")
    except Exception as e:
        print(f"  Could not decrypt #102 key: {e}")
        prefix102 = ""

    # Find all Gemini identities and check which share the same key
    all_gemini = db.query(LLMKeyIdentity).filter(
        LLMKeyIdentity.provider == "Gemini"
    ).all()

    print(f"\n  Total Gemini identities in vault: {len(all_gemini)}")
    key_groups = {}
    for g in all_gemini:
        try:
            k = SecretVault.decrypt(g.encrypted_key) or ""
            prefix = k[:10]
        except:
            prefix = "DECRYPT_ERROR"
        key_groups.setdefault(prefix, []).append(g.id)

    print("\n  Gemini key distribution (unique API keys):")
    for i, (prefix, ids) in enumerate(key_groups.items(), 1):
        marker = " << RATE LIMITED (429)" if prefix == prefix102 else ""
        print(f"    Key #{i}: {prefix}... -> Identities {ids}{marker}")

    print("\n  Action: The rate-limited key is quota-exhausted for today.")
    print("  Recommendation: Add a new Gemini API key or wait for quota reset (midnight PST).")
else:
    print("  Identity #102 not found.")

print()
print("=" * 70)
print("FIX #3: Ollama (Identity #39) - Local Service Check")
print("=" * 70)
print("  Ollama is a LOCAL service that must be running on this machine.")
print("  The 'UNREACHABLE' error means 'ollama serve' is not currently running.")
print("  This is expected in development environments when Ollama is stopped.")
print("  No database fix needed. Start Ollama with: ollama serve")

print()
print("=" * 70)
print("ALL CLOUD TIERS - STATUS SUMMARY")
print("=" * 70)

tiers = ["strategic", "primary", "economy", "local"]
from datetime import datetime
now = datetime.utcnow()

for tier_name in tiers:
    pool = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier_name).first()
    if not pool:
        print(f"  {tier_name.upper():12s}: [NO POOL]")
        continue
    all_idents = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.pool_id == pool.id).all()
    active = [i for i in all_idents if i.status == "active" and (not i.cooldown_until or i.cooldown_until < now)]
    benched = [i for i in all_idents if i.cooldown_until and i.cooldown_until >= now]
    print(f"  {tier_name.upper():12s}: {len(active)} active, {len(benched)} benched, {len(all_idents)} total")

db.close()
print()
print("Done.")
