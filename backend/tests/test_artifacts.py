import uuid

from app.models.workflow import Workflow
from app.models.execution import WorkflowExecution


async def _create_workflow(db_session) -> Workflow:
    """Helper to create a workflow for artifact tests."""
    wf = Workflow(
        id=uuid.uuid4(),
        name="Test Workflow",
        graph={"nodes": [], "edges": []},
    )
    db_session.add(wf)
    await db_session.flush()
    return wf


async def _create_execution(db_session, workflow_id: uuid.UUID) -> WorkflowExecution:
    """Helper to create an execution for artifact tests."""
    exe = WorkflowExecution(
        id=uuid.uuid4(),
        workflow_id=workflow_id,
        status="completed",
    )
    db_session.add(exe)
    await db_session.flush()
    return exe


async def test_create_artifact(client, db_session):
    wf = await _create_workflow(db_session)
    exe = await _create_execution(db_session, wf.id)
    await db_session.commit()

    payload = {
        "name": "My App",
        "type": "application",
        "content": "<html>Hello</html>",
        "execution_id": str(exe.id),
        "workflow_id": str(wf.id),
        "tags": ["demo", "html"],
        "status": "draft",
    }
    response = await client.post("/api/v1/artifacts", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My App"
    assert data["type"] == "application"
    assert data["tags"] == ["demo", "html"]
    assert data["status"] == "draft"
    assert "id" in data


async def test_create_artifact_minimal(client):
    payload = {
        "name": "Simple Note",
        "type": "document",
        "content": "Some text",
    }
    response = await client.post("/api/v1/artifacts", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Simple Note"
    assert data["execution_id"] is None
    assert data["workflow_id"] is None


async def test_create_artifact_invalid_type(client):
    payload = {
        "name": "Bad Type",
        "type": "invalid_type",
        "content": "x",
    }
    response = await client.post("/api/v1/artifacts", json=payload)
    assert response.status_code == 422


async def test_create_artifact_invalid_status(client):
    payload = {
        "name": "Bad Status",
        "type": "code",
        "content": "x",
        "status": "invalid_status",
    }
    response = await client.post("/api/v1/artifacts", json=payload)
    assert response.status_code == 422


async def test_list_artifacts(client):
    # Create two artifacts
    for name in ["Artifact A", "Artifact B"]:
        await client.post("/api/v1/artifacts", json={
            "name": name,
            "type": "code",
            "content": "print('hello')",
        })

    response = await client.get("/api/v1/artifacts")
    assert response.status_code == 200
    artifacts = response.json()
    assert len(artifacts) >= 2


async def test_list_artifacts_filter_by_type(client):
    await client.post("/api/v1/artifacts", json={
        "name": "A Code",
        "type": "code",
        "content": "x",
    })
    await client.post("/api/v1/artifacts", json={
        "name": "A Doc",
        "type": "document",
        "content": "y",
    })

    response = await client.get("/api/v1/artifacts?type=code")
    assert response.status_code == 200
    artifacts = response.json()
    assert all(a["type"] == "code" for a in artifacts)


async def test_list_artifacts_filter_by_status(client):
    await client.post("/api/v1/artifacts", json={
        "name": "Draft Art",
        "type": "code",
        "content": "x",
        "status": "draft",
    })
    await client.post("/api/v1/artifacts", json={
        "name": "Live Art",
        "type": "code",
        "content": "y",
        "status": "live",
    })

    response = await client.get("/api/v1/artifacts?status=live")
    assert response.status_code == 200
    artifacts = response.json()
    assert all(a["status"] == "live" for a in artifacts)


async def test_list_artifacts_search_by_name(client):
    await client.post("/api/v1/artifacts", json={
        "name": "UniqueSearchName123",
        "type": "code",
        "content": "x",
    })

    response = await client.get("/api/v1/artifacts?search=UniqueSearch")
    assert response.status_code == 200
    artifacts = response.json()
    assert len(artifacts) >= 1
    assert any("UniqueSearchName123" in a["name"] for a in artifacts)


async def test_list_artifacts_filter_by_tags(client):
    await client.post("/api/v1/artifacts", json={
        "name": "Tagged Art",
        "type": "code",
        "content": "x",
        "tags": ["special-tag-xyz"],
    })

    response = await client.get("/api/v1/artifacts?tags=special-tag-xyz")
    assert response.status_code == 200
    artifacts = response.json()
    assert len(artifacts) >= 1


async def test_get_artifact(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Get Me",
        "type": "document",
        "content": "Full content here",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/artifacts/{artifact_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Get Me"
    assert data["content"] == "Full content here"


async def test_get_artifact_not_found(client):
    response = await client.get("/api/v1/artifacts/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_update_artifact_name(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Old Name",
        "type": "code",
        "content": "x",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.patch(f"/api/v1/artifacts/{artifact_id}", json={
        "name": "New Name",
    })
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


async def test_update_artifact_tags(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Tag Test",
        "type": "code",
        "content": "x",
        "tags": ["old"],
    })
    artifact_id = create_resp.json()["id"]

    response = await client.patch(f"/api/v1/artifacts/{artifact_id}", json={
        "tags": ["new", "tags"],
    })
    assert response.status_code == 200
    assert response.json()["tags"] == ["new", "tags"]


async def test_update_artifact_content(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Content Update",
        "type": "document",
        "content": "Original",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.patch(f"/api/v1/artifacts/{artifact_id}", json={
        "content": "Updated content",
    })
    assert response.status_code == 200
    assert response.json()["content"] == "Updated content"


async def test_update_artifact_status(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Status Test",
        "type": "code",
        "content": "x",
        "status": "draft",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.patch(f"/api/v1/artifacts/{artifact_id}", json={
        "status": "live",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "live"


async def test_update_artifact_invalid_status(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "Bad Update",
        "type": "code",
        "content": "x",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.patch(f"/api/v1/artifacts/{artifact_id}", json={
        "status": "nonexistent",
    })
    assert response.status_code == 422


async def test_update_artifact_not_found(client):
    response = await client.patch(
        "/api/v1/artifacts/00000000-0000-0000-0000-000000000000",
        json={"name": "Nope"},
    )
    assert response.status_code == 404


async def test_delete_artifact_soft_deletes(client):
    create_resp = await client.post("/api/v1/artifacts", json={
        "name": "To Archive",
        "type": "code",
        "content": "x",
        "status": "draft",
    })
    artifact_id = create_resp.json()["id"]

    response = await client.delete(f"/api/v1/artifacts/{artifact_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "archived"

    # Verify it's still retrievable
    get_resp = await client.get(f"/api/v1/artifacts/{artifact_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "archived"


async def test_delete_artifact_not_found(client):
    response = await client.delete("/api/v1/artifacts/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_list_artifacts_includes_workflow_name(client, db_session):
    wf = await _create_workflow(db_session)
    await db_session.commit()

    await client.post("/api/v1/artifacts", json={
        "name": "With WF Name",
        "type": "code",
        "content": "x",
        "workflow_id": str(wf.id),
    })

    response = await client.get("/api/v1/artifacts")
    assert response.status_code == 200
    artifacts = response.json()
    matching = [a for a in artifacts if a["name"] == "With WF Name"]
    assert len(matching) == 1
    assert matching[0]["workflow_name"] == "Test Workflow"
