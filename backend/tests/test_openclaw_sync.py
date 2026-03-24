import os
import tempfile
import uuid

from app.models.agent import Agent
from app.services.openclaw_sync import OpenClawSync


async def test_sync_creates_workspace_directory():
    with tempfile.TemporaryDirectory() as tmpdir:
        sync = OpenClawSync(workspace_path=tmpdir)
        agent = Agent(
            id=uuid.uuid4(),
            name="Test Agent",
            role="Tester",
            system_prompt="You are a test agent.",
            model="claude-sonnet-4-20250514",
            tools=["shell"],
            channels=["webchat"],
            memory={},
            skills=[],
            interaction_rules={},
            guardrails={},
        )
        sync.sync_agent(agent)
        agent_dir = os.path.join(tmpdir, "test-agent")
        assert os.path.isdir(agent_dir)


async def test_sync_creates_soul_md():
    with tempfile.TemporaryDirectory() as tmpdir:
        sync = OpenClawSync(workspace_path=tmpdir)
        agent = Agent(
            id=uuid.uuid4(),
            name="Coder Bot",
            role="Writes code",
            system_prompt="You are a senior developer. Write clean code.",
            model="claude-sonnet-4-20250514",
            tools=["shell", "file_read"],
            channels=["webchat"],
            memory={},
            skills=[],
            interaction_rules={},
            guardrails={},
        )
        sync.sync_agent(agent)
        soul_path = os.path.join(tmpdir, "coder-bot", "SOUL.md")
        assert os.path.isfile(soul_path)
        content = open(soul_path).read()
        assert "senior developer" in content
        assert "Write clean code" in content


async def test_sync_creates_memory_md():
    with tempfile.TemporaryDirectory() as tmpdir:
        sync = OpenClawSync(workspace_path=tmpdir)
        agent = Agent(
            id=uuid.uuid4(),
            name="Memory Agent",
            role="Remembers things",
            system_prompt="Remember everything.",
            model="claude-sonnet-4-20250514",
            tools=[],
            channels=[],
            memory={"preferences": {"language": "python"}, "expertise": ["backend"]},
            skills=[],
            interaction_rules={},
            guardrails={},
        )
        sync.sync_agent(agent)
        memory_path = os.path.join(tmpdir, "memory-agent", "MEMORY.md")
        assert os.path.isfile(memory_path)
        content = open(memory_path).read()
        assert "python" in content


async def test_sync_sets_workspace_name():
    with tempfile.TemporaryDirectory() as tmpdir:
        sync = OpenClawSync(workspace_path=tmpdir)
        agent = Agent(
            id=uuid.uuid4(),
            name="My Agent!",
            role="test",
            system_prompt="test",
            model="claude-sonnet-4-20250514",
            tools=[],
            channels=[],
            memory={},
            skills=[],
            interaction_rules={},
            guardrails={},
        )
        sync.sync_agent(agent)
        assert agent.openclaw_workspace == "my-agent"


async def test_sync_cleanup_removes_directory():
    with tempfile.TemporaryDirectory() as tmpdir:
        sync = OpenClawSync(workspace_path=tmpdir)
        agent = Agent(
            id=uuid.uuid4(),
            name="Doomed Agent",
            role="will be deleted",
            system_prompt="bye",
            model="claude-sonnet-4-20250514",
            tools=[],
            channels=[],
            memory={},
            skills=[],
            interaction_rules={},
            guardrails={},
        )
        sync.sync_agent(agent)
        agent_dir = os.path.join(tmpdir, "doomed-agent")
        assert os.path.isdir(agent_dir)

        sync.cleanup_agent(agent)
        assert not os.path.isdir(agent_dir)
