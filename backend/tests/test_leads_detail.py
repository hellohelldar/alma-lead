"""GET/PATCH single-lead and resume download tests."""

from app.core.config import settings

from .conftest import create_lead

LEADS = f"{settings.api_prefix}/leads"


def test_get_lead_by_id(client, auth_headers):
    lead_id = create_lead(client, email="detail@example.com").json()["id"]
    resp = client.get(f"{LEADS}/{lead_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == lead_id


def test_get_lead_unknown_404(client, auth_headers):
    resp = client.get(f"{LEADS}/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404


def test_get_lead_requires_auth_401(client):
    resp = client.get(f"{LEADS}/any-id")
    assert resp.status_code == 401


def test_patch_state_pending_to_reached_out(client, auth_headers):
    lead_id = create_lead(client, email="state@example.com").json()["id"]
    resp = client.patch(
        f"{LEADS}/{lead_id}/state",
        json={"state": "REACHED_OUT"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "REACHED_OUT"


def test_patch_state_unknown_404(client, auth_headers):
    resp = client.patch(
        f"{LEADS}/nope/state",
        json={"state": "REACHED_OUT"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_patch_state_invalid_value_422(client, auth_headers):
    lead_id = create_lead(client, email="bad@example.com").json()["id"]
    resp = client.patch(
        f"{LEADS}/{lead_id}/state",
        json={"state": "NONSENSE"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_download_resume_returns_bytes_as_attachment(client, auth_headers):
    content = b"%PDF-1.4 my unique resume bytes"
    lead_id = create_lead(
        client, email="dl@example.com", content=content, filename="cv.pdf"
    ).json()["id"]

    resp = client.get(f"{LEADS}/{lead_id}/resume", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.content == content
    cd = resp.headers["content-disposition"]
    assert "attachment" in cd
    assert "cv.pdf" in cd


def test_download_resume_unknown_404(client, auth_headers):
    resp = client.get(f"{LEADS}/missing/resume", headers=auth_headers)
    assert resp.status_code == 404
