"""GET /api/leads (auth, filter, search, pagination) tests."""

from app.core.config import settings

from .conftest import create_lead

LEADS = f"{settings.api_prefix}/leads"


def test_list_requires_auth_401(client):
    resp = client.get(LEADS)
    assert resp.status_code == 401


def test_list_bad_token_401(client):
    resp = client.get(LEADS, headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401


def test_list_returns_envelope_newest_first(client, auth_headers):
    create_lead(client, first_name="Alice", email="alice@example.com")
    create_lead(client, first_name="Bob", email="bob@example.com")
    create_lead(client, first_name="Carol", email="carol@example.com")

    resp = client.get(LEADS, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["total"] == 3
    names = [i["first_name"] for i in body["items"]]
    # Newest first: Carol was created last.
    assert names[0] == "Carol"


def test_list_state_filter(client, auth_headers):
    r1 = create_lead(client, first_name="P", email="p@example.com")
    create_lead(client, first_name="Q", email="q@example.com")
    lead_id = r1.json()["id"]
    # Move one to REACHED_OUT.
    client.patch(
        f"{LEADS}/{lead_id}/state",
        json={"state": "REACHED_OUT"},
        headers=auth_headers,
    )

    resp = client.get(
        LEADS, params={"state": "REACHED_OUT"}, headers=auth_headers
    )
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == lead_id

    resp = client.get(
        LEADS, params={"state": "PENDING"}, headers=auth_headers
    )
    assert resp.json()["total"] == 1


def test_list_search_by_name_and_email(client, auth_headers):
    create_lead(client, first_name="Zelda", last_name="Smith", email="z@example.com")
    create_lead(client, first_name="Other", last_name="Person", email=" other@example.com".strip())

    # Search by first name (case-insensitive).
    resp = client.get(LEADS, params={"search": "zel"}, headers=auth_headers)
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["first_name"] == "Zelda"

    # Search by email fragment.
    resp = client.get(LEADS, params={"search": "z@exam"}, headers=auth_headers)
    assert resp.json()["total"] == 1


def test_list_pagination(client, auth_headers):
    for i in range(5):
        create_lead(client, first_name=f"L{i}", email=f"l{i}@example.com")

    resp = client.get(
        LEADS, params={"limit": 2, "offset": 0}, headers=auth_headers
    )
    body = resp.json()
    assert body["total"] == 5
    assert body["limit"] == 2
    assert body["offset"] == 0
    assert len(body["items"]) == 2

    resp = client.get(
        LEADS, params={"limit": 2, "offset": 4}, headers=auth_headers
    )
    assert len(resp.json()["items"]) == 1
