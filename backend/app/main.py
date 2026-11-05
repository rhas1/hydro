import logging
import mimetypes
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .db import SessionLocal
from .models import Role, User
from .routers import auth, dashboard, items, sales, settings, users
from .security import hash_password

log = logging.getLogger("hydro")


def seed_initial_admin() -> None:
    cfg = get_settings()
    if not (cfg.initial_admin_email and cfg.initial_admin_password):
        return
    if not 8 <= len(cfg.initial_admin_password.encode()) <= 72:
        raise RuntimeError("INITIAL_ADMIN_PASSWORD must be 8-72 characters")
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(User)):
            return
        db.add(
            User(
                email=cfg.initial_admin_email.strip().lower(),
                full_name=cfg.initial_admin_name,
                password_hash=hash_password(cfg.initial_admin_password),
                password_changed_at=datetime.now(UTC),
                role=Role.admin,
                is_active=True,
            )
        )
        db.commit()
        log.warning("Created initial admin user %s", cfg.initial_admin_email)


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_initial_admin()
    yield


app = FastAPI(
    title="Hydro",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

if origins := get_settings().cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
# The frontend loads nothing from other origins. Keep in sync with firebase.json.
FRONTEND_CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; "
    "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.path.startswith("/api/"):
        # Keep CDNs (e.g. Firebase Hosting) and browsers from caching API data.
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        response.headers.setdefault("Content-Security-Policy", FRONTEND_CSP)
    return response


api = APIRouter(prefix="/api")
for module in (auth, users, items, sales, settings, dashboard):
    api.include_router(module.router)


@api.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


app.include_router(api)


class SPAStaticFiles(StaticFiles):
    """Serves the built frontend; unknown paths fall back to index.html."""

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or path.startswith("api/"):
                raise
            response = await super().get_response("index.html", scope)
        if path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


if static_dir := get_settings().static_dir:
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    if Path(static_dir, "index.html").is_file():
        app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="frontend")
    else:
        log.warning("STATIC_DIR %s has no index.html; not serving the frontend", static_dir)
