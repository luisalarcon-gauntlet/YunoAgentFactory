import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AgentCreate(BaseModel):
    name: str
    role: str
    system_prompt: str
    model: str = "claude-sonnet-4-20250514"
    tools: list[str] = []
    channels: list[str] = []
    schedule: dict | None = None
    memory: dict = {}
    skills: list[str] = []
    interaction_rules: dict = {}
    guardrails: dict = {}


class AgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    tools: list[str] | None = None
    channels: list[str] | None = None
    schedule: dict | None = None
    memory: dict | None = None
    skills: list[str] | None = None
    interaction_rules: dict | None = None
    guardrails: dict | None = None


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    system_prompt: str
    model: str
    tools: list
    channels: list
    schedule: dict | None
    memory: dict
    skills: list
    interaction_rules: dict
    guardrails: dict
    openclaw_workspace: str | None
    openclaw_session_key: str | None
    status: str
    created_at: datetime
    updated_at: datetime
