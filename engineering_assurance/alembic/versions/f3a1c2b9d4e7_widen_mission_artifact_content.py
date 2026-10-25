"""Widen mission artifact content for large final reports

Revision ID: f3a1c2b9d4e7
Revises: e9d4c1b66c9f
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "f3a1c2b9d4e7"
down_revision: Union[str, Sequence[str], None] = "e9d4c1b66c9f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.alter_column(
            "mission_artifacts",
            "artifact_content",
            existing_type=sa.Text(),
            type_=mysql.LONGTEXT(),
            existing_nullable=True,
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.alter_column(
            "mission_artifacts",
            "artifact_content",
            existing_type=mysql.LONGTEXT(),
            type_=sa.Text(),
            existing_nullable=True,
        )
