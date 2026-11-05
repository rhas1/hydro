from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from ..deps import DB, require
from ..models import Role, User
from ..permissions import Perm
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import set_password

router = APIRouter(prefix="/users", tags=["users"])

Admin = Annotated[User, Depends(require(Perm.users_manage))]


@router.get("", response_model=list[UserOut])
def list_users(_: Admin, db: DB):
    return db.scalars(select(User).order_by(User.is_active.desc(), User.full_name)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, _: Admin, db: DB):
    email = body.email.lower()
    if db.scalars(select(User).where(func.lower(User.email) == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with that email already exists")
    user = User(
        email=email,
        full_name=body.full_name,
        role=body.role,
        is_active=True,
    )
    set_password(user, body.password)
    db.add(user)
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, admin: Admin, db: DB):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    losing_admin = user.role == Role.admin and (
        (body.role is not None and body.role != Role.admin) or body.is_active is False
    )
    if losing_admin:
        if user.id == admin.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "You can't remove your own admin access"
            )
        other_admins = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == Role.admin, User.is_active, User.id != user.id)
        )
        if not other_admins:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "There must be at least one active admin")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        set_password(user, body.password)  # also signs the user out everywhere
    db.commit()
    return user
