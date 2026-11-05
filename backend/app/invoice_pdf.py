"""Server-side A4 invoice PDF, so invoices can be downloaded or shared from a phone."""

from decimal import Decimal

from fpdf import FPDF, FontFace
from fpdf.enums import XPos, YPos

from .models import BusinessSettings, Sale, SaleStatus
from .utils import PAYMENT_LABELS, fmt_qty, zone

NAVY = (11, 37, 64)
BRAND = (7, 139, 189)
MUTED = (100, 116, 139)
LIGHT = (236, 248, 253)
RED = (220, 38, 38)


def _t(text: str | None) -> str:
    # The built-in PDF fonts are Latin-1 only.
    return (text or "").encode("latin-1", "replace").decode("latin-1")


def render_invoice(sale: Sale, settings: BusinessSettings) -> bytes:
    cur = settings.currency

    def m(value: Decimal) -> str:
        return f"{value:,.2f}"

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_title(f"Invoice {sale.invoice_number}")
    pdf.set_author(_t(settings.business_name))
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Brand bar
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, pdf.w, 4, style="F")

    # Business (left) and invoice title (right)
    top = pdf.get_y() + 2
    pdf.set_xy(15, top)
    pdf.set_text_color(*NAVY)
    pdf.set_font("helvetica", "B", 17)
    pdf.multi_cell(110, 8, _t(settings.business_name), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    details = [settings.address, settings.phone, settings.email]
    if settings.tax_id:
        details.append(f"Tax ID: {settings.tax_id}")
    for line in filter(None, details):
        pdf.multi_cell(110, 4.6, _t(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    left_bottom = pdf.get_y()

    pdf.set_xy(125, top)
    pdf.set_font("helvetica", "B", 22)
    pdf.set_text_color(*BRAND)
    pdf.cell(70, 10, "INVOICE", align="R", new_x=XPos.LEFT, new_y=YPos.NEXT)
    created = sale.created_at.astimezone(zone(settings.timezone))
    meta = [
        ("Invoice no.", sale.invoice_number),
        ("Date", created.strftime("%d %b %Y, %H:%M")),
        ("Payment", PAYMENT_LABELS.get(sale.payment_method, sale.payment_method)),
    ]
    for label, value in meta:
        pdf.set_x(125)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(28, 5.2, label)
        pdf.set_font("helvetica", "B", 9)
        pdf.set_text_color(*NAVY)
        pdf.cell(42, 5.2, _t(value), align="R", new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_y(max(left_bottom, pdf.get_y()) + 6)

    # Bill to
    customer = [sale.customer_name, sale.customer_phone, sale.customer_email, sale.customer_address]
    if any(customer):
        pdf.set_font("helvetica", "B", 8)
        pdf.set_text_color(*BRAND)
        pdf.cell(0, 5, "BILL TO", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*NAVY)
        for i, line in enumerate(filter(None, customer)):
            pdf.set_font("helvetica", "B" if i == 0 and sale.customer_name else "", 10 if i == 0 else 9)
            pdf.multi_cell(110, 5, _t(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(4)

    # Line items
    has_discounts = any(line.discount for line in sale.lines)
    headings = ["#", "Item", "Qty", f"Price ({cur})"]
    widths = [8, 84 if has_discounts else 106, 24, 28]
    align = ["CENTER", "LEFT", "RIGHT", "RIGHT"]
    if has_discounts:
        headings.append("Discount")
        widths.append(22)
        align.append("RIGHT")
    headings.append(f"Amount ({cur})")
    widths.append(30)
    align.append("RIGHT")

    pdf.set_text_color(*NAVY)
    pdf.set_font("helvetica", "", 9)
    pdf.set_draw_color(203, 213, 225)
    pdf.set_fill_color(255, 255, 255)  # alternate rows: white / LIGHT
    with pdf.table(
        col_widths=widths,
        text_align=align,
        line_height=5.5,
        padding=(1.8, 1.5),
        borders_layout="HORIZONTAL_LINES",
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=NAVY),
        cell_fill_color=LIGHT,
        cell_fill_mode="ROWS",
    ) as table:
        row = table.row()
        for heading in headings:
            row.cell(_t(heading))
        for n, line in enumerate(sale.lines, 1):
            row = table.row()
            row.cell(str(n))
            row.cell(_t(f"{line.name}\nSKU {line.sku}" if line.sku else line.name))
            row.cell(_t(f"{fmt_qty(line.quantity)} {line.unit}"))
            row.cell(m(line.unit_price))
            if has_discounts:
                row.cell(m(line.discount) if line.discount else "-")
            row.cell(m(line.line_total))

    # Totals
    pdf.ln(4)
    totals = [("Subtotal", m(sale.subtotal))]
    if sale.discount:
        totals.append(("Discount", f"-{m(sale.discount)}"))
    if sale.tax_rate or sale.tax_amount:
        totals.append((f"Tax ({fmt_qty(sale.tax_rate)}%)", m(sale.tax_amount)))
    for label, value in totals:
        pdf.set_x(120)
        pdf.set_font("helvetica", "", 9.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(40, 6, label)
        pdf.set_text_color(*NAVY)
        pdf.cell(35, 6, value, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(120)
    pdf.set_fill_color(*BRAND)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(40, 9, "  Total", fill=True)
    pdf.cell(35, 9, f"{_t(cur)} {m(sale.total)}  ", align="R", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    if sale.notes:
        pdf.ln(6)
        pdf.set_font("helvetica", "B", 8)
        pdf.set_text_color(*BRAND)
        pdf.cell(0, 5, "NOTES", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*NAVY)
        pdf.multi_cell(0, 4.8, _t(sale.notes), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    if settings.invoice_footer:
        pdf.ln(8)
        pdf.set_font("helvetica", "I", 9)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(0, 4.8, _t(settings.invoice_footer), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    if sale.status == SaleStatus.void:
        pdf.set_font("helvetica", "B", 90)
        half_width = pdf.get_string_width("VOID") / 2
        half_cap = 90 * 0.72 * 0.3528 / 2  # cap height in mm
        with pdf.local_context(text_color=RED, fill_opacity=0.18):
            with pdf.rotation(30, x=pdf.w / 2, y=pdf.h / 2):
                pdf.text(pdf.w / 2 - half_width, pdf.h / 2 + half_cap, "VOID")
        pdf.set_y(pdf.h - 30)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*RED)
        pdf.multi_cell(0, 4.8, _t(f"Voided: {sale.void_reason}"), align="C")

    return bytes(pdf.output())
