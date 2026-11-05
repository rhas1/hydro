import secrets
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import bcrypt
import jwt

from .config import get_settings

if TYPE_CHECKING:
    from .models import User

ALGORITHM = "HS256"
MAX_PASSWORD_BYTES = 72  # bcrypt's limit


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def set_password(user: "User", password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = datetime.now(UTC)


# Checked against when the email is unknown, so both cases take the same time.
DUMMY_HASH = hash_password(secrets.token_hex(16))


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        # Sub-second, so a password change revokes every token issued before it.
        "iat": now.timestamp(),
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        get_settings().secret_key,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "iat", "sub"]},
    )


class LoginThrottle:
    """In-memory brake on password guessing: N failures per key per window."""

    def __init__(self, max_failures: int = 10, window_seconds: int = 15 * 60, sweep_at: int = 10_000):
        self.max_failures = max_failures
        self.window = window_seconds
        self.sweep_at = sweep_at
        self._failures: dict[str, deque[float]] = {}

    def _recent(self, key: str) -> int:
        q = self._failures.get(key)
        if q is None:
            return 0
        cutoff = time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        if not q:
            del self._failures[key]
        return len(q)

    def is_blocked(self, key: str) -> bool:
        return self._recent(key) >= self.max_failures

    def record_failure(self, key: str) -> None:
        if len(self._failures) >= self.sweep_at:
            # Drop expired entries so a flood of made-up emails can't grow memory forever.
            for stale in list(self._failures):
                self._recent(stale)
        self._failures.setdefault(key, deque()).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


login_throttle = LoginThrottle()
