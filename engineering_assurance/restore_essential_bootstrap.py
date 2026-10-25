import logging

from backend.core.database import SessionLocal, LLMKeyPool
from backend.core.auth_models import User
from backend.core.vault_seeder import seed_vault_from_env, log_vault_summary

try:
    from dotenv import load_dotenv
    load_dotenv(".env")
except Exception:
    pass


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def restore_bootstrap():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.id == 1).first()
        if not admin:
            db.add(
                User(
                    id=1,
                    username="Admin_Bypass",
                    email="admin@local.host",
                    password_hash="local-bootstrap-placeholder",
                    is_superuser=True,
                    is_active=True,
                )
            )
            db.commit()
            logger.info("Seeded fallback admin user with id=1.")

        seeded = []
        for tier_name in ("strategic", "primary", "economy", "local"):
            pool = db.query(LLMKeyPool).filter(LLMKeyPool.tier == tier_name).first()
            if not pool:
                db.add(LLMKeyPool(tier=tier_name, is_active=1))
                seeded.append(tier_name)
        if seeded:
            db.commit()
            logger.info("Seeded missing LLM pools: %s", seeded)

        summary = seed_vault_from_env()
        log_vault_summary(summary)
    finally:
        db.close()


if __name__ == "__main__":
    restore_bootstrap()
