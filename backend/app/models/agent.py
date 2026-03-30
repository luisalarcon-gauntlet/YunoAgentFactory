import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="claude-haiku-4-20250514")
    tools: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    channels: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)

    schedule: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    memory: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    skills: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    interaction_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    guardrails: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    openclaw_workspace: Mapped[str | None] = mapped_column(String(200), nullable=True)
    openclaw_session_key: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
