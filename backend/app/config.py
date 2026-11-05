import logging
import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("hydro")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://hydro:hydro@localhost:5432/hydro"

    # Signs login tokens. Required (32+ characters) in production.
    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 12

    # Comma-separated list. Only needed when the frontend is served from a
    # different origin than the API (e.g. Firebase without the /api rewrite).
    cors_origins: str = ""

    # When set, the API also serves the built frontend from this directory.
    # Used for the single-container laptop deployment.
    static_dir: str | None = None

    # Seeds the first admin account on startup when the users table is empty.
    initial_admin_email: str | None = None
    initial_admin_password: str | None = None
    initial_admin_name: str = "Administrator"

    @model_validator(mode="after")
    def ensure_secret_key(self):
        if self.is_production and len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must be set to at least 32 characters in production")
        if not self.secret_key:
            # Never fall back to a fixed key: it would be public in the repo.
            self.secret_key = secrets.token_hex(32)
            log.warning("SECRET_KEY not set; using a random key (sign-ins end when the server restarts)")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
