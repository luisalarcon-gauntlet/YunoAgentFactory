"""Telegram notification service.

Sends run lifecycle messages directly via the Telegram Bot API (sendMessage).
Falls back gracefully if TELEGRAM_BOT_TOKEN or chat ID is not configured.
"""
import logging
import os

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution import WorkflowExecution
from app.models.notification import NotificationPreference
from app.models.workflow import Workflow

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


def _format_duration(started_at, completed_at) -> str:
    if not started_at or not completed_at:
        return "N/A"
    delta = completed_at - started_at
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    remaining = seconds % 60
    return f"{minutes}m {remaining}s"


def _get_chat_id(run: WorkflowExecution) -> str | None:
    """Extract telegram_chat_id from run source_metadata or env fallback."""
    if run.source_metadata:
        chat_id = run.source_metadata.get("telegram_chat_id")
        if chat_id:
            return str(chat_id)
    return os.environ.get("TELEGRAM_DEFAULT_CHAT_ID")


async def _send_telegram(chat_id: str, text: str) -> None:
    """Send a message via the Telegram Bot API."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping notification")
        return

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{TELEGRAM_API_BASE}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            if resp.status_code != 200:
                logger.error(
                    "Telegram sendMessage failed: %d %s", resp.status_code, resp.text[:300]
                )
    except Exception:
        logger.exception("Failed to send Telegram notification")


async def notify_run_started(
    db: AsyncSession,
    run: WorkflowExecution,
) -> None:
    """Send a 'run started' notification to Telegram."""
    chat_id = _get_chat_id(run)
    if not chat_id:
        return

    workflow = await db.get(Workflow, run.workflow_id)
    workflow_name = workflow.name if workflow else "Unknown"

    text = (
        f"<b>Workflow Started</b>\n"
        f"Run: <code>{str(run.id)[:8]}</code>\n"
        f"Template: {workflow_name}\n"
        f"Source: {run.source}"
    )
    await _send_telegram(chat_id, text)


async def notify_run_completed(
    db: AsyncSession,
    run: WorkflowExecution,
) -> None:
    """Send a 'run completed' notification to Telegram."""
    chat_id = _get_chat_id(run)
    if not chat_id:
        return

    workflow = await db.get(Workflow, run.workflow_id)
    workflow_name = workflow.name if workflow else "Unknown"
    duration = _format_duration(run.started_at, run.completed_at)

    text = (
        f"<b>Workflow Completed</b>\n"
        f"Run: <code>{str(run.id)[:8]}</code>\n"
        f"Template: {workflow_name}\n"
        f"Duration: {duration}\n"
        f"Iterations: {run.iteration_count}"
    )
    await _send_telegram(chat_id, text)


async def notify_run_failed(
    db: AsyncSession,
    run: WorkflowExecution,
) -> None:
    """Send a 'run failed' notification to Telegram."""
    chat_id = _get_chat_id(run)
    if not chat_id:
        return

    workflow = await db.get(Workflow, run.workflow_id)
    workflow_name = workflow.name if workflow else "Unknown"
    error_msg = run.error_message or "Unknown error"

    text = (
        f"<b>Workflow Failed</b>\n"
        f"Run: <code>{str(run.id)[:8]}</code>\n"
        f"Template: {workflow_name}\n"
        f"Error: {error_msg[:500]}"
    )
    await _send_telegram(chat_id, text)
