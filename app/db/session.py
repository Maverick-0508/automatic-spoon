from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

database_url = settings.DATABASE_URL
engine_kwargs = {
    "pool_pre_ping": True,
    "echo": settings.APP_ENV == "development",
}

if not make_url(database_url).drivername.startswith("sqlite"):
    engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
    )

engine = create_async_engine(database_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
