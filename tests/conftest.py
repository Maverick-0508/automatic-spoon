from __future__ import annotations

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.db.session import Base, get_db
from app.main import app
from app.models.user import Role, User
from app.models.property import Client, Property
from app.core.security import hash_password

TEST_DATABASE_URL = "sqlite+aiosqlite:///file:testdb?mode=memory&cache=shared&uri=true"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture(scope="session")
async def seeded_db(db_session):
    from sqlalchemy import select
    # Seed roles
    for name, desc in [("admin", "Admin"), ("supervisor", "Supervisor")]:
        if (await db_session.execute(select(Role).where(Role.name == name))).scalar_one_or_none() is None:
            db_session.add(Role(name=name, description=desc))
    # Seed users
    if (await db_session.execute(select(User).where(User.email == "admin@test.com"))).scalar_one_or_none() is None:
        db_session.add(User(email="admin@test.com", full_name="Test Admin", hashed_password=hash_password("Test@1234!"), role="admin"))
    if (await db_session.execute(select(User).where(User.email == "supervisor@test.com"))).scalar_one_or_none() is None:
        db_session.add(User(email="supervisor@test.com", full_name="Test Supervisor", hashed_password=hash_password("Test@1234!"), role="supervisor"))
    await db_session.commit()

    # Seed a client and property for work-order tests
    client_res = await db_session.execute(select(Client).where(Client.full_name == "Test Client"))
    if client_res.scalar_one_or_none() is None:
        test_client = Client(full_name="Test Client", email="testclient@test.com")
        db_session.add(test_client)
        await db_session.flush()
        db_session.add(Property(
            client_id=test_client.id,
            address="123 Test Street",
            zone="north",
        ))
    await db_session.commit()
    yield db_session


@pytest_asyncio.fixture(scope="session")
async def client(db_engine, seeded_db):
    factory = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

