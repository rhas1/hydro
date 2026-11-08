import { expect, signedInAs, test, uid } from "../fixtures";

test.use(signedInAs("manager"));

test("add a category that allows fractions; duplicates are refused", async ({ page }) => {
  const name = uid("Fabric ");
  await page.goto("/inventory/categories");
  await page.getByLabel("New category name").fill(name);
  await page.getByRole("radio", { name: /Fractions allowed/ }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("0 items · Fractions allowed");

  await page.getByLabel("New category name").fill(name.toUpperCase());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`There is already a category called ${name.toUpperCase()}`)).toBeVisible();
});

test("new categories default to whole numbers", async ({ page }) => {
  const name = uid("Boxes ");
  await page.goto("/inventory/categories");
  await expect(page.getByRole("radio", { name: /Whole numbers/ })).toBeChecked();
  await page.getByLabel("New category name").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Whole numbers");
});

test("renaming a category renames it on its items", async ({ page, api }) => {
  const category = await api.manager.createCategory(uid("Old "));
  const item = await api.manager.createItem({ category_id: category.id });
  const newName = uid("New ");

  await page.goto("/inventory/categories");
  await page.getByRole("button", { name: `Edit ${category.name}` }).click();
  await page.getByLabel(`New name for ${category.name}`).fill(newName);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: newName })).toContainText("1 item");

  await page.goto(`/inventory/${item.id}`);
  await expect(page.getByRole("link", { name: newName })).toBeVisible();
});

test("deleting a category keeps its items, uncategorised", async ({ page, api }) => {
  const category = await api.manager.createCategory(uid("Seasonal "));
  const item = await api.manager.createItem({ category_id: category.id });

  await page.goto("/inventory/categories");
  await page.getByRole("button", { name: `Delete ${category.name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 item in it will be left without a category");
  await dialog.getByRole("button", { name: "Delete category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: category.name })).toHaveCount(0);

  await page.goto(`/inventory/${item.id}`);
  await expect(page.getByRole("heading", { name: item.name })).toBeVisible();
  await expect(page.getByRole("link", { name: category.name })).toHaveCount(0);
});

test("can't switch to whole numbers while an item holds a part quantity", async ({ page, api }) => {
  const category = await api.manager.createCategory(uid("Bulk "), true);
  const item = await api.manager.createItem({ category_id: category.id, unit: "kg", quantity: "2.5" });

  await page.goto("/inventory/categories");
  await page.getByRole("button", { name: `Edit ${category.name}` }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByLabel(`New name for ${category.name}`) });
  await row.getByRole("radio", { name: /Whole numbers/ }).click();
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText(`${item.name} has part quantities in stock`);
});

test("the inventory list can be filtered by category", async ({ page, api }) => {
  const category = await api.manager.createCategory(uid("Tools "));
  const tag = uid("filter");
  const inCategory = await api.manager.createItem({ name: `${tag} hammer`, category_id: category.id });
  await api.manager.createItem({ name: `${tag} rope` });

  await page.goto("/inventory");
  await page.getByPlaceholder("Search name, SKU, category or attribute").fill(tag);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: category.name });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText(inCategory.name);
});
