import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RunCreate(BaseModel):
    workflow_id: uuid.UUID
    source: str = "web"
    source_metadata: dict | None = None
    inputs: str | None = ""


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    source: str
    source_metadata: dict
    current_node_id: str | None
    iteration_count: int
    trigger_type: str
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime
    workflow_name: str | None = None


class AgentEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    run_id: uuid.UUID
    agent_name: str
    event_type: str
    message: str
    metadata: dict | None = Field(default=None, validation_alias="event_metadata")
    timestamp: datetime


class RunOutputResponse(BaseModel):
    run_id: uuid.UUID
    status: str
    output: str
