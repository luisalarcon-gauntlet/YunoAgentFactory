"""Seed realistic historical execution data for the analytics dashboard.

Run via:  docker compose exec backend python -m app.seed_analytics
"""

import asyncio
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.workflow import Workflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEED_NOTE = "analytics-seed-data"

ERROR_MESSAGES = [
    "Agent timeout: no response within 120s",
    "OpenClaw connection refused",
    "Token limit exceeded (8192)",
    "Invalid tool call: shell not permitted",
    "Rate limited by upstream provider",
]

STATUSES_WEIGHTED = (
    ["completed"] * 70
    + ["failed"] * 15
    + ["cancelled"] * 8
    + ["timed_out"] * 7
)


async def seed_analytics_data(session: AsyncSession) -> None:
    # Check if seed data already exists
    existing = await session.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.source_metadata["seed_note"].astext == SEED_NOTE
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        logger.info("Analytics seed data already exists — skipping")
        return

    # Find existing workflows (non-template) and agents
    wf_result = await session.execute(
        select(Workflow).where(Workflow.is_template.is_(False))
    )
    workflows = list(wf_result.scalars().all())

    agent_result = await session.execute(select(Agent))
    agents = list(agent_result.scalars().all())

    if not workflows:
        logger.warning("No workflows found — creating a sample workflow")
        wf = Workflow(
            id=uuid.uuid4(),
            name="Dev Pipeline",
            description="Seeded workflow for analytics",
            is_template=False,
            graph={"nodes": [], "edges": []},
        )
        session.add(wf)
        workflows = [wf]

    if not agents:
        logger.warning("No agents found — creating sample agents")
        for name, role in [
            ("Coder", "Writes code"),
            ("Reviewer", "Reviews code"),
            ("Deployer", "Deploys code"),
        ]:
            a = Agent(
                id=uuid.uuid4(),
                name=name,
                role=role,
                system_prompt=f"You are a {role.lower()}.",
                model="claude-sonnet-4-20250514",
                tools=["shell"],
                channels=["webchat"],
            )
            session.add(a)
            agents.append(a)

    await session.flush()

    now = datetime.now(timezone.utc)
    total_created = 0

    for day_offset in range(14):
        day = now - timedelta(days=day_offset)
        # More recent days have more executions
        count = random.randint(3, 8) if day_offset < 5 else random.randint(1, 5)

        for _ in range(count):
            wf = random.choice(workflows)
            status = random.choice(STATUSES_WEIGHTED)

            # Randomize time within the day
            hour_offset = random.uniform(0, 23)
            started_at = day.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=hour_offset)

            duration_seconds = random.uniform(30, 300)
            completed_at = started_at + timedelta(seconds=duration_seconds) if status != "cancelled" else None

            error_msg = random.choice(ERROR_MESSAGES) if status == "failed" else None
            if status == "timed_out":
                error_msg = "Max iterations reached"

            execution = WorkflowExecution(
                id=uuid.uuid4(),
                workflow_id=wf.id,
                status=status,
                iteration_count=random.randint(1, 6),
                trigger_type="manual",
                source=random.choice(["web", "web", "telegram"]),
                source_metadata={"seed_note": SEED_NOTE},
                started_at=started_at,
                completed_at=completed_at,
                error_message=error_msg,
                created_at=started_at,
            )
            session.add(execution)
            await session.flush()

            # Create 1-3 execution steps per execution
            num_steps = random.randint(1, min(3, len(agents)))
            step_agents = random.sample(agents, num_steps)

            for i, agent in enumerate(step_agents):
                step_duration_ms = int(random.uniform(10000, 120000))
                step_started = started_at + timedelta(seconds=i * 30)
                step_completed = step_started + timedelta(milliseconds=step_duration_ms)

                step_status = "completed"
                step_error = None
                if status == "failed" and i == num_steps - 1:
                    step_status = "failed"
                    step_error = error_msg

                step = ExecutionStep(
                    id=uuid.uuid4(),
                    execution_id=execution.id,
                    node_id=f"node-{i+1}",
                    agent_id=agent.id,
                    status=step_status,
                    input_data=f"Step {i+1} input for {agent.name}",
                    output_data=f"Step {i+1} output from {agent.name}" if step_status == "completed" else None,
                    token_count=random.randint(200, 2000),
                    cost_usd=Decimal(str(round(random.uniform(0.001, 0.05), 6))),
                    duration_ms=step_duration_ms,
                    started_at=step_started,
                    completed_at=step_completed,
                    error_message=step_error,
                    created_at=step_started,
                )
                session.add(step)

            total_created += 1

    await session.commit()
    logger.info("Seeded %d execution records across 14 days", total_created)


async def main() -> None:
    async with async_session_factory() as session:
        await seed_analytics_data(session)


if __name__ == "__main__":
    asyncio.run(main())
