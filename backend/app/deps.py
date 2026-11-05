from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import BusinessSettings, User
from .permissions import Perm, permissions_for
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        payload = decode_access_token(creds.credentials)
        user_id, issued_at = int(payload["sub"]), float(payload["iat"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    if user.password_changed_at and issued_at < user.password_changed_at.timestamp():
        raise unauthorized  # signed in before the password last changed
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def has_perm(user: User, perm: Perm) -> bool:
    return perm in permissions_for(user.role)


def require(perm: Perm):
    def checker(user: CurrentUser) -> User:
        if not has_perm(user, perm):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission to do that")
        return user

    return checker


def get_business_settings(db: Session, *, for_update: bool = False) -> BusinessSettings:
    stmt = select(BusinessSettings).where(BusinessSettings.id == 1)
    if for_update:
        stmt = stmt.with_for_update()
    settings = db.scalars(stmt).one_or_none()
    if settings is None:
        settings = BusinessSettings(id=1)
        db.add(settings)
        db.flush()
    return settings
