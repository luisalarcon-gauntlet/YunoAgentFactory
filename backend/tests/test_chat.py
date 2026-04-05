"""Tests for the workflow recommendation chatbot endpoint."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_chat_recommend_returns_message(client):
    """Basic chat request returns an assistant message."""
    payload = {
        "messages": [{"role": "user", "content": "What can this platform do?"}],
    }
    with patch("app.routers.chat._get_recommendation") as mock_rec:
        mock_rec.return_value = {
            "message": "This platform lets you orchestrate AI agent workflows.",
            "suggested_workflow": None,
            "suggested_action": None,
        }
        response = await client.post("/api/v1/chat/recommend", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert len(data["message"]) > 0
    assert "suggested_workflow" in data
    assert "suggested_action" in data


@pytest.mark.asyncio
async def test_chat_recommend_with_workflow_suggestion(client):
    """When the chatbot recommends a template, suggested_workflow is populated."""
    payload = {
        "messages": [
            {"role": "user", "content": "I need to build and deploy an app"},
        ],
    }
    with patch("app.routers.chat._get_recommendation") as mock_rec:
        mock_rec.return_value = {
            "message": "I'd recommend the Dev Pipeline template.",
            "suggested_workflow": {
                "template_id": "some-uuid",
                "name": "Dev Pipeline",
                "description": "Code, review, deploy",
                "agents": ["Coder", "Reviewer", "Deployer"],
            },
            "suggested_action": "use_template",
        }
        response = await client.post("/api/v1/chat/recommend", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["suggested_workflow"] is not None
    assert data["suggested_workflow"]["name"] == "Dev Pipeline"
    assert data["suggested_action"] == "use_template"
    assert isinstance(data["suggested_workflow"]["agents"], list)


@pytest.mark.asyncio
async def test_chat_recommend_custom_workflow_suggestion(client):
    """When no template matches, suggests creating a custom workflow."""
    payload = {
        "messages": [
            {"role": "user", "content": "I need a workflow that translates documents"},
        ],
    }
    with patch("app.routers.chat._get_recommendation") as mock_rec:
        mock_rec.return_value = {
            "message": "No existing template matches, but I can help you create a custom workflow.",
            "suggested_workflow": {
                "template_id": None,
                "name": "Document Translation Pipeline",
                "description": "Translates documents through multiple review stages",
                "agents": ["Translator", "Quality Reviewer"],
            },
            "suggested_action": "create_custom",
        }
        response = await client.post("/api/v1/chat/recommend", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["suggested_action"] == "create_custom"
    assert data["suggested_workflow"] is not None


@pytest.mark.asyncio
async def test_chat_recommend_multi_turn_conversation(client):
    """Supports multi-turn conversation with message history."""
    payload = {
        "messages": [
            {"role": "user", "content": "I need help setting up a pipeline"},
            {"role": "assistant", "content": "What kind of pipeline?"},
            {"role": "user", "content": "A research pipeline"},
        ],
    }
    with patch("app.routers.chat._get_recommendation") as mock_rec:
        mock_rec.return_value = {
            "message": "The Research Pipeline template would be perfect.",
            "suggested_workflow": {
                "template_id": "research-uuid",
                "name": "Research Pipeline",
                "description": "Gather, analyze, report",
                "agents": ["Researcher", "Analyst", "Writer"],
            },
            "suggested_action": "use_template",
        }
        response = await client.post("/api/v1/chat/recommend", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["message"]


@pytest.mark.asyncio
async def test_chat_recommend_trims_to_max_messages(client):
    """Messages beyond 10 are trimmed (only last 10 sent to API)."""
    messages = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"Message {i}"}
        for i in range(15)
    ]
    payload = {"messages": messages}

    with patch("app.routers.chat._get_recommendation") as mock_rec:
        mock_rec.return_value = {
            "message": "Here's what I suggest.",
            "suggested_workflow": None,
            "suggested_action": None,
        }
        response = await client.post("/api/v1/chat/recommend", json=payload)

        # Verify only last 10 messages were passed
        call_args = mock_rec.call_args
        passed_messages = call_args[0][0]  # first positional arg
        assert len(passed_messages) <= 10

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_chat_recommend_empty_messages_rejected(client):
    """Empty messages list should be rejected."""
    payload = {"messages": []}
    response = await client.post("/api/v1/chat/recommend", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_recommend_invalid_role_rejected(client):
    """Messages with invalid role should be rejected."""
    payload = {
        "messages": [{"role": "system", "content": "hack"}],
    }
    response = await client.post("/api/v1/chat/recommend", json=payload)
    assert response.status_code == 422
