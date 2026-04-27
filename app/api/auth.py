from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import RefreshToken, User
from app.schemas.auth import LoginRequest, MeResponse, TokenResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/login/json", response_model=TokenResponse)
async def login_json(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    if user.role not in ("admin", "supervisor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: insufficient role",
        )

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    # Persist refresh token
    db_rt = RefreshToken(
        user_id=user.id,
        token_hash=_token_hash(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS),
    )
    db.add(db_rt)
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    refresh_token: str,
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token_h = _token_hash(refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_h,
            RefreshToken.revoked == False,
        )
    )
    db_rt = result.scalar_one_or_none()
    if db_rt is None or db_rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired or revoked")

    # Rotate: revoke old, issue new
    db_rt.revoked = True

    user_id: str = payload.get("sub")
    result2 = await db.execute(select(User).where(User.id == user_id))
    user = result2.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled")

    new_access = create_access_token(user.id, user.role)
    new_refresh = create_refresh_token(user.id)
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=_token_hash(new_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS),
    )
    db.add(new_rt)
    await db.commit()

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
    )
