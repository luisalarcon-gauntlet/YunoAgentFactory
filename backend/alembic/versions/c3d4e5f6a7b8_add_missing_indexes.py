"""add missing database indexes

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-04 00:00:00.000000
"""
from typing import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str = "a1b2c3d4e5f6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("idx_workflow_executions_workflow_id", "workflow_executions", ["workflow_id"])
    op.create_index("idx_workflow_executions_status", "workflow_executions", ["status"])
    op.create_index("idx_agent_messages_from_agent_id", "agent_messages", ["from_agent_id"])
    op.create_index("idx_agent_messages_to_agent_id", "agent_messages", ["to_agent_id"])
    op.create_index("idx_execution_steps_agent_id", "execution_steps", ["agent_id"])


def downgrade() -> None:
    op.drop_index("idx_execution_steps_agent_id", table_name="execution_steps")
    op.drop_index("idx_agent_messages_to_agent_id", table_name="agent_messages")
    op.drop_index("idx_agent_messages_from_agent_id", table_name="agent_messages")
    op.drop_index("idx_workflow_executions_status", table_name="workflow_executions")
    op.drop_index("idx_workflow_executions_workflow_id", table_name="workflow_executions")
