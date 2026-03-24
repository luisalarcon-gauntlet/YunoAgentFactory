import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session_factory
from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.message import AgentMessage
from app.models.workflow import Workflow
from app.schemas.execution import (
    AgentMessageResponse,
    ExecutionCreate,
    ExecutionResponse,
    ExecutionStepResponse,
)
from app.services.openclaw_client import OpenClawWSClient
from app.services.orchestration import OrchestrationEngine
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/executions", tags=["executions"])


async def _run_workflow_background(
    workflow_id: uuid.UUID, initial_input: str
) -> None:
    """Run workflow in background task with its own DB session."""
    async with async_session_factory() as session:
        try:
            openclaw = OpenClawWSClient(ws_url="", auth_token="")
            engine = OrchestrationEngine(session, openclaw, ws_manager)
            await engine.run_workflow(workflow_id, initial_input=initial_input)
        except Exception:
            logger.exception("Background workflow execution failed for %s", workflow_id)


@router.get("", response_model=list[ExecutionResponse])
async def list_executions(
    db: AsyncSession = Depends(get_db),
) -> list[ExecutionResponse]:
    try:
        result = await db.execute(
            select(WorkflowExecution).order_by(WorkflowExecution.created_at.desc())
        )
        executions = result.scalars().all()

        responses = []
        for ex in executions:
            resp = ExecutionResponse.model_validate(ex)
            wf = await db.get(Workflow, ex.workflow_id)
            if wf:
                resp.workflow_name = wf.name
            responses.append(resp)
        return responses
    except Exception:
        logger.exception("Failed to list executions")
        raise HTTPException(status_code=500, detail="Failed to retrieve executions")


@router.post("", response_model=ExecutionResponse, status_code=201)
async def trigger_execution(
    payload: ExecutionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> ExecutionResponse:
    try:
        workflow = await db.get(Workflow, payload.workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        execution = WorkflowExecution(
            workflow_id=payload.workflow_id,
            status="pending",
            trigger_type="manual",
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        background_tasks.add_task(
            _run_workflow_background,
            payload.workflow_id,
            payload.input or "",
        )

        resp = ExecutionResponse.model_validate(execution)
        resp.workflow_name = workflow.name
        return resp
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to trigger execution")
        raise HTTPException(status_code=500, detail="Failed to trigger workflow execution")


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ExecutionResponse:
    try:
        execution = await db.get(WorkflowExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")
        resp = ExecutionResponse.model_validate(execution)
        wf = await db.get(Workflow, execution.workflow_id)
        if wf:
            resp.workflow_name = wf.name
        return resp
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get execution %s", execution_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve execution")


@router.get("/{execution_id}/steps", response_model=list[ExecutionStepResponse])
async def get_execution_steps(
    execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ExecutionStepResponse]:
    try:
        execution = await db.get(WorkflowExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        result = await db.execute(
            select(ExecutionStep)
            .where(ExecutionStep.execution_id == execution_id)
            .order_by(ExecutionStep.created_at)
        )
        steps = result.scalars().all()

        responses = []
        for step in steps:
            resp = ExecutionStepResponse.model_validate(step)
            agent = await db.get(Agent, step.agent_id)
            if agent:
                resp.agent_name = agent.name
            responses.append(resp)
        return responses
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get steps for execution %s", execution_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve execution steps")


@router.get("/{execution_id}/messages", response_model=list[AgentMessageResponse])
async def get_execution_messages(
    execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[AgentMessageResponse]:
    try:
        execution = await db.get(WorkflowExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        result = await db.execute(
            select(AgentMessage)
            .where(AgentMessage.execution_id == execution_id)
            .order_by(AgentMessage.created_at)
        )
        messages = result.scalars().all()

        responses = []
        for msg in messages:
            resp = AgentMessageResponse.model_validate(msg)
            if msg.from_agent_id:
                from_agent = await db.get(Agent, msg.from_agent_id)
                if from_agent:
                    resp.from_agent_name = from_agent.name
            if msg.to_agent_id:
                to_agent = await db.get(Agent, msg.to_agent_id)
                if to_agent:
                    resp.to_agent_name = to_agent.name
            responses.append(resp)
        return responses
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get messages for execution %s", execution_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve execution messages")


@router.post("/{execution_id}/cancel", status_code=200)
async def cancel_execution(
    execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        execution = await db.get(WorkflowExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")
        if execution.status not in ("pending", "running"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel execution with status '{execution.status}'",
            )
        execution.status = "cancelled"
        await db.commit()
        return {"status": "cancelled", "execution_id": str(execution_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to cancel execution %s", execution_id)
        raise HTTPException(status_code=500, detail="Failed to cancel execution")
