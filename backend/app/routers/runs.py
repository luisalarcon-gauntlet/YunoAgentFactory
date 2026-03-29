import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, get_db
from app.models.execution import AgentEvent, WorkflowExecution
from app.models.workflow import Workflow
from app.schemas.run import AgentEventResponse, RunCreate, RunOutputResponse, RunResponse
from app.services.openclaw_client import OpenClawWSClient
from app.services.orchestration import OrchestrationEngine
from app.services.telegram_commands import handle_command
from app.services.telegram_notify import notify_run_completed, notify_run_failed, notify_run_started
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])


def _get_openclaw_client() -> OpenClawWSClient:
    ws_url = os.environ.get("OPENCLAW_WS_URL", "ws://openclaw:18789")
    auth_token = os.environ.get("OPENCLAW_AUTH_TOKEN", "")
    return OpenClawWSClient(ws_url=ws_url, auth_token=auth_token)


async def _run_workflow_background(
    workflow_id: uuid.UUID, execution_id: uuid.UUID, initial_input: str
) -> None:
    openclaw = _get_openclaw_client()
    async with async_session_factory() as session:
        try:
            await openclaw.connect()

            # Send "started" notification
            execution = await session.get(WorkflowExecution, execution_id)
            if execution:
                await notify_run_started(session, execution)

            engine = OrchestrationEngine(session, openclaw, ws_manager)
            await engine.run_workflow(
                workflow_id,
                initial_input=initial_input,
                execution_id=execution_id,
            )

            # Refresh execution to get final status
            await session.refresh(execution)
            if execution.status == "completed":
                await notify_run_completed(session, execution)
            elif execution.status in ("failed", "timed_out"):
                await notify_run_failed(session, execution)

        except Exception:
            logger.exception("Background workflow execution failed for %s", workflow_id)
            try:
                execution = await session.get(WorkflowExecution, execution_id)
                if execution and execution.status in ("pending", "running"):
                    execution.status = "failed"
                    execution.error_message = "Background task crashed unexpectedly"
                    await session.commit()
                    await notify_run_failed(session, execution)
            except Exception:
                logger.exception("Failed to mark execution %s as failed", execution_id)
        finally:
            await openclaw.disconnect()


@router.post("", response_model=RunResponse, status_code=201)
async def create_run(
    payload: RunCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RunResponse:
    try:
        workflow = await db.get(Workflow, payload.workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        execution = WorkflowExecution(
            workflow_id=payload.workflow_id,
            status="pending",
            trigger_type="api",
            source=payload.source,
            source_metadata=payload.source_metadata or {},
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        background_tasks.add_task(
            _run_workflow_background,
            payload.workflow_id,
            execution.id,
            payload.inputs or "",
        )

        resp = RunResponse.model_validate(execution)
        resp.workflow_name = workflow.name
        return resp
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to create run")
        raise HTTPException(status_code=500, detail="Failed to create run")


@router.get("", response_model=list[RunResponse])
async def list_runs(
    workflow_id: uuid.UUID | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[RunResponse]:
    try:
        query = select(WorkflowExecution).order_by(WorkflowExecution.created_at.desc())
        if workflow_id:
            query = query.where(WorkflowExecution.workflow_id == workflow_id)
        query = query.limit(limit)

        result = await db.execute(query)
        executions = result.scalars().all()

        responses = []
        for ex in executions:
            resp = RunResponse.model_validate(ex)
            wf = await db.get(Workflow, ex.workflow_id)
            if wf:
                resp.workflow_name = wf.name
            responses.append(resp)
        return responses
    except Exception:
        logger.exception("Failed to list runs")
        raise HTTPException(status_code=500, detail="Failed to list runs")


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> RunResponse:
    try:
        execution = await db.get(WorkflowExecution, run_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Run not found")
        resp = RunResponse.model_validate(execution)
        wf = await db.get(Workflow, execution.workflow_id)
        if wf:
            resp.workflow_name = wf.name
        return resp
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get run %s", run_id)
        raise HTTPException(status_code=500, detail="Failed to get run")


@router.get("/{run_id}/events", response_model=list[AgentEventResponse])
async def get_run_events(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[AgentEventResponse]:
    try:
        execution = await db.get(WorkflowExecution, run_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Run not found")

        result = await db.execute(
            select(AgentEvent)
            .where(AgentEvent.run_id == run_id)
            .order_by(AgentEvent.timestamp)
        )
        events = result.scalars().all()
        return [AgentEventResponse.model_validate(e) for e in events]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get events for run %s", run_id)
        raise HTTPException(status_code=500, detail="Failed to get run events")


@router.get("/{run_id}/output", response_model=RunOutputResponse)
async def get_run_output(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> RunOutputResponse:
    try:
        execution = await db.get(WorkflowExecution, run_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Run not found")

        # Get the last "output" or "completed" event as summary
        result = await db.execute(
            select(AgentEvent)
            .where(AgentEvent.run_id == run_id)
            .where(AgentEvent.event_type.in_(["output", "completed"]))
            .order_by(AgentEvent.timestamp.desc())
            .limit(1)
        )
        last_event = result.scalar_one_or_none()
        output_text = last_event.message if last_event else ""

        return RunOutputResponse(
            run_id=run_id,
            status=execution.status,
            output=output_text,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get output for run %s", run_id)
        raise HTTPException(status_code=500, detail="Failed to get run output")


class TelegramCommandRequest(BaseModel):
    command: str
    chat_id: str | None = None


class TelegramCommandResponse(BaseModel):
    response: str


@router.post("/telegram/command", response_model=TelegramCommandResponse)
async def telegram_command(
    payload: TelegramCommandRequest,
    db: AsyncSession = Depends(get_db),
) -> TelegramCommandResponse:
    """Handle inbound Telegram commands routed through OpenClaw."""
    try:
        response_text = await handle_command(db, payload.command, chat_id=payload.chat_id)
        return TelegramCommandResponse(response=response_text)
    except Exception:
        logger.exception("Failed to handle Telegram command: %s", payload.command)
        raise HTTPException(status_code=500, detail="Failed to process command")
