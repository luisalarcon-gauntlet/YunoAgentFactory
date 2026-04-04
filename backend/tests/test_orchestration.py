import uuid
from unittest.mock import AsyncMock

from app.models.agent import Agent
from app.models.workflow import Workflow
from app.models.execution import WorkflowExecution, ExecutionStep
from app.models.message import AgentMessage
from app.services.openclaw_client import AgentResponse


def _make_agent(db_session, name="Test Agent", agent_id=None):
    agent = Agent(
        id=agent_id or uuid.uuid4(),
        name=name,
        role=f"{name} role",
        system_prompt=f"You are {name}.",
        model="claude-sonnet-4-20250514",
        tools=["shell"],
        channels=["webchat"],
        memory={},
        skills=[],
        interaction_rules={},
        guardrails={},
        openclaw_session_key=f"session-{name.lower().replace(' ', '-')}",
    )
    db_session.add(agent)
    return agent


def _make_linear_workflow(db_session, agent_ids):
    """A->B->C linear workflow."""
    nodes = [
        {"id": f"node-{i+1}", "type": "agentNode", "position": {"x": i * 300, "y": 200},
         "data": {"agent_id": str(aid), "label": f"Agent {i+1}", "config": {"task_instruction": f"Do step {i+1}"}}}
        for i, aid in enumerate(agent_ids)
    ]
    edges = [
        {"id": f"e{i+1}-{i+2}", "source": f"node-{i+1}", "target": f"node-{i+2}",
         "data": {"condition": "always", "label": "Next"}}
        for i in range(len(agent_ids) - 1)
    ]
    wf = Workflow(
        id=uuid.uuid4(),
        name="Linear Test",
        graph={"nodes": nodes, "edges": edges},
        max_iterations=10,
        timeout_seconds=300,
    )
    db_session.add(wf)
    return wf


def _make_feedback_workflow(db_session, coder_id, reviewer_id, deployer_id):
    """Coder->Reviewer, approved->Deployer, rejected->Coder."""
    nodes = [
        {"id": "node-coder", "type": "agentNode", "position": {"x": 100, "y": 200},
         "data": {"agent_id": str(coder_id), "label": "Coder", "config": {"task_instruction": "Write code"}}},
        {"id": "node-reviewer", "type": "agentNode", "position": {"x": 400, "y": 200},
         "data": {"agent_id": str(reviewer_id), "label": "Reviewer", "config": {"task_instruction": "Review code"}}},
        {"id": "node-deployer", "type": "agentNode", "position": {"x": 700, "y": 200},
         "data": {"agent_id": str(deployer_id), "label": "Deployer", "config": {"task_instruction": "Deploy code"}}},
    ]
    edges = [
        {"id": "e-code-review", "source": "node-coder", "target": "node-reviewer",
         "data": {"condition": "always", "label": "Submit for review"}},
        {"id": "e-approved", "source": "node-reviewer", "target": "node-deployer",
         "data": {"condition": "approved", "label": "Approved"}},
        {"id": "e-rejected", "source": "node-reviewer", "target": "node-coder",
         "data": {"condition": "rejected", "label": "Rejected"}},
    ]
    wf = Workflow(
        id=uuid.uuid4(),
        name="Feedback Loop Test",
        graph={"nodes": nodes, "edges": edges},
        max_iterations=10,
        timeout_seconds=300,
    )
    db_session.add(wf)
    return wf


async def test_linear_workflow_execution(db_session, mock_openclaw, mock_ws_manager):
    """A->B->C workflow should execute all three agents in order."""
    from app.services.orchestration import OrchestrationEngine

    agents = [_make_agent(db_session, f"Agent {i}") for i in range(3)]
    await db_session.flush()
    wf = _make_linear_workflow(db_session, [a.id for a in agents])
    await db_session.flush()

    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="Output from A", token_count=100, cost_usd=0.01),
        AgentResponse(text="Output from B", token_count=50, cost_usd=0.005),
        AgentResponse(text="Output from C", token_count=30, cost_usd=0.003),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(wf.id, initial_input="Build a todo app")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "completed"

    from sqlalchemy import select
    result = await db_session.execute(
        select(ExecutionStep).where(ExecutionStep.execution_id == execution_id)
    )
    steps = result.scalars().all()
    assert len(steps) == 3
    assert all(s.status == "completed" for s in steps)


async def test_feedback_loop_workflow(db_session, mock_openclaw, mock_ws_manager):
    """Reviewer rejects, loops back to Coder, then approves, Deployer runs."""
    from app.services.orchestration import OrchestrationEngine

    coder = _make_agent(db_session, "Coder")
    reviewer = _make_agent(db_session, "Reviewer")
    deployer = _make_agent(db_session, "Deployer")
    await db_session.flush()

    wf = _make_feedback_workflow(db_session, coder.id, reviewer.id, deployer.id)
    await db_session.flush()

    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="First attempt code", token_count=100, cost_usd=0.01),
        AgentResponse(text="REJECTED: Missing error handling", token_count=80, cost_usd=0.008),
        AgentResponse(text="Revised code with error handling", token_count=120, cost_usd=0.012),
        AgentResponse(text="APPROVED: Looks great now", token_count=50, cost_usd=0.005),
        AgentResponse(text="Deployed successfully", token_count=30, cost_usd=0.003),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(wf.id, initial_input="Build email validator")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "completed"
    assert execution.iteration_count >= 4


async def test_max_iterations_safety(db_session, mock_openclaw, mock_ws_manager):
    """Workflow that always rejects should stop at max_iterations."""
    from app.services.orchestration import OrchestrationEngine

    coder = _make_agent(db_session, "Coder")
    reviewer = _make_agent(db_session, "Reviewer")
    deployer = _make_agent(db_session, "Deployer")
    await db_session.flush()

    wf = _make_feedback_workflow(db_session, coder.id, reviewer.id, deployer.id)
    wf.max_iterations = 5
    await db_session.flush()

    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="Code attempt", token_count=50, cost_usd=0.005),
        AgentResponse(text="REJECTED: Still not right", token_count=50, cost_usd=0.005),
    ] * 10  # Enough to loop many times

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(wf.id, initial_input="Impossible task")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "timed_out"
    assert "max iterations" in execution.error_message.lower()


async def test_cooperative_cancellation(db_session, mock_openclaw, mock_ws_manager):
    """Cancelling an execution should prevent subsequent steps from running."""
    from app.services.orchestration import OrchestrationEngine

    agents = [_make_agent(db_session, f"Agent {i}") for i in range(3)]
    await db_session.flush()
    wf = _make_linear_workflow(db_session, [a.id for a in agents])
    await db_session.flush()

    call_count = 0

    async def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # After first step completes, cancel the execution
            # (simulates external cancel while engine is running)
            from sqlalchemy import select
            result = await db_session.execute(
                select(WorkflowExecution).where(WorkflowExecution.workflow_id == wf.id)
            )
            execution = result.scalars().first()
            if execution:
                execution.status = "cancelled"
                await db_session.flush()
        return AgentResponse(text=f"Output {call_count}", token_count=50, cost_usd=0.005)

    mock_openclaw.send_and_wait.side_effect = side_effect

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(wf.id, initial_input="Test cancel")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "cancelled"
    # Only 1 step should have executed (the second step sees cancelled status)
    assert mock_openclaw.send_and_wait.call_count == 1


async def test_guardrail_token_limit(db_session, mock_openclaw, mock_ws_manager):
    """Execution should stop when agent's token guardrail is exceeded."""
    from app.services.orchestration import OrchestrationEngine

    agent = Agent(
        id=uuid.uuid4(),
        name="Limited Agent",
        role="Test guardrails",
        system_prompt="You test limits.",
        model="claude-sonnet-4-20250514",
        tools=[],
        channels=[],
        memory={},
        skills=[],
        interaction_rules={},
        guardrails={"max_tokens": 100},
        openclaw_session_key="session-limited",
    )
    db_session.add(agent)

    # Two-step workflow with same agent
    nodes = [
        {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
         "data": {"agent_id": str(agent.id), "label": "Step 1", "config": {"task_instruction": "Do step 1"}}},
        {"id": "node-2", "type": "agentNode", "position": {"x": 300, "y": 0},
         "data": {"agent_id": str(agent.id), "label": "Step 2", "config": {"task_instruction": "Do step 2"}}},
    ]
    edges = [
        {"id": "e1-2", "source": "node-1", "target": "node-2", "data": {"condition": "always", "label": "Next"}},
    ]
    wf = Workflow(id=uuid.uuid4(), name="Guardrail Test", graph={"nodes": nodes, "edges": edges},
                  max_iterations=10, timeout_seconds=300)
    db_session.add(wf)
    await db_session.flush()

    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="First output", token_count=150, cost_usd=0.01),
        AgentResponse(text="Should not run", token_count=50, cost_usd=0.005),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(wf.id, initial_input="Test limits")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "failed"
    assert "token limit exceeded" in execution.error_message.lower()
    # Only 1 call — second step was blocked by guardrail
    assert mock_openclaw.send_and_wait.call_count == 1


async def test_model_passed_to_openclaw(db_session, mock_openclaw, mock_ws_manager):
    """Agent's configured model should be passed through to the OpenClaw API call."""
    from app.services.orchestration import OrchestrationEngine

    agent = Agent(
        id=uuid.uuid4(),
        name="Haiku Agent",
        role="Test model selection",
        system_prompt="You test models.",
        model="claude-haiku-4-20250514",
        tools=[],
        channels=[],
        memory={},
        skills=[],
        interaction_rules={},
        guardrails={},
        openclaw_session_key="session-haiku-agent",
    )
    db_session.add(agent)

    wf = Workflow(
        id=uuid.uuid4(),
        name="Model Test",
        graph={
            "nodes": [
                {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
                 "data": {"agent_id": str(agent.id), "label": "Haiku Agent",
                          "config": {"task_instruction": "Test task"}}}
            ],
            "edges": [],
        },
        max_iterations=10,
        timeout_seconds=300,
    )
    db_session.add(wf)
    await db_session.flush()

    mock_openclaw.send_and_wait.return_value = AgentResponse(
        text="Done", token_count=50, cost_usd=0.001,
    )

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    await engine.run_workflow(wf.id, initial_input="Test input")

    # Verify the model was passed to send_and_wait
    mock_openclaw.send_and_wait.assert_called_once()
    call_kwargs = mock_openclaw.send_and_wait.call_args
    assert call_kwargs.kwargs.get("model") == "claude-haiku-4-20250514"
