from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

Money = Numeric(12, 2)
Qty = Numeric(14, 3)


class Role(StrEnum):
    admin = "admin"
    manager = "manager"
    sales = "sales"


class MovementKind(StrEnum):
    initial = "initial"  # opening quantity when the item was created
    receive = "receive"  # stock added (purchase, delivery, production)
    adjust = "adjust"  # manual correction (damage, count, loss)
    sale = "sale"
    void = "void"  # stock returned when a sale is voided


class SaleStatus(StrEnum):
    completed = "completed"
    void = "void"


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class User(Timestamped, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=Role.sales)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Tokens issued before this are rejected, so a password change signs out other sessions.
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Item(Timestamped, Base):
    __tablename__ = "items"
    __table_args__ = (CheckConstraint("quantity >= 0", name="item_quantity_non_negative"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str | None] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    unit: Mapped[str] = mapped_column(String(32), default="pcs")
    description: Mapped[str | None] = mapped_column(Text)
    cost_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    sale_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"))
    reorder_level: Mapped[Decimal | None] = mapped_column(Qty)
    # False for services / non-stock lines (labour, delivery fee, ...)
    track_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    # Free-form attributes so any kind of product can be described
    # (size, colour, brand, expiry, serial number, ...).
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StockMovement(Timestamped, Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    quantity_change: Mapped[Decimal] = mapped_column(Qty)
    quantity_after: Mapped[Decimal] = mapped_column(Qty)
    unit_cost: Mapped[Decimal | None] = mapped_column(Money)
    note: Mapped[str | None] = mapped_column(Text)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(lazy="joined")


class Sale(Timestamped, Base):
    __tablename__ = "sales"
    __table_args__ = (Index("ix_sales_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[str] = mapped_column(String(20), default=SaleStatus.completed, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_phone: Mapped[str | None] = mapped_column(String(64))
    customer_email: Mapped[str | None] = mapped_column(String(255))
    customer_address: Mapped[str | None] = mapped_column(Text)
    payment_method: Mapped[str] = mapped_column(String(32), default="cash")
    subtotal: Mapped[Decimal] = mapped_column(Money)
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    void_reason: Mapped[str | None] = mapped_column(Text)

    lines: Mapped[list["SaleLine"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleLine.id"
    )
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="joined")
    voided_by: Mapped[User | None] = relationship(foreign_keys=[voided_by_id], lazy="joined")


class SaleLine(Base):
    __tablename__ = "sale_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    # Snapshot of the item at the time of sale, so invoices never change
    # when the item is later renamed or repriced.
    sku: Mapped[str | None] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))
    unit: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Qty)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Money)

    sale: Mapped[Sale] = relationship(back_populates="lines")


class BusinessSettings(Base):
    """Single-row table (id = 1) holding business details shown on invoices."""

    __tablename__ = "business_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    business_name: Mapped[str] = mapped_column(String(255), default="My Business")
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(64))
    email: Mapped[str | None] = mapped_column(String(255))
    tax_id: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    default_tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    invoice_prefix: Mapped[str] = mapped_column(String(16), default="INV-")
    next_invoice_number: Mapped[int] = mapped_column(Integer, default=1)
    invoice_footer: Mapped[str | None] = mapped_column(Text)
