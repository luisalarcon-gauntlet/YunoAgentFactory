"""Shared background workflow execution logic.

Used by both executions.py and runs.py routers to avoid duplication.
"""
import logging
import os
import uuid
from typing import Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.execution import WorkflowExecution
from app.services.openclaw_client import OpenClawWSClient
from app.services.orchestration import OrchestrationEngine
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


def get_openclaw_client() -> OpenClawWSClient:
    """Create an OpenClaw client from environment variables."""
    ws_url = os.environ.get("OPENCLAW_WS_URL", "ws://openclaw:18789")
    auth_token = os.environ.get("OPENCLAW_AUTH_TOKEN", "")
    if not auth_token:
        logger.warning("OPENCLAW_AUTH_TOKEN is not set — OpenClaw connections will fail")
    return OpenClawWSClient(ws_url=ws_url, auth_token=auth_token)


async def run_workflow_background(
    workflow_id: uuid.UUID,
    execution_id: uuid.UUID,
    initial_input: str,
    on_started: Callable[[AsyncSession, WorkflowExecution], Awaitable[None]] | None = None,
    on_completed: Callable[[AsyncSession, WorkflowExecution], Awaitable[None]] | None = None,
    on_failed: Callable[[AsyncSession, WorkflowExecution], Awaitable[None]] | None = None,
) -> None:
    """Run workflow in background task with its own DB session.

    Optional callbacks are invoked at lifecycle points (used by runs.py
    for Telegram notifications).
    """
    openclaw = get_openclaw_client()
    async with async_session_factory() as session:
        try:
            await openclaw.connect()

            if on_started:
                execution = await session.get(WorkflowExecution, execution_id)
                if execution:
                    await on_started(session, execution)

            engine = OrchestrationEngine(session, openclaw, ws_manager)
            await engine.run_workflow(
                workflow_id,
                initial_input=initial_input,
                execution_id=execution_id,
            )

            if on_completed or on_failed:
                execution = await session.get(WorkflowExecution, execution_id)
                if execution:
                    await session.refresh(execution)
                    if execution.status == "completed" and on_completed:
                        await on_completed(session, execution)
                    elif execution.status in ("failed", "timed_out") and on_failed:
                        await on_failed(session, execution)

        except Exception:
            logger.exception("Background workflow execution failed for %s", workflow_id)
            try:
                execution = await session.get(WorkflowExecution, execution_id)
                if execution and execution.status in ("pending", "running"):
                    execution.status = "failed"
                    execution.error_message = "Background task crashed unexpectedly"
                    await session.commit()
                    if on_failed:
                        await on_failed(session, execution)
            except Exception:
                logger.exception("Failed to mark execution %s as failed", execution_id)
        finally:
            await openclaw.disconnect()
