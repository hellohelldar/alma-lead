"""Application configuration loaded from environment variables.

All settings have sensible local-dev defaults so the API runs with zero
configuration (`uvicorn app.main:app`). Override via environment or a `.env`
file for staging/production.
"""

import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- App ---
    app_name: str = "Alma Lead API"
    environment: str = "development"
    api_prefix: str = "/api"

    # --- Database ---
    # Defaults to a local SQLite file. Point at Postgres in prod, e.g.
    # postgresql+asyncpg://user:pass@host:5432/alma
    database_url: str = "sqlite+aiosqlite:///./alma.db"

    # --- Auth (single attorney account, seeded from env) ---
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    attorney_email: str = "attorney@alma.com"
    # Plaintext password for the seeded attorney account. Hashed at runtime;
    # never stored in the DB in plaintext.
    attorney_password: str = "changeme"
    attorney_name: str = "Alma Attorney"

    # --- Email ---
    # If RESEND_API_KEY is set, emails are sent via Resend; otherwise they are
    # written to the console/log so the app is fully runnable without keys.
    resend_api_key: str | None = None
    email_from: str = "Alma <onboarding@resend.dev>"
    # Where prospect-submission notifications are sent internally.
    attorney_notify_email: str = "attorney@alma.com"

    # --- File storage ---
    storage_dir: str = "./uploads"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_resume_types: tuple[str, ...] = (
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    # --- CORS ---
    # NoDecode disables pydantic-settings' automatic JSON parsing for this list
    # field, so the validator below can accept BOTH a JSON array
    # (`["https://a","https://b"]`) and a plain comma-separated string
    # (`https://a,https://b`) from the environment without raising.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_origins(cls, v: object) -> object:
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                return json.loads(s)
            return [o.strip() for o in s.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
