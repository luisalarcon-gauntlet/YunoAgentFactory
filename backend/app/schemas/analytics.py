from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class OverviewMetrics(BaseModel):
    total_executions: int
    success_count: int
    success_rate: float
    failure_count: int
    failure_rate: float
    avg_duration_seconds: float
    total_tokens: int
    total_cost_usd: Decimal


class ExecutionsPerDay(BaseModel):
    date: str
    total: int
    succeeded: int
    failed: int


class ErrorSummary(BaseModel):
    workflow_name: str
    agent_name: str
    error_type: str
    count: int
    last_occurred: datetime


class WorkflowPerformance(BaseModel):
    workflow_id: str
    workflow_name: str
    total_runs: int
    success_rate: float
    avg_duration_seconds: float
    last_run: datetime | None
