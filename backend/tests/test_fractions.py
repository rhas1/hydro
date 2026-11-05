"""Whole-number vs fractional quantities, chosen per category."""

from .test_inventory import category_id, create_item


def sell(client, headers, item_id, quantity):
    return client.post("/api/sales", json={"lines": [{"item_id": item_id, "quantity": quantity}]}, headers=headers)


def test_categories_default_to_whole_numbers(client, manager):
    pcs = client.post("/api/categories", json={"name": "Apparel"}, headers=manager).json()
    kg = client.post("/api/categories", json={"name": "Bulk", "allow_fractions": True}, headers=manager).json()
    assert pcs["allow_fractions"] is False
    assert kg["allow_fractions"] is True


def test_whole_number_items_reject_part_quantities_everywhere(client, manager):
    shirt = create_item(client, manager, name="T-shirt", sku="TS", category="Apparel", unit="pcs", quantity="10")
    assert shirt["allow_fractions"] is False

    r = sell(client, manager, shirt["id"], "1.5")
    assert r.status_code == 400 and "only be sold in whole numbers" in r.json()["detail"]
    assert sell(client, manager, shirt["id"], "2").status_code == 201

    stock = f"/api/items/{shirt['id']}/stock"
    assert client.post(stock, json={"kind": "receive", "quantity": "0.5"}, headers=manager).status_code == 400
    assert client.post(stock, json={"kind": "adjust", "quantity": "-0.25"}, headers=manager).status_code == 400
    assert client.post(stock, json={"kind": "receive", "quantity": "3"}, headers=manager).json()["quantity"] == "11.000"

    r = client.post(
        "/api/items",
        json={"name": "Socks", "category_id": category_id(client, manager, "Apparel"), "quantity": "2.5"},
        headers=manager,
    )
    assert r.status_code == 400 and "opening quantity" in r.json()["detail"]


def test_fractional_and_uncategorised_items_accept_part_quantities(client, manager):
    rice = create_item(client, manager, name="Rice", sku="R", category="Bulk", fractions=True, unit="kg", quantity="10")
    loose = create_item(client, manager, name="Loose nails", sku="N", category=None, unit="kg", quantity="5")
    assert rice["allow_fractions"] is True and loose["allow_fractions"] is True
    assert sell(client, manager, rice["id"], "2.5").status_code == 201
    assert sell(client, manager, loose["id"], "0.75").status_code == 201


def test_switching_to_whole_numbers_needs_whole_stock(client, manager):
    rice = create_item(client, manager, name="Rice", sku="R", category="Bulk", fractions=True, unit="kg", quantity="4.5")
    bulk = rice["category"]["id"]

    r = client.patch(f"/api/categories/{bulk}", json={"allow_fractions": False}, headers=manager)
    assert r.status_code == 409
    assert "Rice has part quantities in stock" in r.json()["detail"]

    client.post(f"/api/items/{rice['id']}/stock", json={"kind": "adjust", "quantity": "-0.5"}, headers=manager)
    r = client.patch(f"/api/categories/{bulk}", json={"allow_fractions": False}, headers=manager)
    assert r.status_code == 200 and r.json()["allow_fractions"] is False
    assert client.get(f"/api/items/{rice['id']}", headers=manager).json()["allow_fractions"] is False
    # Switching back is always fine.
    assert client.patch(f"/api/categories/{bulk}", json={"allow_fractions": True}, headers=manager).status_code == 200


def test_moving_part_stock_into_whole_category_is_refused(client, manager):
    rice = create_item(client, manager, name="Rice", sku="R", category=None, unit="kg", quantity="4.5")
    apparel = category_id(client, manager, "Apparel")
    r = client.patch(f"/api/items/{rice['id']}", json={"category_id": apparel}, headers=manager)
    assert r.status_code == 400
    assert "Rice has 4.5 kg in stock" in r.json()["detail"]
