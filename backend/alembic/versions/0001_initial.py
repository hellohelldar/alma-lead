"""initial leads table

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-24
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "leads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("resume_key", sa.String(length=512), nullable=False),
        sa.Column("resume_filename", sa.String(length=512), nullable=False),
        sa.Column("resume_content_type", sa.String(length=128), nullable=False),
        sa.Column(
            "state",
            sa.Enum("PENDING", "REACHED_OUT", name="leadstate", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_email", "leads", ["email"])
    op.create_index("ix_leads_state", "leads", ["state"])


def downgrade() -> None:
    op.drop_index("ix_leads_state", table_name="leads")
    op.drop_index("ix_leads_email", table_name="leads")
    op.drop_table("leads")
