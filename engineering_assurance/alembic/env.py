"""
================================================================================
VVNT — ALEMBIC ENVIRONMENT (env.py)
================================================================================
Wired to the project's SQLAlchemy models and settings so that:
  - `alembic revision --autogenerate` detects schema changes automatically.
  - The database URL is always read from the .env file (MYSQL_URL / DB_ENGINE).
  - Both online (live DB) and offline (SQL script) migration modes are supported.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Make the project root importable ─────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Load project settings and ORM metadata ───────────────────────────────────
from backend.core.config import settings
from backend.core.database import Base  # noqa: F401 — imports all ORM models

# Import every model module so Alembic can see all table definitions
import backend.core.database  # noqa: F401

# ── Alembic Config object ─────────────────────────────────────────────────────
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Resolve the database URL ──────────────────────────────────────────────────
def get_url() -> str:
    """
    Priority:
    1. MYSQL_URL env var (when DB_ENGINE=mysql)
    2. SQLite fallback (local development)
    """
    if settings.DB_ENGINE.lower() == "mysql" and settings.MYSQL_URL:
        return settings.MYSQL_URL
    sqlite_path = os.path.join(settings.BASE_DIR, "test_planning_stable.db")
    return f"sqlite:///{sqlite_path}"


# Override the URL in the Alembic config so engine_from_config picks it up
# Escape % signs — configparser treats % as an interpolation character
config.set_main_option("sqlalchemy.url", get_url().replace("%", "%%"))

# ── Target metadata (all ORM models) ─────────────────────────────────────────
target_metadata = Base.metadata


# ── OFFLINE mode — generates a .sql script without connecting ─────────────────
def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── ONLINE mode — connects to the live database ───────────────────────────────
def run_migrations_online() -> None:
    from sqlalchemy import create_engine
    connectable = create_engine(get_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
