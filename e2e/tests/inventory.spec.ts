import { expect, signedInAs, test, uid } from "../fixtures";

test.describe("managing inventory", () => {
  test.use(signedInAs("manager"));

  test("add an item with a new category, attributes and opening stock", async ({ page }) => {
    const name = uid("Water ");
    const category = uid("Drinks ");
    await page.goto("/inventory");
    await page.getByRole("link", { name: "Add item" }).click();

    await page.getByLabel("Name *").fill(name);
    await page.getByLabel("SKU / barcode").fill(uid("SKU-"));
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "+ New category…" });
    await page.getByPlaceholder("New category name").fill(category);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByLabel("Category", { exact: true })).toHaveValue(/\d+/);

    await page.getByRole("button", { name: "+ Brand" }).click();
    await page.getByLabel("Attribute value").last().fill("Aqua");
    await page.getByLabel("Selling price").fill("120");
    await page.getByLabel("Cost price").fill("70");
    await page.getByLabel("Unit", { exact: true }).fill("bottle");
    await page.getByLabel("Opening quantity").fill("24");
    await page.getByLabel("Reorder level").fill("6");
    await page.getByRole("button", { name: "Add item" }).click();

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByTestId("stock-level")).toHaveText("24 bottle");
    await expect(page.getByRole("link", { name: category })).toBeVisible();
    await expect(page.getByText("Brand")).toBeVisible();
    await expect(page.getByText("Aqua")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Opening stock" })).toContainText("+24");
  });

  test("edit an item's price", async ({ page, api }) => {
    const item = await api.manager.createItem({ sale_price: "50" });
    await page.goto(`/inventory/${item.id}`);
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Selling price").fill("65.50");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Item updated");
    await expect(page.getByRole("main")).toContainText("65.50");
  });

  test("search covers attributes, and the low-stock filter works", async ({ page, api }) => {
    const tag = uid("tag");
    const plenty = await api.manager.createItem({ name: uid("Plenty "), quantity: "50", reorder_level: "5", attributes: { Batch: tag } });
    const low = await api.manager.createItem({ name: uid("Low "), quantity: "2", reorder_level: "5", attributes: { Batch: tag } });

    await page.goto("/inventory");
    await page.getByPlaceholder("Search name, SKU, category or attribute").fill(tag);
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "Low stock" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(low.name);
    await expect(page.locator("tbody")).not.toContainText(plenty.name);
  });

  test("receive and adjust stock, with history", async ({ page, api }) => {
    const item = await api.manager.createItem({ quantity: "10" });
    await page.goto(`/inventory/${item.id}`);

    await page.getByRole("button", { name: "Receive stock" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Quantity (pcs)").fill("5");
    await dialog.getByLabel("Unit cost").fill("7.25");
    await dialog.getByRole("button", { name: "Add to stock" }).click();
    await expect(page.getByTestId("stock-level")).toHaveText("15 pcs");

    await page.getByRole("button", { name: "Adjust" }).click();
    await dialog.getByLabel("Quantity (pcs)").fill("20");
    await expect(dialog.getByText("Can't remove more than the 15 pcs on hand.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save adjustment" })).toBeDisabled();
    await dialog.getByLabel("Quantity (pcs)").fill("3");
    await dialog.getByLabel("Reason").fill("Damaged in transit");
    await dialog.getByRole("button", { name: "Save adjustment" }).click();
    await expect(page.getByTestId("stock-level")).toHaveText("12 pcs");

    const history = page.getByRole("listitem");
    await expect(history.filter({ hasText: "Received" })).toContainText("+5");
    await expect(history.filter({ hasText: "Adjusted" })).toContainText("Damaged in transit");
    await expect(history.filter({ hasText: "Adjusted" })).toContainText("−3");
  });

  test("whole-number items refuse part quantities when receiving", async ({ page, api }) => {
    const category = await api.manager.createCategory(uid("Shirts "), false);
    const item = await api.manager.createItem({ category_id: category.id });
    await page.goto(`/inventory/${item.id}`);
    await page.getByRole("button", { name: "Receive stock" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Whole numbers only.")).toBeVisible();
    await dialog.getByLabel("Quantity (pcs)").fill("0.5");
    await dialog.getByRole("button", { name: "Add to stock" }).click();
    await expect(dialog.getByRole("alert")).toContainText("counted in whole pcs");
  });

  test("archiving hides an item from the list and the sale screen; restoring brings it back", async ({ page, api }) => {
    const item = await api.manager.createItem();
    await page.goto(`/inventory/${item.id}`);
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();

    await page.goto("/inventory");
    await page.getByPlaceholder("Search name, SKU, category or attribute").fill(item.name);
    await expect(page.getByText("No items match")).toBeVisible();
    await page.goto("/sell");
    await page.getByPlaceholder("Search items or scan a barcode").fill(item.name);
    await expect(page.getByText("No items match")).toBeVisible();

    await page.goto(`/inventory/${item.id}`);
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("status")).toHaveText("Item restored");
  });
});

test.describe("sales staff and inventory", () => {
  test.use(signedInAs("sales"));

  test("can see stock and prices but not costs, and can't change anything", async ({ page, api }) => {
    const item = await api.manager.createItem({ cost_price: "6", sale_price: "10" });
    await page.goto("/inventory");
    // Wait for the real page before checking what's missing from it.
    await expect(page.getByRole("columnheader", { name: "Price" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Cost" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add item" })).toHaveCount(0);

    await page.goto(`/inventory/${item.id}`);
    await expect(page.getByRole("heading", { name: item.name })).toBeVisible();
    await expect(page.getByTestId("stock-level")).toHaveText("10 pcs");
    await expect(page.getByText("Cost price")).toHaveCount(0);
    for (const name of ["Edit", "Archive", "Receive stock", "Adjust"]) {
      await expect(page.getByRole("button", { name }).or(page.getByRole("link", { name }))).toHaveCount(0);
    }
  });
});
