import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.execution import ExecutionStep, WorkflowExecution
from app.models.message import AgentMessage
from app.models.workflow import Workflow
from app.services.openclaw_client import OpenClawWSClient

logger = logging.getLogger(__name__)


class OrchestrationEngine:
    def __init__(self, db: AsyncSession, openclaw: OpenClawWSClient, ws_manager) -> None:
        self.db = db
        self.openclaw = openclaw
        self.ws_manager = ws_manager

    async def run_workflow(
        self,
        workflow_id: uuid.UUID,
        initial_input: str = "",
        execution_id: uuid.UUID | None = None,
    ) -> uuid.UUID:
        workflow = await self.db.get(Workflow, workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        graph = workflow.graph

        # Use existing execution record or create a new one
        if execution_id:
            execution = await self.db.get(WorkflowExecution, execution_id)
            if not execution:
                raise ValueError(f"Execution {execution_id} not found")
            execution.status = "running"
            execution.started_at = datetime.now(timezone.utc)
            execution.iteration_count = 0
        else:
            execution = WorkflowExecution(
                workflow_id=workflow_id,
                status="running",
                iteration_count=0,
                started_at=datetime.now(timezone.utc),
            )
            self.db.add(execution)

        await self.db.flush()
        await self.db.refresh(execution)

        await self.ws_manager.broadcast({
            "type": "execution.started",
            "execution_id": str(execution.id),
            "workflow_id": str(workflow_id),
        })

        try:
            start_node_ids = self._find_start_nodes(graph)
            if not start_node_ids:
                raise ValueError("Workflow has no start nodes")

            logger.info(
                "Starting workflow %s execution %s with %d start node(s)",
                workflow_id, execution.id, len(start_node_ids),
            )

            queue: list[tuple[str, str]] = [(nid, initial_input) for nid in start_node_ids]

            while queue:
                if execution.iteration_count >= workflow.max_iterations:
                    execution.status = "timed_out"
                    execution.error_message = f"Exceeded max iterations ({workflow.max_iterations})"
                    logger.warning(
                        "Execution %s exceeded max iterations (%d)",
                        execution.id, workflow.max_iterations,
                    )
                    break

                current_node_id, input_data = queue.pop(0)
                node = self._get_node(graph, current_node_id)
                agent_id = node["data"]["agent_id"]
                agent = await self.db.get(Agent, uuid.UUID(agent_id))

                if not agent:
                    execution.status = "failed"
                    execution.error_message = f"Agent {agent_id} not found for node {current_node_id}"
                    logger.error("Agent %s not found", agent_id)
                    break

                # Ensure agent has an OpenClaw session
                await self._ensure_agent_session(agent)

                step = await self._execute_agent_step(
                    execution=execution,
                    node=node,
                    agent=agent,
                    input_data=input_data,
                )

                if step.status == "failed":
                    execution.status = "failed"
                    execution.error_message = f"Agent '{agent.name}' failed at node {current_node_id}: {step.error_message}"
                    logger.error(
                        "Step failed for agent '%s' at node %s: %s",
                        agent.name, current_node_id, step.error_message,
                    )
                    break

                await self._log_agent_message(
                    execution_id=execution.id,
                    from_agent_id=agent.id,
                    content=step.output_data,
                    message_type="task_output",
                )

                next_nodes = self._evaluate_edges(graph, current_node_id, step.output_data)
                for next_node_id in next_nodes:
                    next_node = self._get_node(graph, next_node_id)
                    next_agent_id = next_node["data"]["agent_id"]
                    await self._log_agent_message(
                        execution_id=execution.id,
                        from_agent_id=agent.id,
                        to_agent_id=uuid.UUID(next_agent_id),
                        content=step.output_data,
                        message_type="task_output",
                    )
                    queue.append((next_node_id, step.output_data))

                execution.iteration_count += 1
                execution.current_node_id = current_node_id

            if execution.status == "running":
                execution.status = "completed"
                logger.info(
                    "Execution %s completed after %d iterations",
                    execution.id, execution.iteration_count,
                )

        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
            logger.exception("Workflow execution %s failed", execution.id)

        execution.completed_at = datetime.now(timezone.utc)
        await self.db.commit()

        await self.ws_manager.broadcast({
            "type": "execution.completed",
            "execution_id": str(execution.id),
            "status": execution.status,
        })

        return execution.id

    async def _ensure_agent_session(self, agent: Agent) -> None:
        """Ensure the agent has an OpenClaw session. Creates one if missing."""
        if agent.openclaw_session_key:
            return

        workspace = agent.openclaw_workspace or agent.name.lower().replace(" ", "-")
        logger.info("Agent '%s' has no session, creating one (workspace: %s)", agent.name, workspace)

        try:
            session_key = await self.openclaw.create_session(workspace)
            agent.openclaw_session_key = session_key
            await self.db.flush()
            logger.info("Assigned session '%s' to agent '%s'", session_key, agent.name)
        except Exception as e:
            logger.error("Failed to create session for agent '%s': %s", agent.name, e)
            raise RuntimeError(f"Cannot create OpenClaw session for agent '{agent.name}': {e}") from e

    async def _execute_agent_step(
        self, execution: WorkflowExecution, node: dict, agent: Agent, input_data: str
    ) -> ExecutionStep:
        step = ExecutionStep(
            execution_id=execution.id,
            node_id=node["id"],
            agent_id=agent.id,
            status="running",
            input_data=input_data,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(step)
        await self.db.flush()

        await self.ws_manager.broadcast({
            "type": "step.started",
            "execution_id": str(execution.id),
            "node_id": node["id"],
            "agent_name": agent.name,
        })

        try:
            prompt = self._build_agent_prompt(agent, node, input_data)

            logger.info(
                "Executing agent '%s' (session: %s) for node %s",
                agent.name, agent.openclaw_session_key, node["id"],
            )

            response = await self.openclaw.send_and_wait(
                session_key=agent.openclaw_session_key,
                message=prompt,
                timeout=120,
            )

            step.output_data = response.text
            step.token_count = response.token_count
            step.cost_usd = response.cost_usd
            step.status = "completed"

        except TimeoutError:
            step.status = "failed"
            step.error_message = "Agent response timed out"
            logger.error("Agent '%s' timed out at node %s", agent.name, node["id"])
        except Exception as e:
            step.status = "failed"
            step.error_message = str(e)
            logger.error("Agent '%s' failed at node %s: %s", agent.name, node["id"], e)

        step.completed_at = datetime.now(timezone.utc)
        if step.started_at:
            step.duration_ms = int((step.completed_at - step.started_at).total_seconds() * 1000)

        await self.ws_manager.broadcast({
            "type": "step.completed",
            "execution_id": str(execution.id),
            "node_id": node["id"],
            "agent_name": agent.name,
            "status": step.status,
            "duration_ms": step.duration_ms,
        })

        return step

    def _build_agent_prompt(self, agent: Agent, node: dict, input_data: str) -> str:
        node_config = node.get("data", {}).get("config", {})
        task_instruction = node_config.get("task_instruction", "")

        return f"""## Task
{task_instruction}

## Input from Previous Agent
{input_data}

## Instructions
- Complete the task described above using the input provided.
- Produce clear, structured output.
- If you need to approve or reject the input, state "APPROVED" or "REJECTED" clearly at the start of your response, followed by your reasoning.
"""

    def _evaluate_edges(self, graph: dict, source_node_id: str, output: str) -> list[str]:
        edges = [e for e in graph["edges"] if e["source"] == source_node_id]
        next_nodes: list[str] = []
        default_targets: list[str] = []

        for edge in edges:
            condition = edge.get("data", {}).get("condition", "always")

            if condition == "always":
                next_nodes.append(edge["target"])
            elif condition == "approved" and "APPROVED" in output.upper():
                next_nodes.append(edge["target"])
            elif condition == "rejected" and "REJECTED" in output.upper():
                next_nodes.append(edge["target"])
            elif condition.startswith("contains:"):
                keyword = condition.split(":", 1)[1]
                if keyword.lower() in output.lower():
                    next_nodes.append(edge["target"])
            elif condition == "default":
                default_targets.append(edge["target"])

        if not next_nodes and default_targets:
            next_nodes = default_targets

        return next_nodes

    def _find_start_nodes(self, graph: dict) -> list[str]:
        target_ids = {e["target"] for e in graph["edges"]}
        start_nodes = [n["id"] for n in graph["nodes"] if n["id"] not in target_ids]
        if not start_nodes and graph["nodes"]:
            # Cyclic graph: pick the leftmost node by x position
            sorted_nodes = sorted(graph["nodes"], key=lambda n: n.get("position", {}).get("x", 0))
            start_nodes = [sorted_nodes[0]["id"]]
        return start_nodes

    def _get_node(self, graph: dict, node_id: str) -> dict:
        return next(n for n in graph["nodes"] if n["id"] == node_id)

    async def _log_agent_message(
        self,
        execution_id: uuid.UUID,
        from_agent_id: uuid.UUID,
        content: str,
        message_type: str,
        to_agent_id: uuid.UUID | None = None,
    ) -> None:
        msg = AgentMessage(
            execution_id=execution_id,
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            content=content,
            message_type=message_type,
        )
        self.db.add(msg)
        await self.db.flush()
