from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import DB, CurrentUser, get_business_settings, require
from ..models import User
from ..permissions import Perm
from ..schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def read_settings(_: CurrentUser, db: DB):
    settings = get_business_settings(db)
    db.commit()
    return settings


@router.put("", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdate, _: Annotated[User, Depends(require(Perm.settings_manage))], db: DB
):
    try:
        ZoneInfo(body.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown timezone {body.timezone}")
    settings = get_business_settings(db, for_update=True)
    for field, value in body.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
