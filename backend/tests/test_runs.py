"""Tests for the unified /api/v1/runs endpoints."""
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.models.agent import Agent
from app.models.execution import AgentEvent, WorkflowExecution
from app.models.workflow import Workflow


# ── Fixtures ──


@pytest_asyncio.fixture
async def sample_workflow(db_session):
    """Create a minimal workflow for testing."""
    wf = Workflow(
        id=uuid.uuid4(),
        name="Test Pipeline",
        description="A test workflow",
        graph={
            "nodes": [
                {
                    "id": "node-1",
                    "type": "agentNode",
                    "position": {"x": 0, "y": 0},
                    "data": {"agent_id": str(uuid.uuid4()), "config": {}},
                }
            ],
            "edges": [],
        },
        max_iterations=10,
        timeout_seconds=300,
    )
    db_session.add(wf)
    await db_session.commit()
    await db_session.refresh(wf)
    return wf


@pytest_asyncio.fixture
async def sample_run(db_session, sample_workflow):
    """Create a workflow execution (run) for testing."""
    run = WorkflowExecution(
        id=uuid.uuid4(),
        workflow_id=sample_workflow.id,
        status="completed",
        source="web",
        source_metadata={},
        iteration_count=3,
    )
    db_session.add(run)
    await db_session.commit()
    await db_session.refresh(run)
    return run


@pytest_asyncio.fixture
async def sample_telegram_run(db_session, sample_workflow):
    """Create a telegram-sourced run."""
    run = WorkflowExecution(
        id=uuid.uuid4(),
        workflow_id=sample_workflow.id,
        status="running",
        source="telegram",
        source_metadata={"telegram_chat_id": "12345", "user_id": "tg_user_1"},
        iteration_count=1,
    )
    db_session.add(run)
    await db_session.commit()
    await db_session.refresh(run)
    return run


@pytest_asyncio.fixture
async def sample_events(db_session, sample_run):
    """Create agent events for a run."""
    events = [
        AgentEvent(
            run_id=sample_run.id,
            agent_name="Coder",
            event_type="started",
            message="Agent started processing",
        ),
        AgentEvent(
            run_id=sample_run.id,
            agent_name="Coder",
            event_type="output",
            message="Generated code for todo app",
        ),
        AgentEvent(
            run_id=sample_run.id,
            agent_name="Coder",
            event_type="completed",
            message="Agent finished",
        ),
    ]
    for event in events:
        db_session.add(event)
    await db_session.commit()
    return events


# ── POST /api/v1/runs ──


@pytest.mark.asyncio
async def test_create_run_web(client, sample_workflow):
    """Creating a run from web source returns 201 with source='web'."""
    payload = {
        "workflow_id": str(sample_workflow.id),
        "source": "web",
        "inputs": "Build a todo app",
    }
    response = await client.post("/api/v1/runs", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["source"] == "web"
    assert data["status"] == "pending"
    assert data["workflow_id"] == str(sample_workflow.id)
    assert "id" in data


@pytest.mark.asyncio
async def test_create_run_telegram(client, sample_workflow):
    """Creating a run from telegram source stores source_metadata."""
    payload = {
        "workflow_id": str(sample_workflow.id),
        "source": "telegram",
        "source_metadata": {"telegram_chat_id": "99999", "user_id": "tg_bot"},
        "inputs": "Research quantum computing",
    }
    response = await client.post("/api/v1/runs", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["source"] == "telegram"
    assert data["source_metadata"]["telegram_chat_id"] == "99999"


@pytest.mark.asyncio
async def test_create_run_invalid_workflow(client):
    """Creating a run with non-existent workflow returns 404."""
    payload = {
        "workflow_id": str(uuid.uuid4()),
        "source": "web",
    }
    response = await client.post("/api/v1/runs", json=payload)
    assert response.status_code == 404


# ── GET /api/v1/runs ──


@pytest.mark.asyncio
async def test_list_runs(client, sample_run, sample_telegram_run):
    """Listing runs returns all runs with source info."""
    response = await client.get("/api/v1/runs")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    sources = {r["source"] for r in data}
    assert "web" in sources
    assert "telegram" in sources


@pytest.mark.asyncio
async def test_list_runs_filter_by_workflow(client, sample_run, sample_workflow):
    """Filtering runs by workflow_id returns only matching runs."""
    response = await client.get(f"/api/v1/runs?workflow_id={sample_workflow.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(r["workflow_id"] == str(sample_workflow.id) for r in data)


# ── GET /api/v1/runs/{run_id} ──


@pytest.mark.asyncio
async def test_get_run(client, sample_run):
    """Fetching a specific run returns full details with source."""
    response = await client.get(f"/api/v1/runs/{sample_run.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(sample_run.id)
    assert data["source"] == "web"
    assert data["status"] == "completed"


@pytest.mark.asyncio
async def test_get_run_not_found(client):
    """Fetching a non-existent run returns 404."""
    response = await client.get(f"/api/v1/runs/{uuid.uuid4()}")
    assert response.status_code == 404


# ── GET /api/v1/runs/{run_id}/events ──


@pytest.mark.asyncio
async def test_get_run_events(client, sample_run, sample_events):
    """Fetching events for a run returns ordered agent events."""
    response = await client.get(f"/api/v1/runs/{sample_run.id}/events")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert data[0]["event_type"] == "started"
    assert data[1]["event_type"] == "output"
    assert data[2]["event_type"] == "completed"
    assert data[0]["agent_name"] == "Coder"


@pytest.mark.asyncio
async def test_get_run_events_empty(client, sample_run):
    """Fetching events for a run with no events returns empty list."""
    response = await client.get(f"/api/v1/runs/{sample_run.id}/events")
    assert response.status_code == 200
    data = response.json()
    assert data == []


# ── GET /api/v1/runs/{run_id}/output ──


@pytest.mark.asyncio
async def test_get_run_output(client, sample_run, sample_events):
    """Fetching output for a run returns summary of the last output event."""
    response = await client.get(f"/api/v1/runs/{sample_run.id}/output")
    assert response.status_code == 200
    data = response.json()
    assert "output" in data
    assert data["run_id"] == str(sample_run.id)
