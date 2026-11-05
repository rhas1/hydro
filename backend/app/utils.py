from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CENT = Decimal("0.01")

PAYMENT_LABELS = {
    "cash": "Cash",
    "card": "Card",
    "bank_transfer": "Bank transfer",
    "mobile_payment": "Mobile payment",
    "cheque": "Cheque",
    "credit": "Credit",
    "other": "Other",
}


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def fmt_qty(value: Decimal) -> str:
    text = f"{value:,.3f}".rstrip("0").rstrip(".")
    return text or "0"


def zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")
