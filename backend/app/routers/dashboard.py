from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import func, select

from ..deps import DB, CurrentUser, get_business_settings, has_perm
from ..models import Item, Sale, SaleStatus
from ..permissions import Perm
from ..schemas import DashboardOut
from ..utils import money, zone
from .items import item_out
from .sales import visible_to

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, db: DB):
    tz = zone(get_business_settings(db).timezone)
    start_of_today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    sales_scope = visible_to(user)

    today_count, today_total = db.execute(
        select(func.count(), func.coalesce(func.sum(Sale.total), 0)).where(
            Sale.created_at >= start_of_today, Sale.status == SaleStatus.completed, *sales_scope
        )
    ).one()

    low = [Item.is_active, Item.track_stock, Item.reorder_level.is_not(None), Item.quantity <= Item.reorder_level]
    low_stock_count = db.scalar(select(func.count()).select_from(Item).where(*low))
    low_stock = []
    if has_perm(user, Perm.inventory_view):
        low_stock = db.scalars(select(Item).where(*low).order_by(Item.quantity, Item.name).limit(8)).all()

    return DashboardOut(
        today_sales_count=today_count,
        today_sales_total=money(today_total),
        active_items=db.scalar(select(func.count()).select_from(Item).where(Item.is_active)),
        low_stock_count=low_stock_count,
        low_stock=[item_out(i, user) for i in low_stock],
        recent_sales=db.scalars(
            select(Sale).where(*sales_scope).order_by(Sale.id.desc()).limit(6)
        ).all(),
    )
