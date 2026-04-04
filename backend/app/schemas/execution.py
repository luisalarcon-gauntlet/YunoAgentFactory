import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExecutionCreate(BaseModel):
    workflow_id: uuid.UUID
    input: str | None = Field(default="", max_length=50000)


class ExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    current_node_id: str | None
    iteration_count: int
    trigger_type: str
    source: str = "web"
    source_metadata: dict = {}
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime
    workflow_name: str | None = None


class ExecutionStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    execution_id: uuid.UUID
    node_id: str
    agent_id: uuid.UUID
    agent_name: str | None = None
    status: str
    input_data: str | None
    output_data: str | None
    token_count: int
    cost_usd: Decimal
    duration_ms: int
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime


class AgentMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    execution_id: uuid.UUID
    from_agent_id: uuid.UUID | None
    to_agent_id: uuid.UUID | None
    from_agent_name: str | None = None
    to_agent_name: str | None = None
    channel: str
    content: str
    message_type: str
    metadata: dict
    created_at: datetime
