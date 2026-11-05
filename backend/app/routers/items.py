from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Text, case, cast, func, or_, select
from sqlalchemy.orm import Session

from ..deps import DB, has_perm, require
from ..models import Category, Item, MovementKind, StockMovement, User
from ..permissions import Perm
from ..schemas import ItemCreate, ItemList, ItemMeta, ItemOut, ItemUpdate, MovementOut, StockChangeIn
from ..utils import fmt_qty, is_whole

router = APIRouter(prefix="/items", tags=["inventory"])

Viewer = Annotated[User, Depends(require(Perm.inventory_view))]
Manager = Annotated[User, Depends(require(Perm.inventory_manage))]

DEFAULT_UNITS = ["pcs", "kg", "g", "l", "ml", "m", "box", "pack", "dozen", "pair", "set", "hour"]
REQUIRED_FIELDS = ("name", "unit", "cost_price", "sale_price", "track_stock", "attributes", "is_active")


def item_out(item: Item, user: User) -> ItemOut:
    out = ItemOut.model_validate(item)
    if not has_perm(user, Perm.inventory_view_cost):
        out.cost_price = None
    return out


def get_item(db: Session, item_id: int, *, for_update: bool = False) -> Item:
    stmt = select(Item).where(Item.id == item_id)
    if for_update:
        stmt = stmt.with_for_update()
    item = db.scalars(stmt).one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


def get_category(db: Session, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That category no longer exists")
    return category


def ensure_sku_free(db: Session, sku: str | None, item_id: int | None = None) -> None:
    if sku is None:
        return
    clash = db.scalar(select(Item.id).where(func.lower(Item.sku) == sku.lower(), Item.id != item_id))
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, f"SKU {sku} is already used by another item")


@router.get("", response_model=ItemList)
def list_items(
    user: Viewer,
    db: DB,
    q: str | None = None,
    category_id: int | None = None,
    low_stock: bool = False,
    in_stock: bool = False,
    include_inactive: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = select(Item).outerjoin(Category, Item.category_id == Category.id)
    order = [Item.name]
    if not include_inactive:
        stmt = stmt.where(Item.is_active)
    if q and q.strip():
        term = q.strip()
        like = f"%{term}%"
        stmt = stmt.where(
            or_(
                Item.name.ilike(like),
                Item.sku.ilike(like),
                Category.name.ilike(like),
                Item.description.ilike(like),
                cast(Item.attributes, Text).ilike(like),
            )
        )
        # An exact SKU (e.g. from a barcode scanner) always comes first.
        order.insert(0, case((func.lower(Item.sku) == term.lower(), 0), else_=1))
    if category_id is not None:
        stmt = stmt.where(Item.category_id == category_id)
    if low_stock:
        stmt = stmt.where(
            Item.track_stock, Item.reorder_level.is_not(None), Item.quantity <= Item.reorder_level
        )
    if in_stock:
        stmt = stmt.where(or_(~Item.track_stock, Item.quantity > 0))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(*order).limit(limit).offset(offset)).all()
    return ItemList(items=[item_out(i, user) for i in items], total=total)


@router.get("/meta", response_model=ItemMeta)
def item_meta(_: Viewer, db: DB):
    used_units = db.scalars(select(Item.unit).distinct()).all()
    units = DEFAULT_UNITS + sorted(u for u in used_units if u not in DEFAULT_UNITS)
    return ItemMeta(units=units)


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, user: Manager, db: DB):
    ensure_sku_free(db, body.sku)
    category = get_category(db, body.category_id)
    opening = body.quantity if body.track_stock else Decimal("0")
    if category and not category.allow_fractions and not is_whole(opening):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{category.name} items are counted in whole numbers, so the opening quantity must be one",
        )
    item = Item(**body.model_dump(exclude={"quantity"}), quantity=opening, is_active=True)
    db.add(item)
    db.flush()
    if opening > 0:
        db.add(
            StockMovement(
                item_id=item.id,
                kind=MovementKind.initial,
                quantity_change=opening,
                quantity_after=opening,
                unit_cost=body.cost_price,
                note="Opening stock",
                user_id=user.id,
            )
        )
    db.commit()
    db.refresh(item)
    return item_out(item, user)


@router.get("/{item_id}", response_model=ItemOut)
def read_item(item_id: int, user: Viewer, db: DB):
    return item_out(get_item(db, item_id), user)


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(item_id: int, body: ItemUpdate, user: Manager, db: DB):
    item = get_item(db, item_id)
    data = body.model_dump(exclude_unset=True)
    for field in REQUIRED_FIELDS:
        if data.get(field, ...) is None:
            data.pop(field)
    if "sku" in data:
        ensure_sku_free(db, data["sku"], item.id)
    if "category_id" in data:
        category = get_category(db, data["category_id"])
        if category and not category.allow_fractions and not is_whole(item.quantity):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{item.name} has {fmt_qty(item.quantity)} {item.unit} in stock, but {category.name} is "
                "counted in whole numbers. Adjust the stock to a whole number first.",
            )
    for field, value in data.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item_out(item, user)


@router.post("/{item_id}/stock", response_model=ItemOut)
def change_stock(item_id: int, body: StockChangeIn, user: Manager, db: DB):
    """Receive new stock, or adjust the count up/down (damage, recount, loss)."""
    item = get_item(db, item_id, for_update=True)
    if not item.track_stock:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This item doesn't track stock")
    if body.kind == "receive" and body.quantity <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quantity received must be more than zero")
    if body.quantity == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Adjustment can't be zero")
    if not item.allow_fractions and not is_whole(body.quantity):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"{item.name} is counted in whole {item.unit}; enter a whole number"
        )

    new_quantity = item.quantity + body.quantity
    if new_quantity < 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Only {fmt_qty(item.quantity)} {item.unit} on hand; can't remove {fmt_qty(-body.quantity)}",
        )
    item.quantity = new_quantity
    if body.kind == "receive" and body.unit_cost is not None:
        item.cost_price = body.unit_cost
    db.add(
        StockMovement(
            item_id=item.id,
            kind=body.kind,
            quantity_change=body.quantity,
            quantity_after=new_quantity,
            unit_cost=body.unit_cost,
            note=body.note,
            user_id=user.id,
        )
    )
    db.commit()
    db.refresh(item)
    return item_out(item, user)


@router.get("/{item_id}/movements", response_model=list[MovementOut])
def list_movements(
    item_id: int, user: Viewer, db: DB, limit: int = Query(100, ge=1, le=500)
):
    get_item(db, item_id)
    movements = db.scalars(
        select(StockMovement)
        .where(StockMovement.item_id == item_id)
        .order_by(StockMovement.id.desc())
        .limit(limit)
    ).all()
    out = [MovementOut.model_validate(m) for m in movements]
    if not has_perm(user, Perm.inventory_view_cost):
        for m in out:
            m.unit_cost = None
    return out
