"""Seed workflow templates — Dev Pipeline and Research Pipeline.

Idempotent: skips if templates already exist (matched by name).
Called on application startup via lifespan event.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.workflow import Workflow

logger = logging.getLogger(__name__)

# Fixed UUIDs so graph references are stable across restarts
DEV_CODER_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")
DEV_REVIEWER_ID = uuid.UUID("a0000000-0000-0000-0000-000000000002")
DEV_DEPLOYER_ID = uuid.UUID("a0000000-0000-0000-0000-000000000003")

RES_RESEARCHER_ID = uuid.UUID("b0000000-0000-0000-0000-000000000001")
RES_ANALYST_ID = uuid.UUID("b0000000-0000-0000-0000-000000000002")
RES_WRITER_ID = uuid.UUID("b0000000-0000-0000-0000-000000000003")

DEV_PIPELINE_NAME = "Dev Pipeline — Code, Review, Deploy"
RESEARCH_PIPELINE_NAME = "Research Pipeline — Gather, Analyze, Report"


def _dev_pipeline_agents() -> list[Agent]:
    return [
        Agent(
            id=DEV_CODER_ID,
            name="Coder",
            role="Writes code from requirements",
            system_prompt=(
                "You are a senior full-stack developer. Write clean, well-documented code. "
                "When receiving revision feedback, address each point specifically. "
                "Structure your output with clear file names, code blocks, and brief explanations."
            ),
            model="claude-sonnet-4-20250514",
            tools=["shell", "file_read", "file_write"],
            channels=["webchat"],
            memory={"enabled": True, "strategy": "full_context"},
            skills=["coding", "debugging", "refactoring"],
            interaction_rules={"accepts_feedback": True, "output_format": "code_blocks"},
            guardrails={
                "max_tokens": 4096,
                "forbidden_actions": ["delete_production_data", "access_secrets"],
                "require_explanation": True,
            },
        ),
        Agent(
            id=DEV_REVIEWER_ID,
            name="Reviewer",
            role="Reviews code quality",
            system_prompt=(
                "You are a meticulous code reviewer. Check for bugs, security issues, and best practices. "
                "Respond with APPROVED or REJECTED clearly at the start of your response, followed by "
                "detailed feedback. When rejecting, list specific issues that must be fixed."
            ),
            model="claude-sonnet-4-20250514",
            tools=["file_read"],
            channels=["webchat"],
            memory={"enabled": True, "strategy": "full_context"},
            skills=["code_review", "security_analysis"],
            interaction_rules={"decision_format": "APPROVED/REJECTED", "requires_justification": True},
            guardrails={
                "max_tokens": 2048,
                "must_include_verdict": True,
            },
        ),
        Agent(
            id=DEV_DEPLOYER_ID,
            name="Deployer",
            role="Deploys approved code",
            system_prompt=(
                "You are a DevOps engineer. Simulate deployment by confirming the code is "
                "production-ready and listing deployment steps taken. Include a summary of "
                "what was deployed and any post-deployment verification steps."
            ),
            model="claude-sonnet-4-20250514",
            tools=["shell"],
            channels=["webchat"],
            memory={"enabled": False},
            skills=["deployment", "infrastructure"],
            interaction_rules={"output_format": "deployment_report"},
            guardrails={
                "max_tokens": 1024,
                "require_confirmation": True,
            },
        ),
    ]


def _dev_pipeline_workflow() -> Workflow:
    return Workflow(
        name=DEV_PIPELINE_NAME,
        description=(
            "A Coder agent writes code, a Reviewer agent reviews it. "
            "If rejected, feedback loops back to the Coder. "
            "If approved, a Deployer agent handles deployment."
        ),
        is_template=True,
        max_iterations=10,
        timeout_seconds=300,
        graph={
            "nodes": [
                {
                    "id": "node-coder",
                    "type": "agentNode",
                    "position": {"x": 80, "y": 120},
                    "data": {
                        "label": "Coder",
                        "role": "Writes code from requirements",
                        "agent_id": str(DEV_CODER_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Write clean, well-documented code based on the requirements. "
                                "If you received revision feedback, address each point specifically."
                            ),
                        },
                    },
                },
                {
                    "id": "node-reviewer",
                    "type": "agentNode",
                    "position": {"x": 400, "y": 120},
                    "data": {
                        "label": "Reviewer",
                        "role": "Reviews code quality",
                        "agent_id": str(DEV_REVIEWER_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Review the code for bugs, security issues, and best practices. "
                                "Respond with APPROVED or REJECTED at the start, followed by detailed feedback."
                            ),
                        },
                    },
                },
                {
                    "id": "node-deployer",
                    "type": "agentNode",
                    "position": {"x": 720, "y": 120},
                    "data": {
                        "label": "Deployer",
                        "role": "Deploys approved code",
                        "agent_id": str(DEV_DEPLOYER_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Simulate deployment: confirm the code is production-ready "
                                "and list the deployment steps taken."
                            ),
                        },
                    },
                },
            ],
            "edges": [
                {
                    "id": "e-coder-reviewer",
                    "source": "node-coder",
                    "target": "node-reviewer",
                    "type": "conditionEdge",
                    "data": {"condition": "always", "label": "Submit for review"},
                },
                {
                    "id": "e-reviewer-deployer",
                    "source": "node-reviewer",
                    "target": "node-deployer",
                    "type": "conditionEdge",
                    "data": {"condition": "approved", "label": "Approved"},
                },
                {
                    "id": "e-reviewer-coder",
                    "source": "node-reviewer",
                    "target": "node-coder",
                    "type": "conditionEdge",
                    "data": {"condition": "rejected", "label": "Rejected"},
                },
            ],
        },
    )


def _research_pipeline_agents() -> list[Agent]:
    return [
        Agent(
            id=RES_RESEARCHER_ID,
            name="Researcher",
            role="Gathers information on a topic",
            system_prompt=(
                "You are a thorough researcher. Gather key facts, data points, and perspectives "
                "on the given topic. Cite your reasoning and organize findings into clear sections. "
                "Be comprehensive but focused on the most relevant information."
            ),
            model="claude-sonnet-4-20250514",
            tools=["browser", "shell"],
            channels=["webchat"],
            memory={"enabled": True, "strategy": "full_context"},
            skills=["research", "data_gathering", "citation"],
            interaction_rules={"output_format": "structured_findings"},
            guardrails={
                "max_tokens": 4096,
                "require_citations": True,
            },
        ),
        Agent(
            id=RES_ANALYST_ID,
            name="Analyst",
            role="Evaluates and synthesizes findings",
            system_prompt=(
                "You are a critical analyst. Evaluate the research for completeness and accuracy. "
                "If insufficient, respond with REJECTED and specify what's missing. "
                "If sufficient, respond with APPROVED and provide your synthesis."
            ),
            model="claude-sonnet-4-20250514",
            tools=["file_read"],
            channels=["webchat"],
            memory={"enabled": True, "strategy": "full_context"},
            skills=["analysis", "critical_thinking", "synthesis"],
            interaction_rules={"decision_format": "APPROVED/REJECTED", "requires_justification": True},
            guardrails={
                "max_tokens": 2048,
                "must_include_verdict": True,
            },
        ),
        Agent(
            id=RES_WRITER_ID,
            name="Writer",
            role="Produces polished final report",
            system_prompt=(
                "You are a professional writer. Take the analyzed research and produce a clear, "
                "structured report with an executive summary, key findings, analysis, and "
                "recommendations. Write in a professional, accessible tone."
            ),
            model="claude-sonnet-4-20250514",
            tools=["file_write"],
            channels=["webchat"],
            memory={"enabled": False},
            skills=["writing", "report_generation"],
            interaction_rules={"output_format": "formal_report"},
            guardrails={
                "max_tokens": 4096,
                "require_structure": True,
            },
        ),
    ]


def _research_pipeline_workflow() -> Workflow:
    return Workflow(
        name=RESEARCH_PIPELINE_NAME,
        description=(
            "A Researcher agent gathers information on a topic, an Analyst agent evaluates "
            "and synthesizes findings, and a Writer agent produces a polished report."
        ),
        is_template=True,
        max_iterations=10,
        timeout_seconds=300,
        graph={
            "nodes": [
                {
                    "id": "node-researcher",
                    "type": "agentNode",
                    "position": {"x": 80, "y": 120},
                    "data": {
                        "label": "Researcher",
                        "role": "Gathers information on a topic",
                        "agent_id": str(RES_RESEARCHER_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Gather key facts, data points, and perspectives on the given topic. "
                                "Cite your reasoning and organize findings into clear sections."
                            ),
                        },
                    },
                },
                {
                    "id": "node-analyst",
                    "type": "agentNode",
                    "position": {"x": 400, "y": 120},
                    "data": {
                        "label": "Analyst",
                        "role": "Evaluates and synthesizes findings",
                        "agent_id": str(RES_ANALYST_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Evaluate the research for completeness and accuracy. "
                                "Respond with APPROVED or REJECTED, followed by detailed feedback."
                            ),
                        },
                    },
                },
                {
                    "id": "node-writer",
                    "type": "agentNode",
                    "position": {"x": 720, "y": 120},
                    "data": {
                        "label": "Writer",
                        "role": "Produces polished final report",
                        "agent_id": str(RES_WRITER_ID),
                        "channels": ["webchat"],
                        "model": "claude-sonnet-4-20250514",
                        "config": {
                            "task_instruction": (
                                "Produce a clear, structured report with an executive summary, "
                                "key findings, analysis, and recommendations."
                            ),
                        },
                    },
                },
            ],
            "edges": [
                {
                    "id": "e-researcher-analyst",
                    "source": "node-researcher",
                    "target": "node-analyst",
                    "type": "conditionEdge",
                    "data": {"condition": "always", "label": "Submit findings"},
                },
                {
                    "id": "e-analyst-writer",
                    "source": "node-analyst",
                    "target": "node-writer",
                    "type": "conditionEdge",
                    "data": {"condition": "approved", "label": "Approved"},
                },
                {
                    "id": "e-analyst-researcher",
                    "source": "node-analyst",
                    "target": "node-researcher",
                    "type": "conditionEdge",
                    "data": {"condition": "rejected", "label": "Rejected"},
                },
            ],
        },
    )


async def seed_templates(db: AsyncSession) -> None:
    """Insert template agents and workflows if they don't already exist."""

    # Check if templates already seeded
    result = await db.execute(
        select(Workflow).where(Workflow.is_template.is_(True))
    )
    existing = {w.name for w in result.scalars().all()}

    seeded = False

    if DEV_PIPELINE_NAME not in existing:
        for agent in _dev_pipeline_agents():
            # Upsert: skip if agent with this ID already exists
            if not await db.get(Agent, agent.id):
                db.add(agent)
        db.add(_dev_pipeline_workflow())
        logger.info("Seeded template: %s", DEV_PIPELINE_NAME)
        seeded = True

    if RESEARCH_PIPELINE_NAME not in existing:
        for agent in _research_pipeline_agents():
            if not await db.get(Agent, agent.id):
                db.add(agent)
        db.add(_research_pipeline_workflow())
        logger.info("Seeded template: %s", RESEARCH_PIPELINE_NAME)
        seeded = True

    if seeded:
        await db.commit()
        logger.info("Template seeding complete")
    else:
        logger.info("Templates already exist, skipping seed")
