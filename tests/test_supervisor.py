from __future__ import annotations

import pytest


async def get_admin_token(client) -> str:
    resp = await client.post("/api/auth/login/json", json={"email": "admin@test.com", "password": "Test@1234!"})
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_stats(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/stats", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    for key in ("total_open", "overdue", "high_priority", "completed_today", "active_workers"):
        assert key in body


@pytest.mark.asyncio
async def test_stats_trends(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/stats-trends?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["days"] == 7
    assert len(body["data"]) == 7


@pytest.mark.asyncio
async def test_queue(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/queue?limit=12", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body


@pytest.mark.asyncio
async def test_planning(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/planning?limit=12", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "items" in resp.json()


@pytest.mark.asyncio
async def test_active(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/active", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "workers" in resp.json()


@pytest.mark.asyncio
async def test_exceptions(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/exceptions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "items" in resp.json()


@pytest.mark.asyncio
async def test_report(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/report?days=30", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["days"] == 30


@pytest.mark.asyncio
async def test_property_not_found(client):
    token = await get_admin_token(client)
    resp = await client.get("/api/supervisor/property?address=doesnotexist123", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_supervisor_no_auth(client):
    resp = await client.get("/api/supervisor/stats")
    assert resp.status_code == 401
