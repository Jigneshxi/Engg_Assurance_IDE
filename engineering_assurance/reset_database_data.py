import logging

from sqlalchemy import inspect, text

from backend.core.database import engine


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def clear_all_data():
    inspector = inspect(engine)
    tables = [name for name in inspector.get_table_names() if name != "alembic_version"]

    if not tables:
        logger.info("No tables found to clear.")
        return

    with engine.begin() as conn:
        dialect = engine.dialect.name
        if dialect == "mysql":
            conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

        try:
            for table in tables:
                logger.info("Clearing table %s", table)
                conn.execute(text(f"DELETE FROM `{table}`"))

            if dialect == "mysql":
                for table in tables:
                    try:
                        conn.execute(text(f"ALTER TABLE `{table}` AUTO_INCREMENT = 1"))
                    except Exception:
                        # Not every table has an AUTO_INCREMENT column.
                        pass
        finally:
            if dialect == "mysql":
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    logger.info("Data wipe complete. Schema left intact.")


if __name__ == "__main__":
    clear_all_data()
