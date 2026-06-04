from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/lawncraft"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "insecure-dev-secret"
    JWT_ACCESS_MINUTES: int = 15
    JWT_REFRESH_DAYS: int = 7
    JWT_ALGORITHM: str = "HS256"

    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000"

    LOG_LEVEL: str = "INFO"
    SENTRY_DSN: str = ""

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    QUOTE_FROM_EMAIL: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def quote_from_email(self) -> str:
        return self.QUOTE_FROM_EMAIL or self.SMTP_USERNAME or "noreply@lawncraft.local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
