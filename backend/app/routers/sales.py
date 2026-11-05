from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..deps import DB, get_business_settings, has_perm, require
from ..invoice_pdf import render_invoice
from ..models import Item, MovementKind, Sale, SaleLine, SaleStatus, StockMovement, User
from ..permissions import Perm
from ..schemas import SaleCreate, SaleList, SaleOut, VoidIn
from ..utils import fmt_qty, money, zone

router = APIRouter(prefix="/sales", tags=["sales"])

Seller = Annotated[User, Depends(require(Perm.sales_create))]
Voider = Annotated[User, Depends(require(Perm.sales_void))]


def visible_to(user: User):
    """Users without sales.view_all only ever see the sales they made."""
    return [] if has_perm(user, Perm.sales_view_all) else [Sale.created_by_id == user.id]


def load_sale(db: Session, sale_id: int, user: User) -> Sale:
    sale = db.scalars(
        select(Sale)
        .options(selectinload(Sale.lines))
        .where(Sale.id == sale_id, *visible_to(user))
        # Re-read after writes so responses show stored (rounded) values.
        .execution_options(populate_existing=True)
    ).one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    return sale


def lock_items(db: Session, item_ids) -> dict[int, Item]:
    # Lock in id order so concurrent checkouts can't deadlock each other.
    stmt = select(Item).where(Item.id.in_(sorted(item_ids))).order_by(Item.id).with_for_update()
    return {item.id: item for item in db.scalars(stmt)}


def forbid_pricing_change():
    raise HTTPException(
        status.HTTP_403_FORBIDDEN, "You don't have permission to change prices or give discounts"
    )


@router.post("", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
def create_sale(body: SaleCreate, user: Seller, db: DB):
    can_discount = has_perm(user, Perm.sales_discount)
    # Locking the settings row serialises invoice numbering.
    settings = get_business_settings(db, for_update=True)

    items = lock_items(db, {line.item_id for line in body.lines})
    if any(items.get(line.item_id) is None or not items[line.item_id].is_active for line in body.lines):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Some items are no longer available")

    needed: dict[int, Decimal] = defaultdict(Decimal)
    for line in body.lines:
        needed[line.item_id] += line.quantity
    for item_id, qty in needed.items():
        item = items[item_id]
        if item.track_stock and qty > item.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Only {fmt_qty(item.quantity)} {item.unit} of {item.name} in stock",
            )

    lines: list[SaleLine] = []
    subtotal = Decimal("0")
    for line in body.lines:
        item = items[line.item_id]
        unit_price = item.sale_price if line.unit_price is None else line.unit_price
        if not can_discount and (unit_price != item.sale_price or line.discount > 0):
            forbid_pricing_change()
        gross = money(line.quantity * unit_price)
        if line.discount > gross:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Discount on {item.name} is more than the line amount"
            )
        line_total = gross - line.discount
        subtotal += line_total
        lines.append(
            SaleLine(
                item_id=item.id,
                sku=item.sku,
                name=item.name,
                unit=item.unit,
                quantity=line.quantity,
                unit_price=unit_price,
                discount=line.discount,
                line_total=line_total,
            )
        )

    tax_rate = settings.default_tax_rate if body.tax_rate is None else body.tax_rate
    if not can_discount and (body.discount > 0 or tax_rate != settings.default_tax_rate):
        forbid_pricing_change()
    if body.discount > subtotal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discount is more than the subtotal")
    taxable = subtotal - body.discount
    tax_amount = money(taxable * tax_rate / 100)

    # Skip numbers already taken (e.g. if an admin rewound the counter).
    while True:
        invoice_number = f"{settings.invoice_prefix}{settings.next_invoice_number:05d}"
        settings.next_invoice_number += 1
        if not db.scalar(select(Sale.id).where(Sale.invoice_number == invoice_number)):
            break

    sale = Sale(
        invoice_number=invoice_number,
        status=SaleStatus.completed,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_email=body.customer_email,
        customer_address=body.customer_address,
        payment_method=body.payment_method,
        subtotal=subtotal,
        discount=body.discount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=taxable + tax_amount,
        notes=body.notes,
        created_by_id=user.id,
        lines=lines,
    )
    db.add(sale)
    db.flush()

    for item_id, qty in needed.items():
        item = items[item_id]
        if not item.track_stock:
            continue
        item.quantity -= qty
        db.add(
            StockMovement(
                item_id=item.id,
                kind=MovementKind.sale,
                quantity_change=-qty,
                quantity_after=item.quantity,
                sale_id=sale.id,
                note=invoice_number,
                user_id=user.id,
            )
        )
    db.commit()
    return load_sale(db, sale.id, user)


@router.get("", response_model=SaleList)
def list_sales(
    user: Seller,
    db: DB,
    q: str | None = None,
    status_: Annotated[Literal["completed", "void"] | None, Query(alias="status")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    conds = visible_to(user)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(
            or_(
                Sale.invoice_number.ilike(like),
                Sale.customer_name.ilike(like),
                Sale.customer_phone.ilike(like),
            )
        )
    if status_:
        conds.append(Sale.status == status_)
    tz = zone(get_business_settings(db).timezone)
    if date_from:
        conds.append(Sale.created_at >= datetime.combine(date_from, time.min, tz))
    if date_to:
        conds.append(Sale.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tz))

    count, total_amount = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(Sale.total).filter(Sale.status == SaleStatus.completed), 0),
        ).where(*conds)
    ).one()
    sales = db.scalars(
        select(Sale).where(*conds).order_by(Sale.id.desc()).limit(limit).offset(offset)
    ).all()
    return SaleList(sales=sales, total=count, total_amount=money(total_amount))


@router.get("/{sale_id}", response_model=SaleOut)
def read_sale(sale_id: int, user: Seller, db: DB):
    return load_sale(db, sale_id, user)


@router.get("/{sale_id}/invoice.pdf")
def invoice_pdf(sale_id: int, user: Seller, db: DB):
    sale = load_sale(db, sale_id, user)
    pdf = render_invoice(sale, get_business_settings(db))
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{sale.invoice_number}.pdf"'},
    )


@router.post("/{sale_id}/void", response_model=SaleOut)
def void_sale(sale_id: int, body: VoidIn, user: Voider, db: DB):
    sale = db.scalars(
        select(Sale).where(Sale.id == sale_id).with_for_update(of=Sale)
    ).one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    if sale.status == SaleStatus.void:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sale is already void")

    # Put back exactly what the sale took out.
    taken = db.scalars(
        select(StockMovement).where(
            StockMovement.sale_id == sale.id, StockMovement.kind == MovementKind.sale
        )
    ).all()
    items = lock_items(db, {m.item_id for m in taken})
    for m in taken:
        item = items[m.item_id]
        item.quantity -= m.quantity_change
        db.add(
            StockMovement(
                item_id=item.id,
                kind=MovementKind.void,
                quantity_change=-m.quantity_change,
                quantity_after=item.quantity,
                sale_id=sale.id,
                note=f"{sale.invoice_number} voided: {body.reason}",
                user_id=user.id,
            )
        )

    sale.status = SaleStatus.void
    sale.voided_at = datetime.now(UTC)
    sale.voided_by_id = user.id
    sale.void_reason = body.reason
    db.commit()
    return load_sale(db, sale.id, user)
