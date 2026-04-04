import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
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
from app.services.workflow_runner import get_openclaw_client, run_workflow_background

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1/executions", tags=["executions"])

# Debug router for OpenClaw connectivity
debug_router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


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
@limiter.limit("10/minute")
async def trigger_execution(
    request: Request,
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
            run_workflow_background,
            payload.workflow_id,
            execution.id,
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


@router.delete("/{execution_id}", status_code=204)
async def delete_execution(
    execution_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Response:
    try:
        execution = await db.get(WorkflowExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")
        if execution.status == "running":
            raise HTTPException(
                status_code=400,
                detail="Cannot delete a running execution — cancel it first",
            )
        await db.delete(execution)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete execution %s", execution_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete execution")


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


# ── Debug endpoints ──

_debug_enabled = os.environ.get("DEBUG_ENDPOINTS_ENABLED", "false").lower() == "true"


@debug_router.get("/openclaw-status")
async def openclaw_status() -> dict:
    if not _debug_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    """Check connectivity to the OpenClaw gateway.

    Performs full protocol handshake and a test RPC call.
    """
    client = get_openclaw_client()
    try:
        result = await client.check_connection()
        return result
    finally:
        await client.disconnect()


@debug_router.get("/openclaw")
async def openclaw_debug() -> dict:
    """Detailed OpenClaw debug: handshake, RPC test, and session key format."""
    if not _debug_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    client = get_openclaw_client()
    steps: list[dict] = []

    try:
        # Step 1: Connect and handshake
        await client.connect()
        steps.append({
            "step": "handshake",
            "ok": True,
            "protocol": client._hello.get("protocol") if client._hello else None,
            "server": client._hello.get("server") if client._hello else None,
        })
    except Exception as e:
        steps.append({"step": "handshake", "ok": False, "error": str(e)})
        return {"steps": steps, "overall": "failed"}

    try:
        # Step 2: Test read-only RPC
        status = await client._rpc("status", timeout=10)
        steps.append({"step": "rpc_status", "ok": True, "payload": status})
    except Exception as e:
        steps.append({"step": "rpc_status", "ok": False, "error": str(e)})

    try:
        # Step 3: List sessions
        sessions = await client._rpc("sessions.list", timeout=10)
        steps.append({"step": "rpc_sessions_list", "ok": True, "payload": sessions})
    except Exception as e:
        steps.append({"step": "rpc_sessions_list", "ok": False, "error": str(e)})

    try:
        # Step 4: List agents
        agents = await client._rpc("agents.list", timeout=10)
        steps.append({"step": "rpc_agents_list", "ok": True, "payload": agents})
    except Exception as e:
        steps.append({"step": "rpc_agents_list", "ok": False, "error": str(e)})

    # Step 5: Show session key format
    steps.append({
        "step": "session_key_format",
        "example": client.build_session_key("test-agent"),
        "note": "Sessions are created implicitly on first message",
    })

    await client.disconnect()

    overall = "ok" if all(s.get("ok", True) for s in steps) else "partial"
    return {"steps": steps, "overall": overall}
