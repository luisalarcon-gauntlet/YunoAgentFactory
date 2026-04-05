"""Schemas for the workflow recommendation chatbot."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SuggestedWorkflow(BaseModel):
    template_id: str | None = None
    name: str
    description: str
    agents: list[str]


class ChatRecommendRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)


class ChatRecommendResponse(BaseModel):
    message: str
    suggested_workflow: SuggestedWorkflow | None = None
    suggested_action: Literal["use_template", "create_custom"] | None = None
