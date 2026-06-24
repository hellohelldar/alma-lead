"""Shared pytest fixtures.

Critical: environment variables MUST be set before importing anything from
`app`, because `app.core.config` builds a module-level `settings` singleton at
import time (via an lru_cache'd get_settings). We point the DB at a throwaway
SQLite file, storage at a temp dir, and leave RESEND_API_KEY unset so the
console email backend is used (no network).
"""

import os
import tempfile
import uuid

# --- Environment setup (must happen before any `from app...` import) ---
_TMP_ROOT = tempfile.mkdtemp(prefix="alma-test-")
_DB_PATH = os.path.join(_TMP_ROOT, f"test-{uuid.uuid4().hex}.db")
_STORAGE_DIR = os.path.join(_TMP_ROOT, "uploads")
os.makedirs(_STORAGE_DIR, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["STORAGE_DIR"] = _STORAGE_DIR
os.environ.pop("RESEND_API_KEY", None)
# Deterministic, smallish upload cap so the oversized-file test is cheap.
os.environ["MAX_UPLOAD_BYTES"] = str(1 * 1024 * 1024)  # 1 MB

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient as a context manager so the lifespan runs (tables created)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_db():
    """Truncate the leads table before each test for isolation."""
    import asyncio

    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    async def _wipe():
        async with AsyncSessionLocal() as session:
            await session.execute(text("DELETE FROM leads"))
            await session.commit()

    asyncio.run(_wipe())
    yield


@pytest.fixture
def auth_headers(client):
    """Log in with the seeded attorney creds and return Bearer auth headers."""
    resp = client.post(
        f"{settings.api_prefix}/auth/login",
        json={"email": settings.attorney_email, "password": "changeme"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# --- Helpers ---

PDF_TYPE = "application/pdf"


def pdf_file(content: bytes = b"%PDF-1.4 fake resume", name: str = "resume.pdf"):
    """Build a multipart `files` dict for a PDF resume upload."""
    return {"resume": (name, content, PDF_TYPE)}


def create_lead(
    client,
    *,
    first_name: str = "Jane",
    last_name: str = "Doe",
    email: str = "jane@example.com",
    content: bytes = b"%PDF-1.4 fake resume",
    filename: str = "resume.pdf",
    content_type: str = PDF_TYPE,
):
    """POST a lead and return the response."""
    return client.post(
        f"{settings.api_prefix}/leads",
        data={"first_name": first_name, "last_name": last_name, "email": email},
        files={"resume": (filename, content, content_type)},
    )
