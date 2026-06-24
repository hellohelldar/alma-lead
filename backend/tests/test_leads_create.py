"""POST /api/leads (public intake) tests."""

import pytest

from app.core.config import settings

from .conftest import PDF_TYPE, create_lead

LEADS = f"{settings.api_prefix}/leads"


def test_create_lead_201_defaults_pending(client):
    resp = create_lead(client, email="new.lead@example.com")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["state"] == "PENDING"
    assert body["first_name"] == "Jane"
    assert body["email"] == "new.lead@example.com"
    assert body["resume_filename"] == "resume.pdf"
    assert body["resume_content_type"] == PDF_TYPE
    assert body["id"]


def test_create_lead_triggers_background_notifications(client, monkeypatch):
    calls = []

    async def fake_send(*, first_name, last_name, email):
        calls.append((first_name, last_name, email))

    # Patch the symbol as imported into the route module.
    monkeypatch.setattr(
        "app.api.routes.leads.send_lead_notifications", fake_send
    )

    resp = create_lead(
        client, first_name="Bg", last_name="Task", email="bg@example.com"
    )
    assert resp.status_code == 201
    # Background task runs as the TestClient request completes.
    assert calls == [("Bg", "Task", "bg@example.com")]


def test_create_lead_invalid_email_422(client):
    resp = create_lead(client, email="not-an-email")
    assert resp.status_code == 422


def test_create_lead_disallowed_content_type_422(client):
    resp = create_lead(
        client, filename="resume.txt", content_type="text/plain"
    )
    assert resp.status_code == 422


def test_create_lead_empty_file_422(client):
    resp = create_lead(client, content=b"")
    assert resp.status_code == 422


def test_create_lead_oversized_file_413(client):
    big = b"x" * (settings.max_upload_bytes + 1)
    resp = create_lead(client, content=big)
    assert resp.status_code == 413


@pytest.mark.parametrize("missing", ["first_name", "last_name", "email"])
def test_create_lead_missing_required_form_field_422(client, missing):
    data = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com",
    }
    data.pop(missing)
    resp = client.post(
        LEADS,
        data=data,
        files={"resume": ("resume.pdf", b"%PDF-1.4", PDF_TYPE)},
    )
    assert resp.status_code == 422
