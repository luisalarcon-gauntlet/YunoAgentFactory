"""Router for the workflow recommendation chatbot."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.models.workflow import Workflow
from app.schemas.chat import ChatRecommendRequest, ChatRecommendResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

MAX_CONTEXT_MESSAGES = 10


def _build_system_prompt(
    templates: list[dict[str, Any]],
    agents: list[dict[str, Any]],
) -> str:
    """Build the system prompt with available templates and agents."""
    template_descriptions = []
    for t in templates:
        nodes = t.get("graph", {}).get("nodes", [])
        agent_names = [n.get("data", {}).get("label", "Unknown") for n in nodes]
        template_descriptions.append(
            f"- **{t['name']}** (id: {t['id']}): {t.get('description', 'No description')}. "
            f"Agents: {', '.join(agent_names)}. Max iterations: {t.get('max_iterations', 10)}."
        )

    agent_descriptions = []
    for a in agents:
        skills = ", ".join(a.get("skills", [])) if a.get("skills") else "none"
        tools = ", ".join(a.get("tools", [])) if a.get("tools") else "none"
        agent_descriptions.append(
            f"- **{a['name']}**: {a.get('role', 'No role')}. Tools: {tools}. Skills: {skills}."
        )

    return f"""You are a workflow recommendation assistant for the Yuno AI Agent Orchestration Platform.

## Platform Capabilities
- Users build multi-agent workflows where AI agents execute tasks in sequence or with conditional branching
- Workflows are visual graphs: nodes are agents, edges define execution flow with conditions (always, approved, rejected)
- Agents can use tools like shell, file_read, file_write, web_search, browser, code_interpreter
- Workflows support feedback loops (e.g., reviewer rejects → loops back to coder)
- Each workflow has configurable max iterations and timeout

## Available Workflow Templates
{chr(10).join(template_descriptions) if template_descriptions else "No templates available yet."}

## Available Agents
{chr(10).join(agent_descriptions) if agent_descriptions else "No agents configured yet."}

## Your Behavior
- Ask 1-2 clarifying questions if the user's need is vague, then converge on a recommendation within 3-4 turns
- When recommending a template, include its ID and agent list
- If no template fits, describe what a custom workflow would look like
- Be concise and helpful — this is a quick assistant, not a tutorial
- When you have a recommendation, respond with a JSON block at the END of your message in this exact format:

```json
{{"suggested_workflow": {{"template_id": "<id or null>", "name": "<name>", "description": "<short desc>", "agents": ["Agent1", "Agent2"]}}, "suggested_action": "use_template" | "create_custom"}}
```

Only include the JSON block when you have a concrete recommendation. For clarifying questions, just respond with text."""


def _parse_suggestion(text: str) -> tuple[str, dict | None, str | None]:
    """Extract structured suggestion from the assistant's response text.

    Returns (clean_message, suggested_workflow, suggested_action).
    """
    import re

    json_match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not json_match:
        return text.strip(), None, None

    clean_message = text[: json_match.start()].strip()
    try:
        data = json.loads(json_match.group(1))
        suggested_workflow = data.get("suggested_workflow")
        suggested_action = data.get("suggested_action")
        if suggested_action not in ("use_template", "create_custom"):
            suggested_action = None
        return clean_message, suggested_workflow, suggested_action
    except (json.JSONDecodeError, KeyError):
        return text.strip(), None, None


async def _get_recommendation(
    messages: list[dict[str, str]],
    system_prompt: str,
) -> dict:
    """Call the Anthropic API to get a chat recommendation.

    Separated for testability — tests mock this function.
    """
    try:
        import anthropic
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Anthropic SDK not installed. Cannot provide recommendations.",
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured.",
        )

    client = anthropic.AsyncAnthropic(api_key=api_key)

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
        text = response.content[0].text
    except Exception:
        logger.exception("Anthropic API call failed")
        raise HTTPException(status_code=502, detail="Failed to get recommendation from AI.")

    message, suggested_workflow, suggested_action = _parse_suggestion(text)

    return {
        "message": message,
        "suggested_workflow": suggested_workflow,
        "suggested_action": suggested_action,
    }


@router.post("/recommend", response_model=ChatRecommendResponse)
async def chat_recommend(
    body: ChatRecommendRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a workflow recommendation based on conversation."""

    # Trim to last N messages
    trimmed = body.messages[-MAX_CONTEXT_MESSAGES:]

    # Load templates and agents for the system prompt
    template_result = await db.execute(
        select(Workflow).where(Workflow.is_template.is_(True))
    )
    templates = [
        {
            "id": str(w.id),
            "name": w.name,
            "description": w.description,
            "graph": w.graph,
            "max_iterations": w.max_iterations,
        }
        for w in template_result.scalars().all()
    ]

    agent_result = await db.execute(select(Agent))
    agents = [
        {
            "name": a.name,
            "role": a.role,
            "tools": a.tools,
            "skills": a.skills,
        }
        for a in agent_result.scalars().all()
    ]

    system_prompt = _build_system_prompt(templates, agents)

    messages = [{"role": m.role, "content": m.content} for m in trimmed]

    result = await _get_recommendation(messages, system_prompt)
    return result
