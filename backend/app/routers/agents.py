import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.models.workflow import Workflow
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse
from app.services.openclaw_sync import OpenClawSync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])

WORKSPACE_BASE = os.environ.get("OPENCLAW_WORKSPACE_PATH", "/openclaw-workspace")


def _get_sync() -> OpenClawSync:
    return OpenClawSync(WORKSPACE_BASE)


# Files created by OpenClaw itself — not user-generated content
SYSTEM_FILES = frozenset({
    "AGENTS.md", "BOOTSTRAP.md", "HEARTBEAT.md", "IDENTITY.md",
    "TOOLS.md", "USER.md", "SOUL.md", "MEMORY.md",
})

HIDDEN_DIRS = frozenset({".git", ".openclaw", "__pycache__", "node_modules"})


@router.get("", response_model=list[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)) -> list[AgentResponse]:
    try:
        result = await db.execute(select(Agent).order_by(Agent.created_at.desc()))
        agents = result.scalars().all()
        return [AgentResponse.model_validate(a) for a in agents]
    except Exception:
        logger.exception("Failed to list agents")
        raise HTTPException(status_code=500, detail="Failed to retrieve agents")


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(payload: AgentCreate, db: AsyncSession = Depends(get_db)) -> AgentResponse:
    try:
        agent = Agent(**payload.model_dump())
        db.add(agent)
        await db.flush()

        try:
            sync = _get_sync()
            sync.sync_agent(agent)
        except Exception:
            logger.warning("OpenClaw sync failed for new agent '%s'", agent.name, exc_info=True)

        await db.commit()
        await db.refresh(agent)
        return AgentResponse.model_validate(agent)
    except Exception:
        logger.exception("Failed to create agent")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create agent")


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> AgentResponse:
    try:
        agent = await db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get agent %s", agent_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve agent")


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID, payload: AgentUpdate, db: AsyncSession = Depends(get_db)
) -> AgentResponse:
    try:
        agent = await db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(agent, field, value)

        try:
            sync = _get_sync()
            sync.sync_agent(agent)
        except Exception:
            logger.warning("OpenClaw sync failed for agent '%s'", agent.name, exc_info=True)

        await db.commit()
        await db.refresh(agent)
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update agent %s", agent_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update agent")


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    try:
        agent = await db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Check if any workflows reference this agent
        result = await db.execute(select(Workflow))
        workflows = result.scalars().all()
        referencing = []
        agent_id_str = str(agent_id)
        for wf in workflows:
            graph = wf.graph or {}
            for node in graph.get("nodes", []):
                if node.get("data", {}).get("agent_id") == agent_id_str:
                    referencing.append(wf.name)
                    break
        if referencing:
            names = ", ".join(referencing)
            raise HTTPException(
                status_code=409,
                detail=f"Agent is referenced by workflow(s): {names}. Remove the agent from these workflows first.",
            )

        try:
            sync = _get_sync()
            sync.cleanup_agent(agent)
        except Exception:
            logger.warning("OpenClaw cleanup failed for agent '%s'", agent.name, exc_info=True)

        await db.delete(agent)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete agent %s", agent_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete agent")


def _resolve_workspace_dir(agent: Agent) -> str | None:
    """Find the workspace directory for an agent on the filesystem."""
    slug = agent.openclaw_workspace or agent.name.lower().replace(" ", "-")

    # Primary: mounted volume
    primary = os.path.join(WORKSPACE_BASE, slug)
    if os.path.isdir(primary):
        return primary

    # Fallback: OpenClaw auto-generated workspace
    config_base = os.environ.get("OPENCLAW_CONFIG_PATH", "openclaw-data/config")
    fallback = os.path.join(config_base, f"workspace-{slug}")
    if os.path.isdir(fallback):
        return fallback

    return None


def _scan_workspace_files(workspace_dir: str) -> list[dict]:
    """Walk workspace dir and return non-system, non-hidden files."""
    files: list[dict] = []
    for root, dirs, filenames in os.walk(workspace_dir):
        # Prune hidden/system directories in-place
        dirs[:] = [d for d in dirs if d not in HIDDEN_DIRS and not d.startswith(".")]

        for fname in filenames:
            if fname.startswith(".") or fname in SYSTEM_FILES:
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, workspace_dir)
            try:
                stat = os.stat(full)
                files.append({
                    "name": fname,
                    "path": rel,
                    "size": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                })
            except OSError:
                continue
    files.sort(key=lambda f: f["modified_at"], reverse=True)
    return files


@router.get("/{agent_id}/workspace/files")
async def list_workspace_files(
    agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    """List files in an agent's OpenClaw workspace."""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    workspace_dir = _resolve_workspace_dir(agent)
    if not workspace_dir:
        return []

    return _scan_workspace_files(workspace_dir)


@router.get("/{agent_id}/workspace/files/{filepath:path}")
async def get_workspace_file(
    agent_id: uuid.UUID, filepath: str, db: AsyncSession = Depends(get_db)
) -> PlainTextResponse:
    """Retrieve the contents of a file in an agent's workspace."""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    workspace_dir = _resolve_workspace_dir(agent)
    if not workspace_dir:
        raise HTTPException(status_code=404, detail="Workspace not found")

    full_path = os.path.normpath(os.path.join(workspace_dir, filepath))
    # Prevent path traversal
    if not full_path.startswith(os.path.normpath(workspace_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", errors="replace") as f:
            content = f.read()
        return PlainTextResponse(content)
    except Exception:
        logger.exception("Failed to read workspace file %s", full_path)
        raise HTTPException(status_code=500, detail="Failed to read file")
