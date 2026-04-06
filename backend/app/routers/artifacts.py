import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.artifact import Artifact
from app.models.workflow import Workflow
from app.schemas.artifact import (
    VALID_STATUSES,
    VALID_TYPES,
    ArtifactCreate,
    ArtifactListResponse,
    ArtifactResponse,
    ArtifactUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/artifacts", tags=["artifacts"])


def _validate_type(artifact_type: str) -> None:
    if artifact_type not in VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid type '{artifact_type}'. Must be one of: {', '.join(sorted(VALID_TYPES))}",
        )


def _validate_status(status: str) -> None:
    if status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
        )


async def _get_workflow_names(db: AsyncSession, workflow_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not workflow_ids:
        return {}
    result = await db.execute(
        select(Workflow.id, Workflow.name).where(Workflow.id.in_(workflow_ids))
    )
    return {row[0]: row[1] for row in result.all()}


@router.get("", response_model=list[ArtifactListResponse])
async def list_artifacts(
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    tags: str | None = Query(default=None, description="Comma-separated tags"),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ArtifactListResponse]:
    try:
        query = select(Artifact).order_by(Artifact.created_at.desc())

        if type:
            query = query.where(Artifact.type == type)
        if status:
            query = query.where(Artifact.status == status)
        if search:
            query = query.where(Artifact.name.ilike(f"%{search}%"))
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            for tag in tag_list:
                query = query.where(Artifact.tags.contains([tag]))

        result = await db.execute(query)
        artifacts = result.scalars().all()

        # Batch-fetch workflow names
        wf_ids = {a.workflow_id for a in artifacts if a.workflow_id}
        wf_names = await _get_workflow_names(db, wf_ids)

        responses = []
        for a in artifacts:
            resp = ArtifactListResponse.model_validate(a)
            resp.workflow_name = wf_names.get(a.workflow_id)
            responses.append(resp)
        return responses

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to list artifacts")
        raise HTTPException(status_code=500, detail="Failed to retrieve artifacts")


@router.post("", response_model=ArtifactResponse, status_code=201)
async def create_artifact(
    payload: ArtifactCreate, db: AsyncSession = Depends(get_db)
) -> ArtifactResponse:
    _validate_type(payload.type)
    _validate_status(payload.status)

    try:
        artifact = Artifact(**payload.model_dump())
        db.add(artifact)
        await db.commit()
        await db.refresh(artifact)

        resp = ArtifactResponse.model_validate(artifact)
        if artifact.workflow_id:
            wf_names = await _get_workflow_names(db, {artifact.workflow_id})
            resp.workflow_name = wf_names.get(artifact.workflow_id)
        return resp

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to create artifact")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create artifact")


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ArtifactResponse:
    try:
        artifact = await db.get(Artifact, artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        resp = ArtifactResponse.model_validate(artifact)
        if artifact.workflow_id:
            wf_names = await _get_workflow_names(db, {artifact.workflow_id})
            resp.workflow_name = wf_names.get(artifact.workflow_id)
        return resp

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get artifact %s", artifact_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve artifact")


@router.patch("/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(
    artifact_id: uuid.UUID,
    payload: ArtifactUpdate,
    db: AsyncSession = Depends(get_db),
) -> ArtifactResponse:
    try:
        artifact = await db.get(Artifact, artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        update_data = payload.model_dump(exclude_unset=True)

        if "type" in update_data:
            _validate_type(update_data["type"])
        if "status" in update_data:
            _validate_status(update_data["status"])

        for field, value in update_data.items():
            setattr(artifact, field, value)

        await db.commit()
        await db.refresh(artifact)

        resp = ArtifactResponse.model_validate(artifact)
        if artifact.workflow_id:
            wf_names = await _get_workflow_names(db, {artifact.workflow_id})
            resp.workflow_name = wf_names.get(artifact.workflow_id)
        return resp

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update artifact %s", artifact_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update artifact")


@router.delete("/{artifact_id}", response_model=ArtifactResponse)
async def delete_artifact(
    artifact_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ArtifactResponse:
    """Soft delete: sets status to archived."""
    try:
        artifact = await db.get(Artifact, artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        artifact.status = "archived"
        await db.commit()
        await db.refresh(artifact)

        resp = ArtifactResponse.model_validate(artifact)
        if artifact.workflow_id:
            wf_names = await _get_workflow_names(db, {artifact.workflow_id})
            resp.workflow_name = wf_names.get(artifact.workflow_id)
        return resp

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete artifact %s", artifact_id)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete artifact")
