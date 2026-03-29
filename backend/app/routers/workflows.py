import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate, WorkflowResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(db: AsyncSession = Depends(get_db)) -> list[WorkflowResponse]:
    try:
        result = await db.execute(select(Workflow).order_by(Workflow.created_at.desc()))
        return [WorkflowResponse.model_validate(w) for w in result.scalars().all()]
    except Exception:
        logger.exception("Failed to list workflows")
        raise HTTPException(status_code=500, detail="Failed to retrieve workflows")


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(payload: WorkflowCreate, db: AsyncSession = Depends(get_db)) -> WorkflowResponse:
    try:
        wf = Workflow(**payload.model_dump())
        db.add(wf)
        await db.commit()
        await db.refresh(wf)
        return WorkflowResponse.model_validate(wf)
    except Exception:
        logger.exception("Failed to create workflow")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create workflow")


@router.get("/templates", response_model=list[WorkflowResponse])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[WorkflowResponse]:
    try:
        result = await db.execute(
            select(Workflow).where(Workflow.is_template.is_(True)).order_by(Workflow.created_at.desc())
        )
        return [WorkflowResponse.model_validate(w) for w in result.scalars().all()]
    except Exception:
        logger.exception("Failed to list templates")
        raise HTTPException(status_code=500, detail="Failed to retrieve templates")


@router.post("/templates/{template_id}/clone", response_model=WorkflowResponse, status_code=201)
async def clone_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> WorkflowResponse:
    try:
        template = await db.get(Workflow, template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        if not template.is_template:
            raise HTTPException(status_code=400, detail="Workflow is not a template")
        clone = Workflow(
            name=template.name,
            description=template.description,
            graph=template.graph,
            is_template=False,
            max_iterations=template.max_iterations,
            timeout_seconds=template.timeout_seconds,
        )
        db.add(clone)
        await db.commit()
        await db.refresh(clone)
        return WorkflowResponse.model_validate(clone)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to clone template %s", template_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to clone template")


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> WorkflowResponse:
    try:
        wf = await db.get(Workflow, workflow_id)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return WorkflowResponse.model_validate(wf)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get workflow %s", workflow_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve workflow")


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID, payload: WorkflowUpdate, db: AsyncSession = Depends(get_db)
) -> WorkflowResponse:
    try:
        wf = await db.get(Workflow, workflow_id)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(wf, field, value)
        await db.commit()
        await db.refresh(wf)
        return WorkflowResponse.model_validate(wf)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update workflow %s", workflow_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update workflow")


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    try:
        wf = await db.get(Workflow, workflow_id)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        await db.delete(wf)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete workflow %s", workflow_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete workflow")
