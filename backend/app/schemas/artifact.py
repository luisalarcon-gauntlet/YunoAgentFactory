import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


VALID_TYPES = {"application", "document", "website", "code", "other"}
VALID_STATUSES = {"live", "draft", "archived"}


class ArtifactCreate(BaseModel):
    name: str = Field(max_length=300)
    type: str = Field(default="other", max_length=20)
    content: str = ""
    execution_id: uuid.UUID | None = None
    workflow_id: uuid.UUID | None = None
    live_url: str | None = Field(default=None, max_length=500)
    tags: list[str] = []
    status: str = Field(default="draft", max_length=20)


class ArtifactUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=300)
    type: str | None = Field(default=None, max_length=20)
    content: str | None = None
    live_url: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = None
    status: str | None = Field(default=None, max_length=20)


class ArtifactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    content: str
    execution_id: uuid.UUID | None
    workflow_id: uuid.UUID | None
    live_url: str | None
    tags: list
    status: str
    created_at: datetime
    updated_at: datetime
    workflow_name: str | None = None


class ArtifactListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    execution_id: uuid.UUID | None
    workflow_id: uuid.UUID | None
    live_url: str | None
    tags: list
    status: str
    created_at: datetime
    updated_at: datetime
    workflow_name: str | None = None
