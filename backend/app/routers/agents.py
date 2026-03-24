import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


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
        await db.delete(agent)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete agent %s", agent_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete agent")
