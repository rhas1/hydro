from .test_inventory import category_id, create_item


def test_manage_categories(client, manager):
    r = client.post("/api/categories", json={"name": "  Beverages "}, headers=manager)
    assert r.status_code == 201
    drinks = r.json()
    assert drinks == {"id": drinks["id"], "name": "Beverages", "allow_fractions": False, "item_count": 0}

    # Names are unique ignoring case.
    assert client.post("/api/categories", json={"name": "beverages"}, headers=manager).status_code == 409

    create_item(client, manager, category="Beverages")
    listed = client.get("/api/categories", headers=manager).json()
    assert [(c["name"], c["item_count"]) for c in listed] == [("Beverages", 1)]

    # Renaming shows up on the items straight away.
    r = client.patch(f"/api/categories/{drinks['id']}", json={"name": "Drinks"}, headers=manager)
    assert r.json() == {"id": drinks["id"], "name": "Drinks", "allow_fractions": False, "item_count": 1}
    item = client.get("/api/items", headers=manager).json()["items"][0]
    assert item["category"] == {"id": drinks["id"], "name": "Drinks", "allow_fractions": False}


def test_rename_cannot_clash(client, manager):
    a = category_id(client, manager, "Apparel")
    category_id(client, manager, "Hardware")
    r = client.patch(f"/api/categories/{a}", json={"name": "HARDWARE"}, headers=manager)
    assert r.status_code == 409
    # Changing only the capitalisation of its own name is fine.
    assert client.patch(f"/api/categories/{a}", json={"name": "APPAREL"}, headers=manager).status_code == 200


def test_deleting_a_category_keeps_its_items(client, manager):
    item = create_item(client, manager, category="Seasonal")
    cid = item["category"]["id"]
    assert client.delete(f"/api/categories/{cid}", headers=manager).status_code == 204
    kept = client.get(f"/api/items/{item['id']}", headers=manager).json()
    assert kept["category"] is None
    assert client.get("/api/categories", headers=manager).json() == []
    assert client.delete(f"/api/categories/{cid}", headers=manager).status_code == 404


def test_item_category_must_exist_and_can_be_cleared(client, manager):
    r = client.post("/api/items", json={"name": "X", "category_id": 999}, headers=manager)
    assert r.status_code == 400
    item = create_item(client, manager)
    r = client.patch(f"/api/items/{item['id']}", json={"category_id": None}, headers=manager)
    assert r.json()["category"] is None


def test_sales_role_can_read_but_not_change_categories(client, manager, seller):
    cid = category_id(client, manager, "Grocery")
    assert client.get("/api/categories", headers=seller).status_code == 200
    assert client.post("/api/categories", json={"name": "X"}, headers=seller).status_code == 403
    assert client.patch(f"/api/categories/{cid}", json={"name": "X"}, headers=seller).status_code == 403
    assert client.delete(f"/api/categories/{cid}", headers=seller).status_code == 403
