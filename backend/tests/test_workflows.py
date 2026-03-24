SAMPLE_GRAPH = {
    "nodes": [
        {"id": "node-1", "type": "agentNode", "position": {"x": 100, "y": 200},
         "data": {"agent_id": "00000000-0000-0000-0000-000000000001", "label": "Agent 1", "config": {}}},
        {"id": "node-2", "type": "agentNode", "position": {"x": 400, "y": 200},
         "data": {"agent_id": "00000000-0000-0000-0000-000000000002", "label": "Agent 2", "config": {}}},
    ],
    "edges": [
        {"id": "e1-2", "source": "node-1", "target": "node-2",
         "data": {"condition": "always", "label": "Next"}},
    ],
}


async def test_create_workflow(client):
    payload = {
        "name": "Test Workflow",
        "description": "A test workflow",
        "graph": SAMPLE_GRAPH,
    }
    response = await client.post("/api/v1/workflows", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Workflow"
    assert "id" in data
    assert len(data["graph"]["nodes"]) == 2


async def test_list_workflows(client):
    for name in ["WF A", "WF B"]:
        await client.post("/api/v1/workflows", json={
            "name": name, "graph": SAMPLE_GRAPH,
        })
    response = await client.get("/api/v1/workflows")
    assert response.status_code == 200
    assert len(response.json()) >= 2


async def test_get_workflow(client):
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Get Me", "graph": SAMPLE_GRAPH,
    })
    wf_id = create_resp.json()["id"]
    response = await client.get(f"/api/v1/workflows/{wf_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Get Me"


async def test_update_workflow(client):
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Before", "graph": SAMPLE_GRAPH,
    })
    wf_id = create_resp.json()["id"]
    response = await client.put(f"/api/v1/workflows/{wf_id}", json={
        "name": "After", "max_iterations": 20,
    })
    assert response.status_code == 200
    assert response.json()["name"] == "After"
    assert response.json()["max_iterations"] == 20


async def test_delete_workflow(client):
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Delete Me", "graph": SAMPLE_GRAPH,
    })
    wf_id = create_resp.json()["id"]
    response = await client.delete(f"/api/v1/workflows/{wf_id}")
    assert response.status_code == 204
    get_resp = await client.get(f"/api/v1/workflows/{wf_id}")
    assert get_resp.status_code == 404


async def test_get_nonexistent_workflow(client):
    response = await client.get("/api/v1/workflows/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_create_workflow_as_template(client):
    payload = {
        "name": "Template WF",
        "graph": SAMPLE_GRAPH,
        "is_template": True,
    }
    response = await client.post("/api/v1/workflows", json=payload)
    assert response.status_code == 201
    assert response.json()["is_template"] is True


async def test_list_templates(client):
    await client.post("/api/v1/workflows", json={
        "name": "Template", "graph": SAMPLE_GRAPH, "is_template": True,
    })
    await client.post("/api/v1/workflows", json={
        "name": "Regular", "graph": SAMPLE_GRAPH, "is_template": False,
    })
    response = await client.get("/api/v1/workflows/templates")
    assert response.status_code == 200
    templates = response.json()
    assert all(t["is_template"] for t in templates)


async def test_clone_template(client):
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Source Template", "graph": SAMPLE_GRAPH, "is_template": True,
    })
    template_id = create_resp.json()["id"]
    response = await client.post(f"/api/v1/workflows/templates/{template_id}/clone")
    assert response.status_code == 201
    clone = response.json()
    assert clone["name"] == "Source Template (Copy)"
    assert clone["is_template"] is False
    assert clone["id"] != template_id
