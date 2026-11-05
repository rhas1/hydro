def create_item(client, headers, **overrides):
    body = {
        "name": "Mineral Water 1L",
        "sku": "WAT-1L",
        "category": "Beverages",
        "unit": "bottle",
        "cost_price": "0.40",
        "sale_price": "1.00",
        "quantity": "24",
        "reorder_level": "10",
        "attributes": {"Brand": "Aqua", "Size": "1L"},
    } | overrides
    r = client.post("/api/items", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_manager_creates_item_with_opening_stock(client, manager):
    item = create_item(client, manager)
    assert item["quantity"] == "24.000"
    assert item["attributes"] == {"Brand": "Aqua", "Size": "1L"}
    assert item["low_stock"] is False

    moves = client.get(f"/api/items/{item['id']}/movements", headers=manager).json()
    assert [(m["kind"], m["quantity_change"]) for m in moves] == [("initial", "24.000")]


def test_sales_role_can_view_but_not_edit_and_cannot_see_cost(client, manager, seller):
    item = create_item(client, manager)
    assert client.post("/api/items", json={"name": "X"}, headers=seller).status_code == 403
    assert client.patch(f"/api/items/{item['id']}", json={"name": "Y"}, headers=seller).status_code == 403
    seen = client.get(f"/api/items/{item['id']}", headers=seller).json()
    assert seen["cost_price"] is None
    assert seen["sale_price"] == "1.00"


def test_sku_must_be_unique_ignoring_case(client, manager):
    create_item(client, manager)
    r = client.post("/api/items", json={"name": "Other", "sku": "wat-1l"}, headers=manager)
    assert r.status_code == 409
    # Blank SKUs are allowed many times.
    create_item(client, manager, sku="", name="A")
    create_item(client, manager, sku=" ", name="B")


def test_receive_and_adjust_stock(client, manager):
    item = create_item(client, manager)
    url = f"/api/items/{item['id']}/stock"

    r = client.post(url, json={"kind": "receive", "quantity": "12", "unit_cost": "0.45"}, headers=manager)
    assert r.json()["quantity"] == "36.000"
    assert r.json()["cost_price"] == "0.45"

    r = client.post(url, json={"kind": "adjust", "quantity": "-1.5", "note": "Damaged"}, headers=manager)
    assert r.json()["quantity"] == "34.500"

    r = client.post(url, json={"kind": "adjust", "quantity": "-100"}, headers=manager)
    assert r.status_code == 400
    assert "Only 34.5 bottle on hand" in r.json()["detail"]

    r = client.post(url, json={"kind": "receive", "quantity": "-1"}, headers=manager)
    assert r.status_code == 400

    kinds = [m["kind"] for m in client.get(f"/api/items/{item['id']}/movements", headers=manager).json()]
    assert kinds == ["adjust", "receive", "initial"]


def test_service_items_do_not_track_stock(client, manager):
    item = create_item(client, manager, name="Delivery", sku=None, track_stock=False, quantity="5")
    assert item["quantity"] == "0.000"
    r = client.post(f"/api/items/{item['id']}/stock", json={"kind": "receive", "quantity": "1"}, headers=manager)
    assert r.status_code == 400


def test_search_filters_and_meta(client, manager, seller):
    create_item(client, manager)
    create_item(client, manager, name="Rice", sku="RICE-5", category="Grocery", unit="kg",
                quantity="3", reorder_level="5", attributes={"Origin": "Thailand"})

    def names(**params):
        r = client.get("/api/items", params=params, headers=seller)
        return [i["name"] for i in r.json()["items"]]

    assert names() == ["Mineral Water 1L", "Rice"]
    assert names(q="thailand") == ["Rice"]  # searches custom attributes too
    assert names(q="wat-1l") == ["Mineral Water 1L"]
    assert names(low_stock=True) == ["Rice"]
    assert names(category="Beverages") == ["Mineral Water 1L"]

    meta = client.get("/api/items/meta", headers=seller).json()
    assert meta["categories"] == ["Beverages", "Grocery"]
    assert "bottle" in meta["units"] and "kg" in meta["units"]


def test_archive_hides_item(client, manager):
    item = create_item(client, manager)
    r = client.patch(f"/api/items/{item['id']}", json={"is_active": False, "name": None}, headers=manager)
    assert r.json()["is_active"] is False
    assert r.json()["name"] == "Mineral Water 1L"
    assert client.get("/api/items", headers=manager).json()["total"] == 0
    assert client.get("/api/items", params={"include_inactive": True}, headers=manager).json()["total"] == 1
