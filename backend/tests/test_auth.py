from app.models import Role

from app.security import login_throttle

from .conftest import PASSWORD, login, make_user


def test_login_returns_token_and_permissions(client):
    make_user(Role.sales, "Sam@Example.com")
    r = client.post("/api/auth/login", json={"email": "sam@example.com ", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "sales"
    assert "sales.create" in body["user"]["permissions"]
    assert "sales.void" not in body["user"]["permissions"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["id"] == body["user"]["id"]


def test_bad_credentials_and_throttle(client):
    make_user(Role.admin)
    for _ in range(login_throttle.max_failures):
        r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "nope"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": PASSWORD})
    assert r.status_code == 429


def test_disabled_user_cannot_log_in(client):
    make_user(Role.sales, active=False)
    r = client.post("/api/auth/login", json={"email": "sales@example.com", "password": PASSWORD})
    assert r.status_code == 403


def test_requests_without_token_are_rejected(client):
    assert client.get("/api/items").status_code == 401
    assert client.get("/api/items", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_change_password(client, seller):
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "new-password-1"},
        headers=seller,
    )
    assert r.status_code == 400
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "new-password-1"},
        headers=seller,
    )
    assert r.status_code == 200
    r = client.post(
        "/api/auth/login", json={"email": "sales@example.com", "password": "new-password-1"}
    )
    assert r.status_code == 200


def test_only_admin_manages_users(client, admin, manager):
    assert client.get("/api/users", headers=manager).status_code == 403

    new = {"email": "new@example.com", "full_name": "New", "role": "sales", "password": "password1"}
    r = client.post("/api/users", json=new, headers=admin)
    assert r.status_code == 201
    assert client.post("/api/users", json=new, headers=admin).status_code == 409

    user_id = r.json()["id"]
    r = client.patch(f"/api/users/{user_id}", json={"role": "manager"}, headers=admin)
    assert r.json()["role"] == "manager"
    r = client.patch(f"/api/users/{user_id}", json={"is_active": False}, headers=admin)
    assert r.json()["is_active"] is False
    login_r = client.post("/api/auth/login", json={"email": "new@example.com", "password": "password1"})
    assert login_r.status_code == 403


def test_admin_cannot_lock_themselves_out(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    r = client.patch(f"/api/users/{me['id']}", json={"role": "sales"}, headers=admin)
    assert r.status_code == 400
    r = client.patch(f"/api/users/{me['id']}", json={"is_active": False}, headers=admin)
    assert r.status_code == 400


def test_last_admin_cannot_be_removed(client):
    first = make_user(Role.admin, "a1@example.com")
    second = make_user(Role.admin, "a2@example.com")
    headers = login(client, second.email)
    # Demoting the other admin is fine while one admin (us) remains...
    assert client.patch(f"/api/users/{first.id}", json={"role": "manager"}, headers=headers).status_code == 200
    # ...and we still can't demote ourselves.
    assert client.patch(f"/api/users/{second.id}", json={"role": "manager"}, headers=headers).status_code == 400
