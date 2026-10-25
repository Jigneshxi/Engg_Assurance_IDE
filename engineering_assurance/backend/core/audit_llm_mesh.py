import sys
import os
from datetime import datetime
from dotenv import load_dotenv

# Add the project root to sys.path so we can import our modules
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(project_root)

# Load environment variables from .env
load_dotenv(os.path.join(project_root, ".env"))

# Set environment variable for database if needed (default is sqlite)
# DATABASE_URL is now loaded from .env, but we can override if it's missing
if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "sqlite:///backend/core/database.sqlite"

from backend.core.database import LLMKeyPool, LLMKeyIdentity, SessionLocal
from backend.core.vault import SecretVault

def audit_llm_mesh():
    db = SessionLocal()
    try:
        print("="*80)
        print("LLM IDENTITY MESH AUDIT - REAL-TIME DIAGNOSTIC")
        print("="*80)
        
        now = datetime.utcnow()
        pools = db.query(LLMKeyPool).all()
        
        if not pools:
            print("[CRITICAL] No LLM Key Pools found in database.")
            return

        for pool in pools:
            print(f"\n[TIER: {pool.tier.upper()}] Status: {'ACTIVE' if pool.is_active else 'DISABLED'}")
            print("-" * 40)
            
            identities = db.query(LLMKeyIdentity).filter(LLMKeyIdentity.pool_id == pool.id).all()
            if not identities:
                print("  ! No identities configured for this tier.")
                continue

            for ident in identities:
                is_benched = ident.cooldown_until and ident.cooldown_until > now
                status_str = f"BENCHED (Cooldown ends: {ident.cooldown_until})" if is_benched else ident.status.upper()
                
                # Check key existence/decryption
                try:
                    raw_key = SecretVault.decrypt(ident.encrypted_key)
                    if raw_key:
                        masked = f"{raw_key[:4]}****"
                        key_health = f"[OK] VALID (Decrypted: {masked})"
                    else:
                        key_health = "[FAIL] ERROR (Empty/Corrupt)"
                except Exception as e:
                    key_health = f"[FAIL] DECRYPTION FAILED: {str(e)}"
                
                print(f"  Identity #{ident.id}: {ident.provider} / {ident.model_name}")
                print(f"    Status:   {status_str}")
                print(f"    Vault:    {key_health}")
                print(f"    Metrics:  {ident.usage_requests} reqs, {ident.usage_tokens} tokens")
                print(f"    Last Used: {ident.last_used if ident.last_used else 'Never'}")
                print("")

        print("="*80)
        print("Audit Complete.")
        print("="*80)

    finally:
        db.close()

if __name__ == "__main__":
    audit_llm_mesh()
