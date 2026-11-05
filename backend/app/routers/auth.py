from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..deps import DB, CurrentUser
from ..models import User
from ..permissions import permissions_for
from ..schemas import ChangePasswordIn, LoginIn, MeOut, TokenOut, UserOut
from ..security import DUMMY_HASH, create_access_token, login_throttle, set_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def me_out(user: User) -> MeOut:
    return MeOut(
        **UserOut.model_validate(user).model_dump(),
        permissions=sorted(permissions_for(user.role)),
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB):
    email = body.email.strip().lower()
    # Keyed on the account, not the IP: behind proxies the client IP comes from
    # a header that callers can forge.
    key = email
    if login_throttle.is_blocked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed attempts. Try again in 15 minutes."
        )
    user = db.scalars(select(User).where(func.lower(User.email) == email)).first()
    password_ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not password_ok:
        login_throttle.record_failure(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled")
    login_throttle.reset(key)
    return TokenOut(access_token=create_access_token(user.id), user=me_out(user))


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser):
    return me_out(user)


@router.post("/change-password", response_model=TokenOut)
def change_password(body: ChangePasswordIn, user: CurrentUser, db: DB):
    """Changes the password, signs out other sessions, and returns a new token for this one."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    set_password(user, body.new_password)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=me_out(user))
