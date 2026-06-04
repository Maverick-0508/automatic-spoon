from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.property import Client, Property
from app.models.work_order import WorkOrderEvent, AuditLog


async def get_admin_token(client) -> str:
    resp = await client.post("/api/auth/login/json", json={"email": "admin@test.com", "password": "Test@1234!"})
    return resp.json()["access_token"]


async def get_test_client_id(seeded_db) -> int:
    result = await seeded_db.execute(select(Client).where(Client.full_name == "Test Client"))
    return result.scalar_one().id


@pytest.mark.asyncio
async def test_create_work_order(client, seeded_db):
    token = await get_admin_token(client)
    client_id = await get_test_client_id(seeded_db)

    resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Mow lawn", "priority": "normal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Mow lawn"
    assert body["status"] == "open"
    assert body["priority"] == "normal"
    assert body["client_id"] == client_id


@pytest.mark.asyncio
async def test_create_quote_work_order_sends_detailed_email(client, seeded_db, monkeypatch):
    token = await get_admin_token(client)
    client_id = await get_test_client_id(seeded_db)

    sent = {}

    def fake_send_quote_email(*, to_email, subject, text_body, html_body, attachment_filename, attachment_bytes):
        sent["to_email"] = to_email
        sent["subject"] = subject
        sent["text_body"] = text_body
        sent["html_body"] = html_body
        sent["attachment_filename"] = attachment_filename
        sent["attachment_bytes"] = attachment_bytes

    monkeypatch.setattr("app.api.supervisor.send_quote_email", fake_send_quote_email)

    resp = await client.post(
        "/api/supervisor/work-orders",
        json={
            "client_id": client_id,
            "title": "Weekly maintenance request",
            "description": "- Mow front lawn\n- Edge driveway and sidewalks\n- Trim shrubs\n- Blow hard surfaces clear",
            "priority": "high",
            "quote": True,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201
    assert sent["to_email"] == "testclient@test.com"
    assert sent["subject"] == "Detailed quote for Weekly maintenance request"
    assert "LawnCraft Detailed Quote" in sent["text_body"]
    assert "Task Breakdown" in sent["text_body"]
    assert "1. Mow front lawn" in sent["text_body"]
    assert "2. Edge driveway and sidewalks" in sent["text_body"]
    assert "3. Trim shrubs" in sent["text_body"]
    assert "4. Blow hard surfaces clear" in sent["text_body"]
    assert "<html" in sent["html_body"].lower()
    assert sent["attachment_filename"].endswith(".pdf")
    assert sent["attachment_bytes"].startswith(b"%PDF")

    event_result = await seeded_db.execute(
        select(WorkOrderEvent).where(WorkOrderEvent.event_type == "quote_sent")
    )
    assert event_result.scalar_one_or_none() is not None

    audit_result = await seeded_db.execute(
        select(AuditLog).where(AuditLog.action == "quote.sent")
    )
    assert audit_result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_create_work_order_invalid_property(client):
    token = await get_admin_token(client)
    resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": 999999, "title": "Test"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_work_order(client, seeded_db):
    token = await get_admin_token(client)
    client_id = await get_test_client_id(seeded_db)

    # Create one to update
    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Edge trimming", "priority": "low"},
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
        "/api/supervisor/work-orders/999999",
        json={"priority": "high"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_assign_work_order(client, seeded_db):
    from sqlalchemy import select
    from app.models.user import User

    token = await get_admin_token(client)
    client_id = await get_test_client_id(seeded_db)

    # Get a valid user id
    user_res = await seeded_db.execute(select(User).where(User.email == "supervisor@test.com"))
    supervisor = user_res.scalar_one()

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Weed control"},
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
    client_id = await get_test_client_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Fertilize"},
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
    client_id = await get_test_client_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Leaf blowing"},
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
    client_id = await get_test_client_id(seeded_db)

    create_resp = await client.post(
        "/api/supervisor/work-orders",
        json={"client_id": client_id, "title": "Hedge trimming"},
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
        "/api/supervisor/work-orders/999999/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_work_order_no_auth(client):
    resp = await client.post("/api/supervisor/work-orders", json={"client_id": 1, "title": "x"})
    assert resp.status_code == 401
