from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.property import Property


async def get_admin_token(client) -> str:
    resp = await client.post("/api/auth/login/json", json={"email": "admin@test.com", "password": "Test@1234!"})
    return resp.json()["access_token"]


async def get_test_property_id(seeded_db) -> str:
    result = await seeded_db.execute(select(Property).where(Property.address == "123 Test Street"))
    return result.scalar_one().id


@pytest.mark.asyncio
async def test_create_work_order(client, seeded_db):
    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Mow lawn", "priority": "normal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Mow lawn"
    assert body["status"] == "open"
    assert body["priority"] == "normal"
    assert body["property_id"] == prop_id


@pytest.mark.asyncio
async def test_create_work_order_invalid_property(client):
    token = await get_admin_token(client)
    resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": "nonexistent-id", "title": "Test"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_work_order(client, seeded_db):
    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    # Create one to update
    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Edge trimming", "priority": "low"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201
    wo_id = create_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/supervisor/work-orders/{wo_id}",
        json={"priority": "high", "title": "Edge trimming - urgent"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert update_resp.status_code == 200
    body = update_resp.json()
    assert body["priority"] == "high"
    assert body["title"] == "Edge trimming - urgent"


@pytest.mark.asyncio
async def test_update_work_order_not_found(client):
    token = await get_admin_token(client)
    resp = await client.patch(
        "/api/supervisor/work-orders/does-not-exist",
        json={"priority": "high"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_assign_work_order(client, seeded_db):
    from sqlalchemy import select
    from app.models.user import User

    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    # Get a valid user id
    user_res = await seeded_db.execute(select(User).where(User.email == "supervisor@test.com"))
    supervisor = user_res.scalar_one()

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Weed control"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201
    wo_id = create_resp.json()["id"]

    assign_resp = await client.post(
        f"/api/supervisor/work-orders/{wo_id}/assign",
        json={"user_id": supervisor.id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert assign_resp.status_code == 200
    body = assign_resp.json()
    assert body["assigned_to"] == supervisor.id
    assert body["status"] == "in_progress"


@pytest.mark.asyncio
async def test_assign_work_order_invalid_user(client, seeded_db):
    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Fertilize"},
        headers={"Authorization": f"Bearer {token}"},
    )
    wo_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/supervisor/work-orders/{wo_id}/assign",
        json={"user_id": "nonexistent-user"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_complete_work_order(client, seeded_db):
    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Leaf blowing"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201
    wo_id = create_resp.json()["id"]

    complete_resp = await client.post(
        f"/api/supervisor/work-orders/{wo_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert complete_resp.status_code == 200
    assert complete_resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_complete_work_order_idempotent_conflict(client, seeded_db):
    token = await get_admin_token(client)
    prop_id = await get_test_property_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"property_id": prop_id, "title": "Hedge trimming"},
        headers={"Authorization": f"Bearer {token}"},
    )
    wo_id = create_resp.json()["id"]

    await client.post(
        f"/api/supervisor/work-orders/{wo_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    # Second complete should return 409
    resp2 = await client.post(
        f"/api/supervisor/work-orders/{wo_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_complete_work_order_not_found(client):
    token = await get_admin_token(client)
    resp = await client.post(
        "/api/supervisor/work-orders/nonexistent/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_work_order_no_auth(client):
    resp = await client.post("/api/supervisor/work-orders", json={"property_id": "x", "title": "x"})
    assert resp.status_code == 401
