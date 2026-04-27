from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_live(client):
    resp = await client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
