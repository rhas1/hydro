import os

# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://hydro:hydro@localhost:5432/hydro_test"
)
os.environ["INITIAL_ADMIN_EMAIL"] = ""
os.environ["STATIC_DIR"] = ""

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.security import hash_password, login_throttle  # noqa: E402

PASSWORD = "correct-horse"


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_db():
    with engine.begin() as conn:
        conn.execute(
            text("TRUNCATE stock_movements, sale_lines, sales, items, users RESTART IDENTITY CASCADE")
        )
        conn.execute(
            text(
                "UPDATE business_settings SET business_name='Test Shop', currency='USD', "
                "timezone='UTC', default_tax_rate=0, invoice_prefix='INV-', next_invoice_number=1"
            )
        )
    login_throttle._failures.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def make_user(role: Role, email: str | None = None, active: bool = True) -> User:
    with SessionLocal() as db:
        user = User(
            email=email or f"{role}@example.com",
            full_name=f"{role.title()} User",
            password_hash=hash_password(PASSWORD),
            role=role,
            is_active=active,
        )
        db.add(user)
        db.commit()
        return user


def login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return login(client, make_user(Role.admin).email)


@pytest.fixture
def manager(client):
    return login(client, make_user(Role.manager).email)


@pytest.fixture
def seller(client):
    return login(client, make_user(Role.sales).email)
