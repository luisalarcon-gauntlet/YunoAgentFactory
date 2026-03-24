import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import async_session_factory
from app.routers import agents, workflows
from app.seed import seed_templates
from app.websocket import monitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed workflow templates on startup
    async with async_session_factory() as session:
        try:
            await seed_templates(session)
        except Exception:
            logger.exception("Failed to seed templates")
    yield


app = FastAPI(
    title="Yuno Agent Orchestration Platform",
    description="AI agent workflow orchestration with visual builder and real-time monitoring",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(agents.router)
app.include_router(workflows.router)
app.include_router(monitor.router)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "healthy", "service": "yuno-platform-backend"}
