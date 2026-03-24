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
