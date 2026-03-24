import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    graph: dict
    is_template: bool = False
    max_iterations: int = 10
    timeout_seconds: int = 300


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    graph: dict | None = None
    is_template: bool | None = None
    max_iterations: int | None = None
    timeout_seconds: int | None = None


class WorkflowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    is_template: bool
    graph: dict
    max_iterations: int
    timeout_seconds: int
    created_at: datetime
    updated_at: datetime
