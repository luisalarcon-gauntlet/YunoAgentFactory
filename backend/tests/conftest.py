import base64
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from unittest.mock import AsyncMock

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://platform:devpassword@postgres:5432/agentplatform_test",
)

# Build Basic auth header from first configured admin user (or use a test default)
_admin_users = os.environ.get("ADMIN_USERS", "")
if _admin_users and ":" in _admin_users.split(",")[0]:
    _first_user = _admin_users.split(",")[0].strip()
    _creds = base64.b64encode(_first_user.encode()).decode()
else:
    _creds = base64.b64encode(b"test:test").decode()

AUTH_HEADERS = {"Authorization": f"Basic {_creds}"}


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=AUTH_HEADERS,
    ) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_openclaw():
    mock = AsyncMock()
    mock.connect = AsyncMock()
    mock.send_and_wait = AsyncMock()
    # build_session_key is a sync method — use a regular side_effect
    mock.build_session_key = lambda workspace: f"agent:{workspace}:main"
    return mock


@pytest.fixture
def mock_ws_manager():
    mock = AsyncMock()
    mock.broadcast = AsyncMock()
    return mock
