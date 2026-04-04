import pytest


@pytest.fixture
def sample_graph():
    """A graph with no agent references — suitable for tests that don't need agents."""
    return {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 100, "y": 200},
             "data": {"agent_id": "", "label": "Agent 1", "config": {}}},
            {"id": "node-2", "type": "agentNode", "position": {"x": 400, "y": 200},
             "data": {"agent_id": "", "label": "Agent 2", "config": {}}},
        ],
        "edges": [
            {"id": "e1-2", "source": "node-1", "target": "node-2",
             "data": {"condition": "always", "label": "Next"}},
        ],
    }


async def _create_agents(client, count=2):
    """Create real agents and return their IDs."""
    ids = []
    for i in range(count):
        resp = await client.post("/api/v1/agents", json={
            "name": f"WF Test Agent {i+1}",
            "role": f"Test role {i+1}",
            "system_prompt": f"Prompt {i+1}",
        })
        ids.append(resp.json()["id"])
    return ids


def _make_graph(agent_ids):
    """Build a valid graph with real agent IDs."""
    nodes = [
        {"id": f"node-{i+1}", "type": "agentNode", "position": {"x": i * 300, "y": 200},
         "data": {"agent_id": aid, "label": f"Agent {i+1}", "config": {}}}
        for i, aid in enumerate(agent_ids)
    ]
    edges = [
        {"id": f"e{i+1}-{i+2}", "source": f"node-{i+1}", "target": f"node-{i+2}",
         "data": {"condition": "always", "label": "Next"}}
        for i in range(len(agent_ids) - 1)
    ]
    return {"nodes": nodes, "edges": edges}


async def test_create_workflow(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    payload = {
        "name": "Test Workflow",
        "description": "A test workflow",
        "graph": graph,
    }
    response = await client.post("/api/v1/workflows", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Workflow"
    assert "id" in data
    assert len(data["graph"]["nodes"]) == 2


async def test_list_workflows(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    for name in ["WF A", "WF B"]:
        await client.post("/api/v1/workflows", json={
            "name": name, "graph": graph,
        })
    response = await client.get("/api/v1/workflows")
    assert response.status_code == 200
    assert len(response.json()) >= 2


async def test_get_workflow(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Get Me", "graph": graph,
    })
    wf_id = create_resp.json()["id"]
    response = await client.get(f"/api/v1/workflows/{wf_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Get Me"


async def test_update_workflow(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Before", "graph": graph,
    })
    wf_id = create_resp.json()["id"]
    response = await client.put(f"/api/v1/workflows/{wf_id}", json={
        "name": "After", "max_iterations": 20,
    })
    assert response.status_code == 200
    assert response.json()["name"] == "After"
    assert response.json()["max_iterations"] == 20


async def test_delete_workflow(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Delete Me", "graph": graph,
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
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    payload = {
        "name": "Template WF",
        "graph": graph,
        "is_template": True,
    }
    response = await client.post("/api/v1/workflows", json=payload)
    assert response.status_code == 201
    assert response.json()["is_template"] is True


async def test_list_templates(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    await client.post("/api/v1/workflows", json={
        "name": "Template", "graph": graph, "is_template": True,
    })
    await client.post("/api/v1/workflows", json={
        "name": "Regular", "graph": graph, "is_template": False,
    })
    response = await client.get("/api/v1/workflows/templates")
    assert response.status_code == 200
    templates = response.json()
    assert all(t["is_template"] for t in templates)


async def test_clone_template(client):
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Source Template", "graph": graph, "is_template": True,
    })
    template_id = create_resp.json()["id"]
    response = await client.post(f"/api/v1/workflows/templates/{template_id}/clone")
    assert response.status_code == 201
    clone = response.json()
    assert clone["is_template"] is False
    assert clone["id"] != template_id


# ── Graph validation tests ──


async def test_graph_validation_invalid_agent_reference(client):
    """Workflow with non-existent agent ID should be rejected."""
    graph = {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
             "data": {"agent_id": "00000000-0000-0000-0000-000000000099", "label": "Ghost", "config": {}}},
        ],
        "edges": [],
    }
    response = await client.post("/api/v1/workflows", json={
        "name": "Bad Refs", "graph": graph,
    })
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "validation_errors" in detail
    assert any("non-existent agent" in e for e in detail["validation_errors"])


async def test_graph_validation_invalid_edge_reference(client):
    """Edge referencing non-existent node should be rejected."""
    agent_ids = await _create_agents(client, 1)
    graph = {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
             "data": {"agent_id": agent_ids[0], "label": "Real", "config": {}}},
        ],
        "edges": [
            {"id": "e-bad", "source": "node-1", "target": "node-999",
             "data": {"condition": "always", "label": "Bad"}},
        ],
    }
    response = await client.post("/api/v1/workflows", json={
        "name": "Bad Edges", "graph": graph,
    })
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("unknown target" in e for e in detail["validation_errors"])


async def test_graph_validation_orphan_node(client):
    """Node unreachable from start should be flagged."""
    agent_ids = await _create_agents(client)
    graph = {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
             "data": {"agent_id": agent_ids[0], "label": "Start", "config": {}}},
            {"id": "node-2", "type": "agentNode", "position": {"x": 300, "y": 0},
             "data": {"agent_id": agent_ids[1], "label": "Orphan", "config": {}}},
        ],
        "edges": [],  # No edges — node-2 is unreachable from node-1 but both are start nodes
    }
    # With no edges, both nodes are start nodes so neither is orphan
    response = await client.post("/api/v1/workflows", json={
        "name": "Orphan Test", "graph": graph,
    })
    assert response.status_code == 201  # Both are start nodes, no orphans

    # Now create a case with a real orphan: a disconnected cycle
    # node-1 → node-2 (reachable), node-3 ↔ node-4 (disconnected cycle, orphaned)
    graph2 = {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
             "data": {"agent_id": agent_ids[0], "label": "Start", "config": {}}},
            {"id": "node-2", "type": "agentNode", "position": {"x": 300, "y": 0},
             "data": {"agent_id": agent_ids[1], "label": "Connected", "config": {}}},
            {"id": "node-3", "type": "agentNode", "position": {"x": 600, "y": 0},
             "data": {"agent_id": agent_ids[0], "label": "Orphan A", "config": {}}},
            {"id": "node-4", "type": "agentNode", "position": {"x": 900, "y": 0},
             "data": {"agent_id": agent_ids[1], "label": "Orphan B", "config": {}}},
        ],
        "edges": [
            {"id": "e1-2", "source": "node-1", "target": "node-2",
             "data": {"condition": "always", "label": "Next"}},
            {"id": "e3-4", "source": "node-3", "target": "node-4",
             "data": {"condition": "always", "label": "Cycle"}},
            {"id": "e4-3", "source": "node-4", "target": "node-3",
             "data": {"condition": "always", "label": "Cycle back"}},
        ],
    }
    response2 = await client.post("/api/v1/workflows", json={
        "name": "Orphan Test 2", "graph": graph2,
    })
    assert response2.status_code == 422
    detail = response2.json()["detail"]
    assert any("unreachable" in e.lower() for e in detail["validation_errors"])


async def test_graph_validation_update_rejects_bad_graph(client):
    """Updating a workflow with an invalid graph should be rejected."""
    agent_ids = await _create_agents(client)
    graph = _make_graph(agent_ids)
    create_resp = await client.post("/api/v1/workflows", json={
        "name": "Will Update", "graph": graph,
    })
    wf_id = create_resp.json()["id"]

    bad_graph = {
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
             "data": {"agent_id": "00000000-0000-0000-0000-000000000099", "label": "Ghost", "config": {}}},
        ],
        "edges": [],
    }
    response = await client.put(f"/api/v1/workflows/{wf_id}", json={
        "graph": bad_graph,
    })
    assert response.status_code == 422
