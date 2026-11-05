"""Role-based access control.

Every protected endpoint asks for a permission, never a role, so changing who
can do what only means editing ROLE_PERMISSIONS below.
"""

from enum import StrEnum

from .models import Role


class Perm(StrEnum):
    users_manage = "users.manage"
    settings_manage = "settings.manage"
    inventory_view = "inventory.view"
    inventory_manage = "inventory.manage"  # create/edit items, receive/adjust stock
    inventory_view_cost = "inventory.view_cost"
    sales_create = "sales.create"
    sales_view_all = "sales.view_all"  # otherwise only the user's own sales
    sales_discount = "sales.discount"  # change prices / give discounts at checkout
    sales_void = "sales.void"


ROLE_PERMISSIONS: dict[Role, frozenset[Perm]] = {
    Role.admin: frozenset(Perm),
    Role.manager: frozenset(
        {
            Perm.inventory_view,
            Perm.inventory_manage,
            Perm.inventory_view_cost,
            Perm.sales_create,
            Perm.sales_view_all,
            Perm.sales_discount,
            Perm.sales_void,
        }
    ),
    Role.sales: frozenset({Perm.inventory_view, Perm.sales_create}),
}


def permissions_for(role: str) -> frozenset[Perm]:
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return frozenset()
