"""categories table

Replaces the free-text items.category column with a managed categories table.
Existing category names are carried over (merged ignoring case).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('uq_categories_name_lower', 'categories', [sa.text('lower(name)')], unique=True)
    op.add_column('items', sa.Column('category_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'items', 'categories', ['category_id'], ['id'], ondelete='SET NULL')
    op.create_index(op.f('ix_items_category_id'), 'items', ['category_id'], unique=False)

    op.execute("""
        INSERT INTO categories (name)
        SELECT DISTINCT ON (lower(trim(category))) trim(category)
        FROM items
        WHERE category IS NOT NULL AND trim(category) <> ''
        ORDER BY lower(trim(category)), trim(category)
    """)
    op.execute("""
        UPDATE items SET category_id = c.id
        FROM categories c
        WHERE lower(trim(items.category)) = lower(c.name)
    """)

    op.drop_index(op.f('ix_items_category'), table_name='items')
    op.drop_column('items', 'category')


def downgrade() -> None:
    op.add_column('items', sa.Column('category', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_items_category'), 'items', ['category'], unique=False)
    op.execute("UPDATE items SET category = c.name FROM categories c WHERE items.category_id = c.id")
    op.drop_index(op.f('ix_items_category_id'), table_name='items')
    op.drop_constraint('items_category_id_fkey', 'items', type_='foreignkey')
    op.drop_column('items', 'category_id')
    op.drop_index('uq_categories_name_lower', table_name='categories')
    op.drop_table('categories')
