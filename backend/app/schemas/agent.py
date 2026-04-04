import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentCreate(BaseModel):
    name: str = Field(max_length=200)
    role: str = Field(max_length=200)
    system_prompt: str = Field(max_length=50000)
    model: str = Field(default="claude-sonnet-4-20250514", max_length=200)
    tools: list[str] = []
    channels: list[str] = []
    schedule: dict | None = None
    memory: dict = {}
    skills: list[str] = []
    interaction_rules: dict = {}
    guardrails: dict = {}


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    system_prompt: str | None = Field(default=None, max_length=50000)
    model: str | None = Field(default=None, max_length=200)
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
