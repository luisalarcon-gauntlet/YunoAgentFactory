import logging
import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate, WorkflowResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


async def _validate_graph(graph: dict, db: AsyncSession) -> list[str]:
    """Validate a workflow graph. Returns a list of error strings (empty if valid)."""
    errors: list[str] = []
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    if not nodes:
        return errors  # Empty graph is allowed (draft workflow)

    node_ids = {n["id"] for n in nodes}

    # Validate edges reference valid nodes
    for edge in edges:
        if edge.get("source") not in node_ids:
            errors.append(f"Edge '{edge.get('id', '?')}' references unknown source node '{edge.get('source')}'")
        if edge.get("target") not in node_ids:
            errors.append(f"Edge '{edge.get('id', '?')}' references unknown target node '{edge.get('target')}'")

    # Validate agent references exist
    for node in nodes:
        agent_id_str = node.get("data", {}).get("agent_id")
        if agent_id_str:
            try:
                agent = await db.get(Agent, uuid.UUID(agent_id_str))
                if not agent:
                    label = node.get("data", {}).get("label", node["id"])
                    errors.append(f"Node '{label}' references non-existent agent '{agent_id_str}'")
            except (ValueError, AttributeError):
                errors.append(f"Node '{node['id']}' has invalid agent_id '{agent_id_str}'")

    # Check for exactly one start node (nodes with no incoming edges)
    target_ids = {e["target"] for e in edges if e.get("target") in node_ids}
    start_nodes = [n["id"] for n in nodes if n["id"] not in target_ids]
    if len(start_nodes) == 0 and len(nodes) > 0:
        errors.append("Graph has no start node (all nodes have incoming edges — fully cyclic)")
    elif len(start_nodes) > 1:
        # Multiple start nodes are allowed (parallel start), but warn is optional
        pass

    # Check for orphan nodes (unreachable from any start node)
    if start_nodes and edges:
        adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
        for edge in edges:
            src, tgt = edge.get("source"), edge.get("target")
            if src in adj and tgt in node_ids:
                adj[src].append(tgt)

        reachable: set[str] = set()
        queue: deque[str] = deque(start_nodes)
        while queue:
            nid = queue.popleft()
            if nid in reachable:
                continue
            reachable.add(nid)
            for neighbor in adj.get(nid, []):
                if neighbor not in reachable:
                    queue.append(neighbor)

        orphans = node_ids - reachable
        for orphan_id in orphans:
            label = next((n.get("data", {}).get("label", n["id"]) for n in nodes if n["id"] == orphan_id), orphan_id)
            errors.append(f"Node '{label}' is unreachable from any start node")

    return errors


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
        if payload.graph:
            validation_errors = await _validate_graph(payload.graph, db)
            if validation_errors:
                raise HTTPException(status_code=422, detail={"validation_errors": validation_errors})

        wf = Workflow(**payload.model_dump())
        db.add(wf)
        await db.commit()
        await db.refresh(wf)
        return WorkflowResponse.model_validate(wf)
    except HTTPException:
        raise
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

        update_data = payload.model_dump(exclude_unset=True)
        if "graph" in update_data and update_data["graph"]:
            validation_errors = await _validate_graph(update_data["graph"], db)
            if validation_errors:
                raise HTTPException(status_code=422, detail={"validation_errors": validation_errors})

        for field, value in update_data.items():
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
