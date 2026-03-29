"""add source fields to workflow_executions and agent_events table

Revision ID: a1b2c3d4e5f6
Revises: 8573fcab806c
Create Date: 2026-03-28 00:00:00.000000
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str = "8573fcab806c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add source columns to workflow_executions
    op.add_column(
        "workflow_executions",
        sa.Column("source", sa.String(20), nullable=False, server_default="web"),
    )
    op.add_column(
        "workflow_executions",
        sa.Column("source_metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
    )

    # Create notification_preferences table
    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_chat_id", sa.String(100), nullable=True),
        sa.Column("notify_on_start", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("notify_on_complete", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("notify_on_failure", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create agent_events table
    op.create_table(
        "agent_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_executions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_name", sa.String(200), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_agent_events_run", "agent_events", ["run_id"])


def downgrade() -> None:
    op.drop_index("idx_agent_events_run", table_name="agent_events")
    op.drop_table("agent_events")
    op.drop_table("notification_preferences")
    op.drop_column("workflow_executions", "source_metadata")
    op.drop_column("workflow_executions", "source")
