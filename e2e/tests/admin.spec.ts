import { USERS } from "../env";
import { Api, expect, signedInAs, test, uid } from "../fixtures";

test.use(signedInAs("admin"));

test("business details from Settings appear on invoices", async ({ page, api }) => {
  const business = uid("Blue Lagoon ");
  const footer = uid("Thanks for shopping ");
  await page.goto("/settings");
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("Footer message").fill(footer);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved");

  const item = await api.manager.createItem();
  const sale = await api.manager.sell([{ item_id: item.id, quantity: 1 }]);
  await page.goto(`/sales/${sale.id}`);
  await expect(page.getByText(business)).toBeVisible();
  await expect(page.getByText(footer)).toBeVisible();
});

test("add a user who can then sign in; disabling them locks them out", async ({ page }) => {
  const name = uid("Nimal ");
  const email = `${uid("nimal")}@example.com`;
  await page.goto("/users");
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Email (used to sign in)").fill(email);
  await dialog.getByRole("radio", { name: /^Manager/ }).check();
  await dialog.getByLabel("Password", { exact: true }).fill("password123");
  await dialog.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("status")).toHaveText("User added");
  await expect(page.getByRole("button", { name: new RegExp(name) })).toContainText("Manager");

  const client = await Api.signIn(email, "password123");
  await client.dispose();

  await page.getByRole("button", { name: new RegExp(name) }).click();
  await dialog.getByRole("switch", { name: /Active/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toContainText("Disabled");
  const refused = await page.request.post("/api/auth/login", { data: { email, password: "password123" } });
  expect(refused.status()).toBe(403);
});

test("an admin can't remove their own admin access", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: new RegExp(USERS.admin.email) }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^Sales/ }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("You can't remove your own admin access");
});
