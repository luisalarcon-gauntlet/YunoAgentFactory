import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.auth import BasicAuthMiddleware
from app.database import async_session_factory
from app.routers import agents, auth, executions, runs, workflows
from app.seed import seed_templates
from app.services.telegram_bot import telegram_bot
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

    # Start Telegram bot polling
    await telegram_bot.start()

    yield

    # Shutdown Telegram bot
    await telegram_bot.stop()


limiter = Limiter(key_func=get_remote_address)

_docs_enabled = os.environ.get("DOCS_ENABLED", "false").lower() == "true"
app = FastAPI(
    title="Yuno Agent Orchestration Platform",
    description="AI agent workflow orchestration with visual builder and real-time monitoring",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(BasicAuthMiddleware)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(workflows.router)
app.include_router(executions.router)
app.include_router(executions.debug_router)
app.include_router(runs.router)
app.include_router(monitor.router)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "healthy", "service": "yuno-platform-backend"}
