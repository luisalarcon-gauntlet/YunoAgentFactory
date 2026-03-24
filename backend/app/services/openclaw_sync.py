import json
import logging
import os
import re
import shutil

from app.models.agent import Agent

logger = logging.getLogger(__name__)


class OpenClawSync:
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path

    def _slugify(self, name: str) -> str:
        slug = name.lower().strip()
        slug = re.sub(r"[^\w\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        return slug.strip("-")

    def _agent_dir(self, agent: Agent) -> str:
        slug = self._slugify(agent.name)
        return os.path.join(self.workspace_path, slug)

    def sync_agent(self, agent: Agent) -> None:
        slug = self._slugify(agent.name)
        agent_dir = os.path.join(self.workspace_path, slug)
        os.makedirs(agent_dir, exist_ok=True)
        os.makedirs(os.path.join(agent_dir, "skills"), exist_ok=True)

        self._write_soul_md(agent_dir, agent)
        self._write_memory_md(agent_dir, agent)

        agent.openclaw_workspace = slug
        logger.info("Synced agent '%s' to workspace '%s'", agent.name, slug)

    def cleanup_agent(self, agent: Agent) -> None:
        agent_dir = self._agent_dir(agent)
        if os.path.isdir(agent_dir):
            shutil.rmtree(agent_dir)
            logger.info("Cleaned up workspace for agent '%s'", agent.name)

    def _write_soul_md(self, agent_dir: str, agent: Agent) -> None:
        content = f"""# {agent.name}

## Role
{agent.role}

## System Prompt
{agent.system_prompt}

## Model
{agent.model}

## Tools
{json.dumps(agent.tools, indent=2) if agent.tools else "None configured"}

## Channels
{json.dumps(agent.channels, indent=2) if agent.channels else "None configured"}
"""
        with open(os.path.join(agent_dir, "SOUL.md"), "w") as f:
            f.write(content)

    def _write_memory_md(self, agent_dir: str, agent: Agent) -> None:
        content = f"# Memory for {agent.name}\n\n"
        if agent.memory:
            for key, value in agent.memory.items():
                content += f"## {key}\n{json.dumps(value, indent=2)}\n\n"
        else:
            content += "No persistent memory configured.\n"

        with open(os.path.join(agent_dir, "MEMORY.md"), "w") as f:
            f.write(content)
