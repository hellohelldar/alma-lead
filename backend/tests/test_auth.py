"""Authentication route tests."""

from app.core.config import settings

LOGIN = f"{settings.api_prefix}/auth/login"


def test_login_success_returns_token(client):
    resp = client.post(
        LOGIN, json={"email": "attorney@alma.com", "password": "changeme"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


def test_login_wrong_password_401(client):
    resp = client.post(
        LOGIN, json={"email": "attorney@alma.com", "password": "wrong"}
    )
    assert resp.status_code == 401


def test_login_unknown_email_401(client):
    resp = client.post(
        LOGIN, json={"email": "nobody@alma.com", "password": "changeme"}
    )
    assert resp.status_code == 401


def test_login_invalid_email_format_422(client):
    resp = client.post(LOGIN, json={"email": "not-an-email", "password": "x"})
    assert resp.status_code == 422


def test_me_with_token(client, auth_headers):
    resp = client.get(f"{settings.api_prefix}/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == settings.attorney_email
