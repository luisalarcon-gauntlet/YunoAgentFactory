import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio

from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.workflow import Workflow


@pytest_asyncio.fixture
async def analytics_seed(db_session):
    """Seed the database with realistic execution data for analytics tests."""
    now = datetime.now(timezone.utc)

    # Create a workflow
    workflow = Workflow(
        id=uuid.uuid4(),
        name="Test Pipeline",
        description="Test workflow for analytics",
        is_template=False,
        graph={"nodes": [], "edges": []},
    )
    db_session.add(workflow)

    # Create an agent
    agent = Agent(
        id=uuid.uuid4(),
        name="Test Coder",
        role="Writes code",
        system_prompt="You are a coder.",
        model="claude-sonnet-4-20250514",
        tools=["shell"],
        channels=["webchat"],
    )
    db_session.add(agent)
    await db_session.flush()

    executions = []
    steps = []

    # 5 completed executions across different days
    for i in range(5):
        started = now - timedelta(days=i + 1, hours=2)
        completed = started + timedelta(seconds=90 + i * 30)
        ex = WorkflowExecution(
            id=uuid.uuid4(),
            workflow_id=workflow.id,
            status="completed",
            started_at=started,
            completed_at=completed,
            created_at=started,
        )
        db_session.add(ex)
        executions.append(ex)
        await db_session.flush()

        step = ExecutionStep(
            id=uuid.uuid4(),
            execution_id=ex.id,
            node_id="node-1",
            agent_id=agent.id,
            status="completed",
            token_count=500 + i * 100,
            cost_usd=Decimal("0.005") + Decimal("0.001") * i,
            duration_ms=(90 + i * 30) * 1000,
            started_at=started,
            completed_at=completed,
            created_at=started,
        )
        db_session.add(step)
        steps.append(step)

    # 2 failed executions
    for i in range(2):
        started = now - timedelta(days=i + 1, hours=5)
        completed = started + timedelta(seconds=30)
        ex = WorkflowExecution(
            id=uuid.uuid4(),
            workflow_id=workflow.id,
            status="failed",
            started_at=started,
            completed_at=completed,
            error_message="Agent timeout",
            created_at=started,
        )
        db_session.add(ex)
        executions.append(ex)
        await db_session.flush()

        step = ExecutionStep(
            id=uuid.uuid4(),
            execution_id=ex.id,
            node_id="node-1",
            agent_id=agent.id,
            status="failed",
            error_message="Agent timeout",
            token_count=100,
            cost_usd=Decimal("0.001"),
            duration_ms=30000,
            started_at=started,
            completed_at=completed,
            created_at=started,
        )
        db_session.add(step)

    await db_session.commit()

    return {
        "workflow": workflow,
        "agent": agent,
        "executions": executions,
    }


@pytest.mark.asyncio
async def test_overview_returns_metrics(client, db_session, analytics_seed):
    response = await client.get("/api/v1/analytics/overview?period=7d")
    assert response.status_code == 200
    data = response.json()

    assert data["total_executions"] == 7
    assert data["success_count"] == 5
    assert data["failure_count"] == 2
    assert data["success_rate"] == pytest.approx(71.4, abs=0.1)
    assert data["failure_rate"] == pytest.approx(28.6, abs=0.1)
    assert data["avg_duration_seconds"] > 0
    assert data["total_tokens"] > 0
    assert float(data["total_cost_usd"]) > 0


@pytest.mark.asyncio
async def test_overview_empty_database(client, db_session):
    response = await client.get("/api/v1/analytics/overview?period=24h")
    assert response.status_code == 200
    data = response.json()

    assert data["total_executions"] == 0
    assert data["success_count"] == 0
    assert data["success_rate"] == 0.0
    assert data["failure_rate"] == 0.0
    assert data["total_tokens"] == 0


@pytest.mark.asyncio
async def test_overview_invalid_period(client, db_session):
    response = await client.get("/api/v1/analytics/overview?period=99d")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_executions_over_time(client, db_session, analytics_seed):
    response = await client.get("/api/v1/analytics/executions-over-time")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    assert len(data) > 0

    # Each entry has the expected shape
    for entry in data:
        assert "date" in entry
        assert "total" in entry
        assert "succeeded" in entry
        assert "failed" in entry
        assert entry["total"] >= entry["succeeded"] + entry["failed"]


@pytest.mark.asyncio
async def test_executions_over_time_empty(client, db_session):
    response = await client.get("/api/v1/analytics/executions-over-time")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_errors_endpoint(client, db_session, analytics_seed):
    response = await client.get("/api/v1/analytics/errors")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    assert len(data) > 0

    first = data[0]
    assert first["workflow_name"] == "Test Pipeline"
    assert first["agent_name"] == "Test Coder"
    assert first["error_type"] == "Agent timeout"
    assert first["count"] == 2
    assert "last_occurred" in first


@pytest.mark.asyncio
async def test_errors_empty(client, db_session):
    response = await client.get("/api/v1/analytics/errors")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_workflow_performance(client, db_session, analytics_seed):
    response = await client.get("/api/v1/analytics/workflow-performance")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 1

    wf = data[0]
    assert wf["workflow_name"] == "Test Pipeline"
    assert wf["total_runs"] == 7
    assert wf["success_rate"] == pytest.approx(71.4, abs=0.1)
    assert wf["avg_duration_seconds"] > 0
    assert wf["last_run"] is not None


@pytest.mark.asyncio
async def test_workflow_performance_empty(client, db_session):
    response = await client.get("/api/v1/analytics/workflow-performance")
    assert response.status_code == 200
    assert response.json() == []
