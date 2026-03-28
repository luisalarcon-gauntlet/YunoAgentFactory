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
                                "You are a senior software engineer. Given the requirements, write clean, production-ready code. Your output must include:\n\n"
                                "1. **Approach**: Brief explanation of your technical approach (2-3 sentences)\n"
                                "2. **Code**: The complete implementation with comments on non-obvious decisions\n"
                                "3. **File Structure**: List of files created/modified\n"
                                "4. **Testing Notes**: How to verify this works\n"
                                "5. **Known Limitations**: Anything that's not covered\n\n"
                                "Follow best practices for the language/framework. Prefer simplicity over cleverness. Handle edge cases."
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
                                "You are a senior code reviewer. Review the code provided with the following checklist:\n\n"
                                "1. **Correctness**: Does the code do what was asked? Are there logic errors?\n"
                                "2. **Security**: Any injection risks, exposed secrets, or unsafe patterns?\n"
                                "3. **Performance**: Any obvious N+1 queries, memory leaks, or bottlenecks?\n"
                                "4. **Maintainability**: Is it readable? Are names clear? Is there dead code?\n"
                                "5. **Edge Cases**: What happens with empty input, null values, or concurrent access?\n\n"
                                "Start your response with:\n"
                                "- **APPROVED** if the code is production-ready (minor suggestions are fine)\n"
                                "- **REJECTED** with specific, actionable feedback if changes are required\n\n"
                                "Be constructive. Reference specific line numbers or code blocks in your feedback."
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
                                "You are a DevOps engineer handling deployment of approved code. Your job is to:\n\n"
                                "1. **Pre-deploy Checklist**: Verify all files are present and the code compiles/parses\n"
                                "2. **Deployment Plan**: List the exact steps to deploy this change\n"
                                "3. **Rollback Plan**: How to revert if something goes wrong\n"
                                "4. **Monitoring**: What to watch after deployment\n"
                                "5. **Status**: Report deployment status (DEPLOYED / BLOCKED with reason)\n\n"
                                "Be methodical. A failed deployment that's caught early beats a broken production."
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
            tools=["web_search"],
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
                                "You are conducting research on the given topic. Your job is to gather comprehensive, factual information from multiple angles. Structure your findings as:\n\n"
                                "1. **Overview**: Brief summary of the topic\n"
                                "2. **Key Facts**: The most important data points, statistics, and facts\n"
                                "3. **Key Players/Stakeholders**: Who is involved and their positions\n"
                                "4. **Recent Developments**: What has changed recently\n"
                                "5. **Sources**: List your sources with brief descriptions\n\n"
                                "Be thorough but concise. Prioritize accuracy over volume. If you cannot verify something, note it as unverified."
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
                                "You are a critical analyst evaluating research findings. Review the research provided and:\n\n"
                                "1. **Verify Claims**: Check if the key claims are supported by evidence\n"
                                "2. **Identify Gaps**: What important aspects are missing from the research?\n"
                                "3. **Assess Bias**: Note any potential biases in the sources or framing\n"
                                "4. **Rate Confidence**: For each major finding, rate your confidence (High/Medium/Low)\n"
                                "5. **Verdict**: Start your response with APPROVED if the research is solid enough to proceed, or REJECTED with specific feedback on what needs to be re-researched\n\n"
                                "Be rigorous. A rejected research brief that gets improved is better than an approved weak one."
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
                                "You are a professional writer producing a polished research report. Using the approved research and analysis, create a well-structured document:\n\n"
                                "# [Topic] — Research Brief\n\n"
                                "**Date**: [today's date]\n"
                                "**Status**: Final\n\n"
                                "## Executive Summary\n"
                                "[2-3 sentence overview]\n\n"
                                "## Key Findings\n"
                                "[Structured findings with supporting evidence]\n\n"
                                "## Analysis\n"
                                "[Critical analysis and implications]\n\n"
                                "## Recommendations\n"
                                "[Actionable next steps if applicable]\n\n"
                                "## Confidence Assessment\n"
                                "[Summary of confidence levels from the analyst]\n\n"
                                "Write in clear, professional prose. No filler. Every sentence should add value."
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


async def _sync_template_agents(db: AsyncSession, agents: list[Agent]) -> bool:
    """Ensure existing template agents stay in sync with seed definitions.

    Updates mutable fields (tools, system_prompt, skills) on agents that
    already exist in the DB so that re-deploying picks up fixes like the
    browser → web_search tool change.

    Returns True if any agent was updated.
    """
    updated = False
    sync_fields = ("tools", "system_prompt", "skills")

    for seed_agent in agents:
        existing = await db.get(Agent, seed_agent.id)
        if not existing:
            continue
        for field in sync_fields:
            seed_val = getattr(seed_agent, field)
            if getattr(existing, field) != seed_val:
                logger.info(
                    "Updating template agent '%s' field '%s': %s → %s",
                    existing.name, field,
                    getattr(existing, field), seed_val,
                )
                setattr(existing, field, seed_val)
                updated = True

    return updated


async def seed_templates(db: AsyncSession) -> None:
    """Insert template agents and workflows if they don't already exist.

    Also syncs mutable fields on existing template agents so that tool
    and prompt changes in the seed definitions propagate on restart.
    """

    # Check if templates already seeded
    result = await db.execute(
        select(Workflow).where(Workflow.is_template.is_(True))
    )
    existing = {w.name for w in result.scalars().all()}

    seeded = False

    dev_agents = _dev_pipeline_agents()
    res_agents = _research_pipeline_agents()

    if DEV_PIPELINE_NAME not in existing:
        for agent in dev_agents:
            if not await db.get(Agent, agent.id):
                db.add(agent)
        db.add(_dev_pipeline_workflow())
        logger.info("Seeded template: %s", DEV_PIPELINE_NAME)
        seeded = True

    if RESEARCH_PIPELINE_NAME not in existing:
        for agent in res_agents:
            if not await db.get(Agent, agent.id):
                db.add(agent)
        db.add(_research_pipeline_workflow())
        logger.info("Seeded template: %s", RESEARCH_PIPELINE_NAME)
        seeded = True

    # Sync existing template agents with current seed definitions
    synced = await _sync_template_agents(db, dev_agents + res_agents)

    if seeded or synced:
        await db.commit()
        logger.info("Template seeding complete (seeded=%s, synced=%s)", seeded, synced)
    else:
        logger.info("Templates already exist and up to date, skipping seed")
