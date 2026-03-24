"""End-to-end integration test: clone dev pipeline template, execute workflow,
verify execution status, steps, and agent message trail."""

import uuid

from sqlalchemy import select

from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.message import AgentMessage
from app.models.workflow import Workflow
from app.seed import (
    DEV_CODER_ID,
    DEV_DEPLOYER_ID,
    DEV_PIPELINE_NAME,
    DEV_REVIEWER_ID,
    _dev_pipeline_agents,
    _dev_pipeline_workflow,
)
from app.services.openclaw_client import AgentResponse
from app.services.orchestration import OrchestrationEngine


async def _seed_dev_pipeline(db_session) -> Workflow:
    """Insert dev pipeline agents and template into the test DB."""
    for agent in _dev_pipeline_agents():
        if not await db_session.get(Agent, agent.id):
            db_session.add(agent)
    template = _dev_pipeline_workflow()
    db_session.add(template)
    await db_session.flush()
    return template


async def _clone_template(db_session, template: Workflow) -> Workflow:
    """Clone a template into a runnable workflow (mirrors the API clone endpoint)."""
    clone = Workflow(
        id=uuid.uuid4(),
        name=f"{template.name} (Copy)",
        description=template.description,
        graph=template.graph,
        is_template=False,
        max_iterations=template.max_iterations,
        timeout_seconds=template.timeout_seconds,
    )
    db_session.add(clone)
    await db_session.flush()
    return clone


async def test_e2e_dev_pipeline_rejected_then_approved(
    db_session, mock_openclaw, mock_ws_manager
):
    """Full E2E: seed template → clone → execute with reject/approve cycle → verify."""

    # 1. Seed the dev pipeline template and clone it
    template = await _seed_dev_pipeline(db_session)
    workflow = await _clone_template(db_session, template)

    assert workflow.is_template is False
    assert DEV_PIPELINE_NAME in template.name

    # 2. Set up mock OpenClaw responses:
    #    Coder writes → Reviewer REJECTS → Coder revises → Reviewer APPROVES → Deployer deploys
    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(
            text="def validate_email(email):\n    return '@' in email",
            token_count=150,
            cost_usd=0.015,
        ),
        AgentResponse(
            text="REJECTED: Missing regex validation, no domain check, no edge case handling.",
            token_count=100,
            cost_usd=0.010,
        ),
        AgentResponse(
            text=(
                "import re\n\n"
                "def validate_email(email: str) -> bool:\n"
                "    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'\n"
                "    return bool(re.match(pattern, email))"
            ),
            token_count=200,
            cost_usd=0.020,
        ),
        AgentResponse(
            text="APPROVED: Good regex pattern, handles edge cases, well-typed.",
            token_count=80,
            cost_usd=0.008,
        ),
        AgentResponse(
            text="Deployed successfully. Email validator is live in production.",
            token_count=60,
            cost_usd=0.006,
        ),
    ]

    # 3. Run the orchestration engine
    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(
        workflow.id,
        initial_input="Write a Python function that validates email addresses using regex.",
    )

    # 4. Verify execution completed
    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution is not None
    assert execution.status == "completed"
    assert execution.error_message is None
    assert execution.completed_at is not None

    # 5. Verify correct number of steps (5: Coder, Reviewer, Coder, Reviewer, Deployer)
    result = await db_session.execute(
        select(ExecutionStep)
        .where(ExecutionStep.execution_id == execution_id)
        .order_by(ExecutionStep.created_at)
    )
    steps = result.scalars().all()
    assert len(steps) == 5

    # Verify step sequence by agent ID
    expected_agent_sequence = [
        DEV_CODER_ID,     # 1. Coder writes
        DEV_REVIEWER_ID,  # 2. Reviewer rejects
        DEV_CODER_ID,     # 3. Coder revises
        DEV_REVIEWER_ID,  # 4. Reviewer approves
        DEV_DEPLOYER_ID,  # 5. Deployer deploys
    ]
    actual_agent_sequence = [step.agent_id for step in steps]
    assert actual_agent_sequence == expected_agent_sequence

    # All steps completed
    assert all(s.status == "completed" for s in steps)

    # Step data is populated
    for step in steps:
        assert step.output_data is not None
        assert step.token_count > 0
        assert step.cost_usd > 0
        assert step.duration_ms is not None

    # 6. Verify agent message trail
    msg_result = await db_session.execute(
        select(AgentMessage)
        .where(AgentMessage.execution_id == execution_id)
        .order_by(AgentMessage.created_at)
    )
    messages = msg_result.scalars().all()

    # Each step produces at least one message (task_output from the agent),
    # plus handoff messages to the next agent
    assert len(messages) >= 5

    # Verify messages are in chronological order
    for i in range(1, len(messages)):
        assert messages[i].created_at >= messages[i - 1].created_at

    # Verify the rejection message exists in the trail
    rejection_msgs = [m for m in messages if "REJECTED" in m.content]
    assert len(rejection_msgs) >= 1

    # Verify the approval message exists in the trail
    approval_msgs = [m for m in messages if "APPROVED" in m.content]
    assert len(approval_msgs) >= 1

    # Verify deployment message exists
    deploy_msgs = [m for m in messages if "Deployed" in m.content]
    assert len(deploy_msgs) >= 1

    # 7. Verify iteration count reflects the feedback loop
    assert execution.iteration_count == 5

    # 8. Verify mock OpenClaw was called exactly 5 times
    assert mock_openclaw.send_and_wait.call_count == 5

    # 9. Verify WebSocket events were broadcast
    broadcast_calls = mock_ws_manager.broadcast.call_args_list
    event_types = [call.args[0]["type"] for call in broadcast_calls]
    assert "execution.started" in event_types
    assert "execution.completed" in event_types
    assert event_types.count("step.started") == 5
    assert event_types.count("step.completed") == 5


async def test_e2e_dev_pipeline_immediate_approval(
    db_session, mock_openclaw, mock_ws_manager
):
    """Simpler path: Coder writes, Reviewer approves immediately, Deployer deploys."""

    template = await _seed_dev_pipeline(db_session)
    workflow = await _clone_template(db_session, template)

    mock_openclaw.send_and_wait.side_effect = [
        AgentResponse(text="Here is the code", token_count=100, cost_usd=0.01),
        AgentResponse(text="APPROVED: Code looks great", token_count=50, cost_usd=0.005),
        AgentResponse(text="Deployed to production", token_count=30, cost_usd=0.003),
    ]

    engine = OrchestrationEngine(db_session, mock_openclaw, mock_ws_manager)
    execution_id = await engine.run_workflow(workflow.id, initial_input="Build a calculator")

    execution = await db_session.get(WorkflowExecution, execution_id)
    assert execution.status == "completed"
    assert execution.iteration_count == 3

    result = await db_session.execute(
        select(ExecutionStep)
        .where(ExecutionStep.execution_id == execution_id)
        .order_by(ExecutionStep.created_at)
    )
    steps = result.scalars().all()
    assert len(steps) == 3
    assert [s.agent_id for s in steps] == [DEV_CODER_ID, DEV_REVIEWER_ID, DEV_DEPLOYER_ID]
