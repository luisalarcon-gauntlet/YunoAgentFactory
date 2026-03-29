"""Telegram command handler.

Parses inbound commands from Telegram and routes them
to the appropriate backend API logic.

Supported commands:
  /run <template_name> [input]  - Run a workflow template
  /templates                     - List available templates
  /status {run_id}               - Get current status of a run
  /output {run_id}               - Get final output summary of a run
  /runs                          - List recent runs
  /help                          - Show available commands
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution import AgentEvent, WorkflowExecution
from app.models.workflow import Workflow

logger = logging.getLogger(__name__)


def _format_duration(started_at: datetime | None, completed_at: datetime | None) -> str:
    if not started_at:
        return "N/A"
    end = completed_at or datetime.now(timezone.utc)
    delta = end - started_at
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s"
    return f"{seconds // 60}m {seconds % 60}s"


async def handle_command(db: AsyncSession, command: str, chat_id: str | None = None) -> str:
    """Parse and execute a Telegram command. Returns a response string."""
    parts = command.strip().split(maxsplit=1)
    cmd = parts[0].lower() if parts else ""
    arg = parts[1].strip() if len(parts) > 1 else ""

    if cmd == "/status":
        return await _handle_status(db, arg)
    elif cmd == "/output":
        return await _handle_output(db, arg)
    elif cmd == "/runs":
        return await _handle_runs(db)
    elif cmd == "/templates":
        return await _handle_templates(db)
    elif cmd == "/run":
        return await _handle_run(db, arg, chat_id)
    elif cmd == "/help" or cmd == "/start":
        return _handle_help()
    else:
        return _handle_help()


def _handle_help() -> str:
    return (
        "<b>Yuno Agent Platform</b>\n\n"
        "<b>Commands:</b>\n"
        "/templates - List available workflow templates\n"
        "/run &lt;name&gt; [input] - Run a template\n"
        "/runs - List recent runs\n"
        "/status &lt;run_id&gt; - Check run status\n"
        "/output &lt;run_id&gt; - Get run output\n"
        "/help - Show this help"
    )


async def _handle_templates(db: AsyncSession) -> str:
    result = await db.execute(
        select(Workflow).where(Workflow.is_template == True).order_by(Workflow.name)
    )
    templates = result.scalars().all()

    if not templates:
        return "No templates available."

    lines = ["<b>Available Templates:</b>\n"]
    for t in templates:
        desc = t.description[:60] + "..." if t.description and len(t.description) > 60 else (t.description or "")
        lines.append(f"  <code>{t.name}</code>\n  {desc}\n")

    lines.append("\nUse: /run &lt;template_name&gt; [your input]")
    return "\n".join(lines)


async def _handle_run(db: AsyncSession, arg: str, chat_id: str | None = None) -> str:
    """Start a workflow run from a template name.

    Format: /run <template_name> [optional input text]
    """
    if not arg:
        return "Usage: /run &lt;template_name&gt; [input]\n\nUse /templates to see available templates."

    # Split into template name and optional input
    parts = arg.split(maxsplit=1)
    template_query = parts[0]
    initial_input = parts[1] if len(parts) > 1 else ""

    # Find template by name (case-insensitive partial match)
    result = await db.execute(
        select(Workflow).where(Workflow.is_template == True)
    )
    templates = result.scalars().all()

    # Exact match first, then partial
    match = None
    for t in templates:
        if t.name.lower() == template_query.lower():
            match = t
            break
    if not match:
        for t in templates:
            if template_query.lower() in t.name.lower():
                match = t
                break

    if not match:
        available = ", ".join(f"<code>{t.name}</code>" for t in templates)
        return f"Template not found: <code>{template_query}</code>\n\nAvailable: {available}"

    # Create the execution record
    source_metadata = {}
    if chat_id:
        source_metadata["telegram_chat_id"] = chat_id

    execution = WorkflowExecution(
        workflow_id=match.id,
        status="pending",
        trigger_type="telegram",
        source="telegram",
        source_metadata=source_metadata,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Schedule background execution
    from app.routers.runs import _run_workflow_background
    import asyncio
    asyncio.create_task(
        _run_workflow_background(match.id, execution.id, initial_input)
    )

    run_id_short = str(execution.id)[:8]
    return (
        f"<b>Started!</b>\n"
        f"Template: {match.name}\n"
        f"Run ID: <code>{run_id_short}</code>\n"
        f"Input: {initial_input[:200] or '(none)'}\n\n"
        f"Track with: /status {run_id_short}"
    )


async def _handle_status(db: AsyncSession, run_id_str: str) -> str:
    if not run_id_str:
        return "Usage: /status &lt;run_id&gt;"

    run = await _find_run(db, run_id_str)
    if isinstance(run, str):
        return run  # error message

    workflow = await db.get(Workflow, run.workflow_id)
    workflow_name = workflow.name if workflow else "Unknown"
    duration = _format_duration(run.started_at, run.completed_at)

    status_emoji = {
        "pending": "...", "running": "...", "completed": "OK",
        "failed": "ERR", "timed_out": "TIMEOUT",
    }.get(run.status, "?")

    lines = [
        f"<b>Run Status [{status_emoji}]</b>\n",
        f"Run: <code>{str(run.id)[:8]}</code>",
        f"Workflow: {workflow_name}",
        f"Status: <b>{run.status}</b>",
        f"Source: {run.source}",
        f"Duration: {duration}",
        f"Iterations: {run.iteration_count}",
    ]

    if run.current_node_id:
        lines.append(f"Current node: {run.current_node_id}")
    if run.error_message:
        lines.append(f"\nError: {run.error_message[:300]}")

    return "\n".join(lines)


async def _handle_output(db: AsyncSession, run_id_str: str) -> str:
    if not run_id_str:
        return "Usage: /output &lt;run_id&gt;"

    run = await _find_run(db, run_id_str)
    if isinstance(run, str):
        return run  # error message

    # Get the last output event
    result = await db.execute(
        select(AgentEvent)
        .where(AgentEvent.run_id == run.id)
        .where(AgentEvent.event_type.in_(["output", "completed"]))
        .order_by(AgentEvent.timestamp.desc())
        .limit(1)
    )
    last_event = result.scalar_one_or_none()

    if not last_event:
        return f"No output available for run <code>{str(run.id)[:8]}</code>"

    # Truncate for Telegram (max ~4000 chars)
    output = last_event.message[:3500]
    return f"<b>Output for run</b> <code>{str(run.id)[:8]}</code>:\n\n{output}"


async def _handle_runs(db: AsyncSession) -> str:
    result = await db.execute(
        select(WorkflowExecution)
        .order_by(WorkflowExecution.created_at.desc())
        .limit(5)
    )
    runs = result.scalars().all()

    if not runs:
        return "No runs found."

    lines = ["<b>Recent Runs:</b>\n"]
    for run in runs:
        workflow = await db.get(Workflow, run.workflow_id)
        wf_name = workflow.name if workflow else "?"
        duration = _format_duration(run.started_at, run.completed_at)
        status_icon = {
            "completed": "OK", "failed": "ERR", "running": "...",
            "pending": "...", "timed_out": "TIMEOUT",
        }.get(run.status, "?")
        lines.append(
            f"  <code>{str(run.id)[:8]}</code> [{status_icon}] {wf_name} ({duration})"
        )

    return "\n".join(lines)


async def _find_run(db: AsyncSession, run_id_str: str) -> WorkflowExecution | str:
    """Find a run by full UUID or short prefix. Returns the run or an error string."""
    # Try full UUID
    try:
        run_id = uuid.UUID(run_id_str)
        run = await db.get(WorkflowExecution, run_id)
        if run:
            return run
    except ValueError:
        pass

    # Try short prefix match
    if len(run_id_str) >= 4:
        result = await db.execute(
            select(WorkflowExecution).order_by(WorkflowExecution.created_at.desc()).limit(50)
        )
        runs = result.scalars().all()
        matches = [r for r in runs if str(r.id).startswith(run_id_str)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            return f"Ambiguous run ID prefix: <code>{run_id_str}</code> matches {len(matches)} runs"

    return f"Run not found: <code>{run_id_str}</code>"
