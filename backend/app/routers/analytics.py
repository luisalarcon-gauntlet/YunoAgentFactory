import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, cast, extract, func, select, String, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.workflow import Workflow
from app.schemas.analytics import (
    ErrorSummary,
    ExecutionsPerDay,
    OverviewMetrics,
    WorkflowPerformance,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

PERIOD_MAP = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    period: str = Query("7d", pattern="^(24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
) -> OverviewMetrics:
    try:
        delta = PERIOD_MAP[period]
        cutoff = datetime.now(timezone.utc) - delta

        result = await db.execute(
            select(
                func.count(WorkflowExecution.id).label("total"),
                func.count(
                    case((WorkflowExecution.status == "completed", WorkflowExecution.id))
                ).label("success_count"),
                func.count(
                    case((WorkflowExecution.status == "failed", WorkflowExecution.id))
                ).label("failure_count"),
                func.coalesce(
                    func.avg(
                        extract(
                            "epoch",
                            WorkflowExecution.completed_at - WorkflowExecution.started_at,
                        )
                    ),
                    0,
                ).label("avg_duration"),
            ).where(WorkflowExecution.created_at >= cutoff)
        )
        row = result.one()

        total = row.total or 0
        success = row.success_count or 0
        failure = row.failure_count or 0

        # Get token and cost totals from execution steps
        token_result = await db.execute(
            select(
                func.coalesce(func.sum(ExecutionStep.token_count), 0).label("tokens"),
                func.coalesce(func.sum(ExecutionStep.cost_usd), 0).label("cost"),
            ).join(
                WorkflowExecution,
                ExecutionStep.execution_id == WorkflowExecution.id,
            ).where(WorkflowExecution.created_at >= cutoff)
        )
        token_row = token_result.one()

        return OverviewMetrics(
            total_executions=total,
            success_count=success,
            success_rate=round(success / total * 100, 1) if total > 0 else 0.0,
            failure_count=failure,
            failure_rate=round(failure / total * 100, 1) if total > 0 else 0.0,
            avg_duration_seconds=round(float(row.avg_duration or 0), 1),
            total_tokens=int(token_row.tokens),
            total_cost_usd=token_row.cost,
        )
    except Exception:
        logger.exception("Failed to get analytics overview")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics overview")


@router.get("/executions-over-time", response_model=list[ExecutionsPerDay])
async def get_executions_over_time(
    db: AsyncSession = Depends(get_db),
) -> list[ExecutionsPerDay]:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)

        date_col = cast(func.date(WorkflowExecution.created_at), String)

        result = await db.execute(
            select(
                date_col.label("date"),
                func.count(WorkflowExecution.id).label("total"),
                func.count(
                    case((WorkflowExecution.status == "completed", WorkflowExecution.id))
                ).label("succeeded"),
                func.count(
                    case((WorkflowExecution.status == "failed", WorkflowExecution.id))
                ).label("failed"),
            )
            .where(WorkflowExecution.created_at >= cutoff)
            .group_by(func.date(WorkflowExecution.created_at))
            .order_by(func.date(WorkflowExecution.created_at))
        )
        rows = result.all()

        return [
            ExecutionsPerDay(
                date=row.date,
                total=row.total,
                succeeded=row.succeeded,
                failed=row.failed,
            )
            for row in rows
        ]
    except Exception:
        logger.exception("Failed to get executions over time")
        raise HTTPException(status_code=500, detail="Failed to retrieve executions over time")


@router.get("/errors", response_model=list[ErrorSummary])
async def get_errors(
    db: AsyncSession = Depends(get_db),
) -> list[ErrorSummary]:
    try:
        result = await db.execute(
            select(
                Workflow.name.label("workflow_name"),
                Agent.name.label("agent_name"),
                ExecutionStep.error_message.label("error_type"),
                func.count(ExecutionStep.id).label("count"),
                func.max(ExecutionStep.completed_at).label("last_occurred"),
            )
            .join(
                WorkflowExecution,
                ExecutionStep.execution_id == WorkflowExecution.id,
            )
            .join(Workflow, WorkflowExecution.workflow_id == Workflow.id)
            .join(Agent, ExecutionStep.agent_id == Agent.id)
            .where(ExecutionStep.status == "failed")
            .where(ExecutionStep.error_message.is_not(None))
            .group_by(Workflow.name, Agent.name, ExecutionStep.error_message)
            .order_by(func.count(ExecutionStep.id).desc())
            .limit(50)
        )
        rows = result.all()

        return [
            ErrorSummary(
                workflow_name=row.workflow_name,
                agent_name=row.agent_name,
                error_type=row.error_type,
                count=row.count,
                last_occurred=row.last_occurred,
            )
            for row in rows
        ]
    except Exception:
        logger.exception("Failed to get error summary")
        raise HTTPException(status_code=500, detail="Failed to retrieve error summary")


@router.get("/workflow-performance", response_model=list[WorkflowPerformance])
async def get_workflow_performance(
    db: AsyncSession = Depends(get_db),
) -> list[WorkflowPerformance]:
    try:
        total_col = func.count(WorkflowExecution.id)
        success_col = func.count(
            case((WorkflowExecution.status == "completed", WorkflowExecution.id))
        )

        result = await db.execute(
            select(
                Workflow.id.label("workflow_id"),
                Workflow.name.label("workflow_name"),
                total_col.label("total_runs"),
                case(
                    (total_col > 0, cast(success_col, Float) / cast(total_col, Float) * 100),
                    else_=0.0,
                ).label("success_rate"),
                func.coalesce(
                    func.avg(
                        extract(
                            "epoch",
                            WorkflowExecution.completed_at - WorkflowExecution.started_at,
                        )
                    ),
                    0,
                ).label("avg_duration"),
                func.max(WorkflowExecution.created_at).label("last_run"),
            )
            .join(WorkflowExecution, Workflow.id == WorkflowExecution.workflow_id)
            .where(Workflow.is_template.is_(False))
            .group_by(Workflow.id, Workflow.name)
            .order_by(total_col.desc())
        )
        rows = result.all()

        return [
            WorkflowPerformance(
                workflow_id=str(row.workflow_id),
                workflow_name=row.workflow_name,
                total_runs=row.total_runs,
                success_rate=round(float(row.success_rate), 1),
                avg_duration_seconds=round(float(row.avg_duration), 1),
                last_run=row.last_run,
            )
            for row in rows
        ]
    except Exception:
        logger.exception("Failed to get workflow performance")
        raise HTTPException(status_code=500, detail="Failed to retrieve workflow performance")
