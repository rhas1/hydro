from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import DB, require
from ..models import Category, Item, User
from ..permissions import Perm
from ..schemas import CategoryIn, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["inventory"])

Viewer = Annotated[User, Depends(require(Perm.inventory_view))]
Manager = Annotated[User, Depends(require(Perm.inventory_manage))]


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return category


def ensure_name_free(db: Session, name: str, category_id: int | None = None) -> None:
    clash = db.scalar(
        select(Category.id).where(func.lower(Category.name) == name.lower(), Category.id != category_id)
    )
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, f"There is already a category called {name}")


def category_out(db: Session, category: Category) -> CategoryOut:
    count = db.scalar(
        select(func.count()).select_from(Item).where(Item.category_id == category.id, Item.is_active)
    )
    return CategoryOut(
        id=category.id, name=category.name, allow_fractions=category.allow_fractions, item_count=count
    )


def ensure_whole_stock(db: Session, category: Category) -> None:
    """Refuse to make a category whole-numbers-only while its items hold part quantities."""
    names = db.scalars(
        select(Item.name)
        .where(Item.category_id == category.id, Item.quantity != func.trunc(Item.quantity))
        .order_by(Item.name)
    ).all()
    if names:
        listed = ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else "")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{listed} {'has' if len(names) == 1 else 'have'} part quantities in stock. "
            "Adjust the stock to whole numbers first.",
        )


@router.get("", response_model=list[CategoryOut])
def list_categories(_: Viewer, db: DB):
    rows = db.execute(
        select(Category, func.count(Item.id))
        .outerjoin(Item, (Item.category_id == Category.id) & Item.is_active)
        .group_by(Category.id)
        .order_by(func.lower(Category.name))
    ).all()
    return [
        CategoryOut(id=c.id, name=c.name, allow_fractions=c.allow_fractions, item_count=count)
        for c, count in rows
    ]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryIn, _: Manager, db: DB):
    ensure_name_free(db, body.name)
    category = Category(name=body.name, allow_fractions=body.allow_fractions)
    db.add(category)
    db.commit()
    return category_out(db, category)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryUpdate, _: Manager, db: DB):
    category = get_category(db, category_id)
    if body.name is not None:
        ensure_name_free(db, body.name, category.id)
        category.name = body.name
    if body.allow_fractions is False and category.allow_fractions:
        ensure_whole_stock(db, category)
    if body.allow_fractions is not None:
        category.allow_fractions = body.allow_fractions
    db.commit()
    return category_out(db, category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, _: Manager, db: DB):
    """Deletes the category; its items stay, just without a category."""
    db.delete(get_category(db, category_id))
    db.commit()
