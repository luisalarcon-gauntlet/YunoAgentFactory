import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agents, workflows
from app.websocket import monitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Yuno Agent Orchestration Platform",
    description="AI agent workflow orchestration with visual builder and real-time monitoring",
    version="0.1.0",
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
