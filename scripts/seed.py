#!/usr/bin/env python3
"""Seed initial admin and supervisor users."""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.session import AsyncSessionLocal, engine, Base
from app.models import user as _user_models  # noqa: ensure models registered
from app.models import property as _prop_models  # noqa
from app.models import work_order as _wo_models  # noqa
from app.services.user_service import create_user, get_user_by_email
from app.models.user import Role


async def main():
    # Create all tables (dev/test only — use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Ensure roles exist
        from sqlalchemy import select
        for role_name, desc in [("admin", "Full access"), ("supervisor", "Supervisor access")]:
            res = await db.execute(select(Role).where(Role.name == role_name))
            if res.scalar_one_or_none() is None:
                db.add(Role(name=role_name, description=desc))
        await db.commit()

        # Admin user
        admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@lawncraft.com")
        admin_password = os.getenv("SEED_ADMIN_PASSWORD", "Admin@12345!")
        if not await get_user_by_email(db, admin_email):
            admin = await create_user(db, admin_email, "Admin User", admin_password, role="admin")
            print(f"Created admin: {admin.email}")
        else:
            print(f"Admin already exists: {admin_email}")

        # Supervisor user
        sup_email = os.getenv("SEED_SUPERVISOR_EMAIL", "supervisor@lawncraft.com")
        sup_password = os.getenv("SEED_SUPERVISOR_PASSWORD", "Supervisor@12345!")
        if not await get_user_by_email(db, sup_email):
            sup = await create_user(db, sup_email, "Supervisor User", sup_password, role="supervisor")
            print(f"Created supervisor: {sup.email}")
        else:
            print(f"Supervisor already exists: {sup_email}")


if __name__ == "__main__":
    asyncio.run(main())
