"""category allow_fractions

Adds a per-category choice between whole-number and fractional quantities.
Existing categories allow fractions only if their items have already used them.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-05
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'categories',
        sa.Column('allow_fractions', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute("""
        UPDATE categories c SET allow_fractions = true
        WHERE EXISTS (
            SELECT 1 FROM items i
            WHERE i.category_id = c.id AND (
                i.quantity <> trunc(i.quantity)
                OR EXISTS (SELECT 1 FROM stock_movements m
                           WHERE m.item_id = i.id AND m.quantity_change <> trunc(m.quantity_change))
                OR EXISTS (SELECT 1 FROM sale_lines l
                           WHERE l.item_id = i.id AND l.quantity <> trunc(l.quantity))
            )
        )
    """)


def downgrade() -> None:
    op.drop_column('categories', 'allow_fractions')
