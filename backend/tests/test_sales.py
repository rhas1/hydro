from app.models import Role

from .conftest import login, make_user
from .test_inventory import create_item


def stock(client, headers, item_id):
    return client.get(f"/api/items/{item_id}", headers=headers).json()["quantity"]


def test_sale_deducts_stock_and_numbers_invoices(client, manager, seller):
    water = create_item(client, manager)
    r = client.post(
        "/api/sales",
        json={"customer_name": "Alex", "lines": [{"item_id": water["id"], "quantity": "5"}]},
        headers=seller,
    )
    assert r.status_code == 201, r.text
    sale = r.json()
    assert sale["invoice_number"] == "INV-00001"
    assert sale["total"] == "5.00"
    assert sale["lines"][0]["name"] == "Mineral Water 1L"
    assert stock(client, manager, water["id"]) == "19.000"

    r = client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 1}]}, headers=seller)
    assert r.json()["invoice_number"] == "INV-00002"


def test_totals_with_discounts_and_tax(client, admin, manager):
    settings = client.get("/api/settings", headers=admin).json()
    client.put("/api/settings", json=settings | {"default_tax_rate": "8"}, headers=admin)
    a = create_item(client, manager, sale_price="12.50")
    b = create_item(client, manager, name="Labour", sku=None, category="Labour", fractions=True, track_stock=False, sale_price="30")
    r = client.post(
        "/api/sales",
        json={
            "lines": [
                {"item_id": a["id"], "quantity": "3", "discount": "2.50"},  # 37.50 - 2.50 = 35.00
                {"item_id": b["id"], "quantity": "1.5", "unit_price": "20"},  # 30.00
            ],
            "discount": "5",
        },
        headers=manager,
    )
    sale = r.json()
    assert sale["subtotal"] == "65.00"
    assert sale["discount"] == "5.00"
    assert sale["tax_rate"] == "8.00"
    assert sale["tax_amount"] == "4.80"
    assert sale["total"] == "64.80"


def test_cannot_oversell(client, manager, seller):
    water = create_item(client, manager, quantity="3")
    r = client.post(
        "/api/sales",
        json={"lines": [{"item_id": water["id"], "quantity": 2}, {"item_id": water["id"], "quantity": 2}]},
        headers=seller,
    )
    assert r.status_code == 409
    assert "Only 3 bottle" in r.json()["detail"]
    assert stock(client, manager, water["id"]) == "3.000"
    assert client.get("/api/sales", headers=manager).json()["total"] == 0


def test_sales_role_cannot_change_prices(client, manager, seller):
    water = create_item(client, manager)
    line = {"item_id": water["id"], "quantity": 1}
    for body in (
        {"lines": [line | {"unit_price": "0.50"}]},
        {"lines": [line | {"discount": "0.10"}]},
        {"lines": [line], "discount": "0.10"},
        {"lines": [line], "tax_rate": "5"},
    ):
        assert client.post("/api/sales", json=body, headers=seller).status_code == 403
    # Explicitly sending the list price is fine.
    assert client.post("/api/sales", json={"lines": [line | {"unit_price": "1.00"}]}, headers=seller).status_code == 201


def test_archived_items_cannot_be_sold(client, manager):
    water = create_item(client, manager)
    client.patch(f"/api/items/{water['id']}", json={"is_active": False}, headers=manager)
    r = client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 1}]}, headers=manager)
    assert r.status_code == 400


def test_void_restores_stock(client, manager, seller):
    water = create_item(client, manager)
    sale = client.post(
        "/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 4}]}, headers=seller
    ).json()
    assert client.post(f"/api/sales/{sale['id']}/void", json={"reason": "x"}, headers=seller).status_code == 403

    r = client.post(f"/api/sales/{sale['id']}/void", json={"reason": "Customer returned"}, headers=manager)
    assert r.status_code == 200
    assert r.json()["status"] == "void"
    assert r.json()["voided_by"]["full_name"] == "Manager User"
    assert stock(client, manager, water["id"]) == "24.000"

    again = client.post(f"/api/sales/{sale['id']}/void", json={"reason": "again"}, headers=manager)
    assert again.status_code == 400
    assert stock(client, manager, water["id"]) == "24.000"

    listing = client.get("/api/sales", headers=manager).json()
    assert listing["total"] == 1
    assert listing["total_amount"] == "0.00"


def test_sales_role_only_sees_own_sales(client, manager, seller):
    water = create_item(client, manager)
    other = login(client, make_user(Role.sales, "other@example.com").email)
    mine = client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 1}]}, headers=seller).json()
    theirs = client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 2}]}, headers=other).json()

    listing = client.get("/api/sales", headers=seller).json()
    assert [s["id"] for s in listing["sales"]] == [mine["id"]]
    assert client.get(f"/api/sales/{theirs['id']}", headers=seller).status_code == 404
    assert client.get(f"/api/sales/{theirs['id']}/invoice.pdf", headers=seller).status_code == 404
    assert client.get("/api/sales", headers=manager).json()["total"] == 2

    dash = client.get("/api/dashboard", headers=seller).json()
    assert dash["today_sales_count"] == 1
    assert dash["today_sales_total"] == "1.00"
    assert client.get("/api/dashboard", headers=manager).json()["today_sales_total"] == "3.00"


def test_sales_list_filters(client, manager):
    water = create_item(client, manager)
    client.post(
        "/api/sales",
        json={"customer_name": "Priya", "customer_phone": "0771234567", "lines": [{"item_id": water["id"], "quantity": 1}]},
        headers=manager,
    )
    client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 1}]}, headers=manager)

    def count(**params):
        return client.get("/api/sales", params=params, headers=manager).json()["total"]

    assert count(q="priya") == 1
    assert count(q="077123") == 1
    assert count(q="INV-00002") == 1
    assert count(status="void") == 0
    assert count(date_from="2000-01-01", date_to="2000-01-02") == 0


def test_invoice_pdf(client, admin, manager):
    settings = client.get("/api/settings", headers=admin).json()
    client.put(
        "/api/settings",
        json=settings | {"business_name": "Hydro Café ✓", "address": "1 Main St\nColombo", "invoice_footer": "Thank you!"},
        headers=admin,
    )
    water = create_item(client, manager)
    sale = client.post(
        "/api/sales",
        json={"customer_name": "Zoë", "notes": "Deliver Monday", "lines": [{"item_id": water["id"], "quantity": 2, "discount": "0.5"}]},
        headers=manager,
    ).json()
    r = client.get(f"/api/sales/{sale['id']}/invoice.pdf", headers=manager)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")

    client.post(f"/api/sales/{sale['id']}/void", json={"reason": "Test"}, headers=manager)
    assert client.get(f"/api/sales/{sale['id']}/invoice.pdf", headers=manager).content.startswith(b"%PDF")


def test_settings_permissions_and_validation(client, admin, manager):
    settings = client.get("/api/settings", headers=manager).json()
    assert client.put("/api/settings", json=settings, headers=manager).status_code == 403
    r = client.put("/api/settings", json=settings | {"timezone": "Mars/Base"}, headers=admin)
    assert r.status_code == 400
    r = client.put("/api/settings", json=settings | {"timezone": "Asia/Colombo", "currency": "lkr"}, headers=admin)
    assert r.json()["currency"] == "LKR"


def test_api_responses_are_not_cached(client, admin):
    assert client.get("/api/settings", headers=admin).headers["cache-control"] == "no-store"


def test_cart_with_archived_item_names_it(client, manager):
    water = create_item(client, manager)
    client.patch(f"/api/items/{water['id']}", json={"is_active": False}, headers=manager)
    r = client.post("/api/sales", json={"lines": [{"item_id": water["id"], "quantity": 1}]}, headers=manager)
    assert r.status_code == 400
    assert "Mineral Water 1L can no longer be sold" in r.json()["detail"]


def test_last_unit_cannot_be_sold_twice(client, manager, seller):
    water = create_item(client, manager, quantity="1")
    line = {"lines": [{"item_id": water["id"], "quantity": 1}]}
    assert client.post("/api/sales", json=line, headers=seller).status_code == 201
    r = client.post("/api/sales", json=line, headers=manager)
    assert r.status_code == 409
    assert "Only 0 bottle of Mineral Water 1L in stock" in r.json()["detail"]
