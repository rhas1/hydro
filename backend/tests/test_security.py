from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.models import Role
from app.security import LoginThrottle

from .conftest import PASSWORD, login, make_user


def test_no_fixed_secret_key():
    first, second = Settings(secret_key=""), Settings(secret_key="")
    assert len(first.secret_key) >= 32
    assert first.secret_key != second.secret_key
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="too-short")
    Settings(environment="production", secret_key="x" * 32)


def test_password_change_revokes_older_tokens(client):
    old = login(client, make_user(Role.sales).email)
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "brand-new-pass"},
        headers=old,
    )
    assert r.status_code == 200
    new = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=old).status_code == 401
    assert client.get("/api/auth/me", headers=new).status_code == 200


def test_admin_password_reset_signs_user_out(client, admin, seller):
    seller_id = client.get("/api/auth/me", headers=seller).json()["id"]
    r = client.patch(f"/api/users/{seller_id}", json={"password": "reset-by-admin"}, headers=admin)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=seller).status_code == 401


def test_tokens_need_standard_claims(client, seller):
    user_id = client.get("/api/auth/me", headers=seller).json()["id"]
    secret = get_settings().secret_key
    no_iat = jwt.encode({"sub": str(user_id), "exp": datetime.now(UTC) + timedelta(hours=1)}, secret)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {no_iat}"}).status_code == 401
    unsigned = jwt.encode({"sub": str(user_id), "iat": 0, "exp": 9999999999}, None, algorithm="none")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_overlong_password_is_a_validation_error(client, admin):
    body = {"email": "long@example.com", "full_name": "Long", "role": "sales", "password": "x" * 80}
    assert client.post("/api/users", json=body, headers=admin).status_code == 422


def test_invoice_prefix_must_be_plain(client, admin):
    settings = client.get("/api/settings", headers=admin).json()
    r = client.put("/api/settings", json=settings | {"invoice_prefix": 'INV"\r\nX-Evil: 1'}, headers=admin)
    assert r.status_code == 422
    r = client.put("/api/settings", json=settings | {"invoice_prefix": "HYD/2026-"}, headers=admin)
    assert r.status_code == 200


def test_attribute_values_are_bounded(client, manager):
    r = client.post("/api/items", json={"name": "X", "attributes": {"Notes": "y" * 501}}, headers=manager)
    assert r.status_code == 422


def test_security_headers(client):
    api = client.get("/api/health")
    assert api.headers["x-content-type-options"] == "nosniff"
    assert api.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" not in api.headers  # Swagger UI at /api/docs needs a CDN
    page = client.get("/some/frontend/route")
    assert "default-src 'self'" in page.headers["content-security-policy"]


def test_login_throttle_forgets_expired_entries():
    throttle = LoginThrottle(max_failures=2, window_seconds=0, sweep_at=3)
    for n in range(10):
        throttle.record_failure(f"user{n}@example.com")
    assert len(throttle._failures) <= 3
    assert not throttle.is_blocked("user9@example.com")
