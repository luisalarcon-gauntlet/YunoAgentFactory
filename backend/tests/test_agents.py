async def test_create_agent(client):
    payload = {
        "name": "Test Coder",
        "role": "Writes code",
        "system_prompt": "You are a coder.",
        "model": "claude-sonnet-4-20250514",
        "tools": ["shell"],
        "channels": ["webchat"],
    }
    response = await client.post("/api/v1/agents", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Coder"
    assert data["role"] == "Writes code"
    assert data["model"] == "claude-sonnet-4-20250514"
    assert data["tools"] == ["shell"]
    assert data["channels"] == ["webchat"]
    assert "id" in data


async def test_create_agent_with_all_fields(client):
    payload = {
        "name": "Full Agent",
        "role": "Does everything",
        "system_prompt": "You are versatile.",
        "model": "claude-sonnet-4-20250514",
        "tools": ["shell", "file_read"],
        "channels": ["webchat", "telegram"],
        "schedule": {"cron": "0 9 * * *", "prompt": "Good morning"},
        "memory": {"preferences": {"lang": "python"}},
        "skills": ["code-review"],
        "interaction_rules": {"autonomous": True, "requires_approval": ["shell"]},
        "guardrails": {"max_tokens_per_run": 10000, "cost_limit_usd": 1.0},
    }
    response = await client.post("/api/v1/agents", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["schedule"]["cron"] == "0 9 * * *"
    assert data["guardrails"]["cost_limit_usd"] == 1.0


async def test_get_agent(client):
    # Create first
    payload = {
        "name": "Getter Agent",
        "role": "Test get",
        "system_prompt": "Prompt",
    }
    create_resp = await client.post("/api/v1/agents", json=payload)
    agent_id = create_resp.json()["id"]

    # Get
    response = await client.get(f"/api/v1/agents/{agent_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Getter Agent"


async def test_list_agents(client):
    # Create two agents
    for name in ["Agent A", "Agent B"]:
        await client.post("/api/v1/agents", json={
            "name": name,
            "role": "test",
            "system_prompt": "prompt",
        })

    response = await client.get("/api/v1/agents")
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) >= 2


async def test_update_agent(client):
    # Create
    create_resp = await client.post("/api/v1/agents", json={
        "name": "Before Update",
        "role": "old role",
        "system_prompt": "old prompt",
    })
    agent_id = create_resp.json()["id"]

    # Update
    response = await client.put(f"/api/v1/agents/{agent_id}", json={
        "name": "After Update",
        "role": "new role",
    })
    assert response.status_code == 200
    assert response.json()["name"] == "After Update"
    assert response.json()["role"] == "new role"


async def test_delete_agent(client):
    # Create
    create_resp = await client.post("/api/v1/agents", json={
        "name": "To Delete",
        "role": "doomed",
        "system_prompt": "bye",
    })
    agent_id = create_resp.json()["id"]

    # Delete
    response = await client.delete(f"/api/v1/agents/{agent_id}")
    assert response.status_code == 204

    # Verify gone
    get_resp = await client.get(f"/api/v1/agents/{agent_id}")
    assert get_resp.status_code == 404


async def test_create_agent_validation_missing_name(client):
    payload = {
        "role": "test",
        "system_prompt": "prompt",
    }
    response = await client.post("/api/v1/agents", json=payload)
    assert response.status_code == 422


async def test_get_nonexistent_agent(client):
    response = await client.get("/api/v1/agents/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_create_agent_calls_sync(client, tmp_path, monkeypatch):
    """Creating an agent should call OpenClawSync.sync_agent."""
    monkeypatch.setenv("OPENCLAW_WORKSPACE_PATH", str(tmp_path))
    # Patch the router's _get_sync to use tmp_path
    from app.services.openclaw_sync import OpenClawSync
    from unittest.mock import patch

    sync_instance = OpenClawSync(str(tmp_path))
    with patch("app.routers.agents._get_sync", return_value=sync_instance):
        payload = {
            "name": "Sync Test Agent",
            "role": "Tests sync",
            "system_prompt": "You test sync.",
        }
        response = await client.post("/api/v1/agents", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["openclaw_workspace"] == "sync-test-agent"

    # Verify workspace files were created
    import os
    agent_dir = tmp_path / "sync-test-agent"
    assert agent_dir.is_dir()
    assert (agent_dir / "SOUL.md").is_file()
    assert (agent_dir / "MEMORY.md").is_file()


async def test_update_agent_calls_sync(client, tmp_path):
    """Updating an agent should re-sync workspace files."""
    from app.services.openclaw_sync import OpenClawSync
    from unittest.mock import patch

    sync_instance = OpenClawSync(str(tmp_path))

    with patch("app.routers.agents._get_sync", return_value=sync_instance):
        # Create agent
        create_resp = await client.post("/api/v1/agents", json={
            "name": "Update Sync Agent",
            "role": "Original role",
            "system_prompt": "Original prompt",
        })
        agent_id = create_resp.json()["id"]

        # Update the agent
        response = await client.put(f"/api/v1/agents/{agent_id}", json={
            "system_prompt": "Updated prompt",
        })
        assert response.status_code == 200

    # Verify SOUL.md was updated
    soul_path = tmp_path / "update-sync-agent" / "SOUL.md"
    assert soul_path.is_file()
    content = soul_path.read_text()
    assert "Updated prompt" in content


async def test_delete_agent_referenced_by_workflow(client, db_session):
    """Deleting an agent used in a workflow should return 409."""
    from app.models.workflow import Workflow
    import uuid

    # Create agent
    create_resp = await client.post("/api/v1/agents", json={
        "name": "Referenced Agent",
        "role": "In a workflow",
        "system_prompt": "prompt",
    })
    agent_id = create_resp.json()["id"]

    # Create a workflow that references this agent
    wf = Workflow(
        id=uuid.uuid4(),
        name="Test Workflow",
        graph={
            "nodes": [
                {"id": "node-1", "type": "agentNode", "position": {"x": 0, "y": 0},
                 "data": {"agent_id": agent_id, "label": "Agent", "config": {}}}
            ],
            "edges": [],
        },
    )
    db_session.add(wf)
    await db_session.commit()

    # Try to delete the agent
    response = await client.delete(f"/api/v1/agents/{agent_id}")
    assert response.status_code == 409
    assert "Test Workflow" in response.json()["detail"]


async def test_delete_agent_calls_cleanup(client, tmp_path):
    """Deleting an agent should clean up its workspace."""
    from app.services.openclaw_sync import OpenClawSync
    from unittest.mock import patch

    sync_instance = OpenClawSync(str(tmp_path))

    with patch("app.routers.agents._get_sync", return_value=sync_instance):
        # Create agent (which also syncs)
        create_resp = await client.post("/api/v1/agents", json={
            "name": "Cleanup Agent",
            "role": "Will be deleted",
            "system_prompt": "prompt",
        })
        agent_id = create_resp.json()["id"]

        agent_dir = tmp_path / "cleanup-agent"
        assert agent_dir.is_dir()

        # Delete agent
        response = await client.delete(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 204

        # Verify workspace cleaned up
        assert not agent_dir.exists()
