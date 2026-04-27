from __future__ import annotations

import pytest
import pytest_asyncio


@pytest.mark.asyncio
async def test_login_success(client):
    resp = await client.post("/api/auth/login/json", json={"email": "admin@test.com", "password": "Test@1234!"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    resp = await client.post("/api/auth/login/json", json={"email": "admin@test.com", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client):
    resp = await client.post("/api/auth/login/json", json={"email": "nobody@test.com", "password": "Test@1234!"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me(client):
    login = await client.post("/api/auth/login/json", json={"email": "supervisor@test.com", "password": "Test@1234!"})
    token = login.json()["access_token"]
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "supervisor@test.com"
    assert body["role"] in ("admin", "supervisor")


@pytest.mark.asyncio
async def test_me_no_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
