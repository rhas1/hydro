from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    computed_field,
    field_validator,
)

from .models import Role


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def opt_str(max_length: int | None = None):
    """Optional text field; blank input is stored as NULL."""
    return Annotated[
        Annotated[str, StringConstraints(max_length=max_length)] | None,
        BeforeValidator(_blank_to_none),
    ]


OptStr = opt_str()
ReqStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
def _bcrypt_limit(v: str) -> str:
    if len(v.encode()) > 72:
        raise ValueError("must be at most 72 characters")
    return v


Password = Annotated[str, StringConstraints(min_length=8), AfterValidator(_bcrypt_limit)]
LongText = opt_str(2000)
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Qty = Annotated[Decimal, Field(max_digits=14, decimal_places=3)]
Rate = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]

PaymentMethod = Literal[
    "cash", "card", "bank_transfer", "mobile_payment", "cheque", "credit", "other"
]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- auth/users


class UserRef(ORM):
    id: int
    full_name: str


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime


class MeOut(UserOut):
    permissions: list[str]


class LoginIn(BaseModel):
    email: Annotated[str, StringConstraints(max_length=255)]
    password: Annotated[str, StringConstraints(max_length=256)]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: Password


class UserCreate(BaseModel):
    email: EmailStr
    full_name: ReqStr
    role: Role = Role.sales
    password: Password


class UserUpdate(BaseModel):
    full_name: ReqStr | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: Password | None = None


# ---------------------------------------------------------------- inventory


def _clean_attributes(v: dict[str, str] | None) -> dict[str, str] | None:
    if v is None:
        return v
    cleaned = {k.strip(): val.strip() for k, val in v.items() if k.strip()}
    if len(cleaned) > 50:
        raise ValueError("At most 50 attributes per item")
    if any(len(k) > 60 or len(val) > 500 for k, val in cleaned.items()):
        raise ValueError("Attribute names are limited to 60 characters and values to 500")
    return cleaned


class ItemFields(BaseModel):
    sku: opt_str(64) = None
    name: ReqStr
    category: opt_str(100) = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)] = "pcs"
    description: LongText = None
    cost_price: Money = Decimal("0")
    sale_price: Money = Decimal("0")
    reorder_level: Annotated[Qty | None, Field(ge=0)] = None
    track_stock: bool = True
    attributes: dict[str, str] = Field(default_factory=dict)

    _clean_attributes = field_validator("attributes")(_clean_attributes)


class ItemCreate(ItemFields):
    quantity: Annotated[Qty, Field(ge=0)] = Decimal("0")


class ItemUpdate(BaseModel):
    sku: opt_str(64) = None
    name: ReqStr | None = None
    category: opt_str(100) = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)] | None = None
    description: LongText = None
    cost_price: Money | None = None
    sale_price: Money | None = None
    reorder_level: Annotated[Qty | None, Field(ge=0)] = None
    track_stock: bool | None = None
    attributes: dict[str, str] | None = None
    is_active: bool | None = None

    _clean_attributes = field_validator("attributes")(_clean_attributes)


class ItemOut(ORM):
    id: int
    sku: str | None
    name: str
    category: str | None
    unit: str
    description: str | None
    cost_price: Decimal | None  # None when the caller may not see costs
    sale_price: Decimal
    quantity: Decimal
    reorder_level: Decimal | None
    track_stock: bool
    attributes: dict[str, str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def low_stock(self) -> bool:
        return (
            self.track_stock
            and self.reorder_level is not None
            and self.quantity <= self.reorder_level
        )


class ItemList(BaseModel):
    items: list[ItemOut]
    total: int


class ItemMeta(BaseModel):
    categories: list[str]
    units: list[str]


class StockChangeIn(BaseModel):
    kind: Literal["receive", "adjust"]
    quantity: Qty
    unit_cost: Money | None = None
    note: opt_str(500) = None


class MovementOut(ORM):
    id: int
    kind: str
    quantity_change: Decimal
    quantity_after: Decimal
    unit_cost: Decimal | None
    note: str | None
    sale_id: int | None
    created_at: datetime
    user: UserRef


# ---------------------------------------------------------------- sales


class SaleLineIn(BaseModel):
    item_id: int
    quantity: Annotated[Qty, Field(gt=0)]
    # Omit to use the item's current sale price.
    unit_price: Money | None = None
    discount: Money = Decimal("0")


class SaleCreate(BaseModel):
    customer_name: opt_str(255) = None
    customer_phone: opt_str(64) = None
    customer_email: opt_str(255) = None
    customer_address: LongText = None
    payment_method: PaymentMethod = "cash"
    discount: Money = Decimal("0")
    # Omit to use the default tax rate from business settings.
    tax_rate: Rate | None = None
    notes: LongText = None
    lines: list[SaleLineIn] = Field(min_length=1, max_length=200)


class SaleLineOut(ORM):
    id: int
    item_id: int
    sku: str | None
    name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    line_total: Decimal


class SaleSummary(ORM):
    id: int
    invoice_number: str
    status: str
    customer_name: str | None
    payment_method: str
    total: Decimal
    created_at: datetime
    created_by: UserRef


class SaleOut(SaleSummary):
    customer_phone: str | None
    customer_email: str | None
    customer_address: str | None
    subtotal: Decimal
    discount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    notes: str | None
    voided_at: datetime | None
    voided_by: UserRef | None
    void_reason: str | None
    lines: list[SaleLineOut]


class SaleList(BaseModel):
    sales: list[SaleSummary]
    total: int
    # Sum of completed (non-void) sales matching the filters.
    total_amount: Decimal


class VoidIn(BaseModel):
    reason: ReqStr


# ---------------------------------------------------------------- settings


class SettingsOut(ORM):
    business_name: str
    address: str | None
    phone: str | None
    email: str | None
    tax_id: str | None
    currency: str
    timezone: str
    default_tax_rate: Decimal
    invoice_prefix: str
    next_invoice_number: int
    invoice_footer: str | None


class SettingsUpdate(BaseModel):
    business_name: ReqStr
    address: opt_str(500) = None
    phone: opt_str(64) = None
    email: opt_str(255) = None
    tax_id: opt_str(64) = None
    currency: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=8)]
    timezone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    default_tax_rate: Rate = Decimal("0")
    # Ends up in file names and the PDF download header, so keep it plain.
    invoice_prefix: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=16, pattern=r"^[A-Za-z0-9._/-]*$")
    ] = "INV-"
    next_invoice_number: Annotated[int, Field(ge=1)]
    invoice_footer: opt_str(500) = None


# ---------------------------------------------------------------- dashboard


class DashboardOut(BaseModel):
    today_sales_count: int
    today_sales_total: Decimal
    active_items: int
    low_stock_count: int
    low_stock: list[ItemOut]
    recent_sales: list[SaleSummary]
