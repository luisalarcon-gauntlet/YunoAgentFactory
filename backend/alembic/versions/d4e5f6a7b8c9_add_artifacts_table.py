"""add artifacts table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-04 00:00:00.000000
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str = "c3d4e5f6a7b8"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("type", sa.String(20), nullable=False, server_default="other"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_executions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("live_url", sa.String(500), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_artifacts_execution_id", "artifacts", ["execution_id"])
    op.create_index("idx_artifacts_workflow_id", "artifacts", ["workflow_id"])
    op.create_index("idx_artifacts_status", "artifacts", ["status"])
    op.create_index("idx_artifacts_type", "artifacts", ["type"])


def downgrade() -> None:
    op.drop_index("idx_artifacts_type", table_name="artifacts")
    op.drop_index("idx_artifacts_status", table_name="artifacts")
    op.drop_index("idx_artifacts_workflow_id", table_name="artifacts")
    op.drop_index("idx_artifacts_execution_id", table_name="artifacts")
    op.drop_table("artifacts")
