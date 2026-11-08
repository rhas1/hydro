import { USERS } from "../env";
import { expect, signIn, signedInAs, signedOut, test, uid } from "../fixtures";

// Runs on the "android" and "iphone" projects (see playwright.config.ts).

test.describe("on a phone", () => {
  test.use(signedInAs("manager"));

  test("the bottom tab bar replaces the sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toBeHidden();
    await page.getByRole("link", { name: "Inventory" }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await page.getByRole("link", { name: "Sales" }).click();
    await expect(page).toHaveURL(/\/sales$/);
    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "My account" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("sell in two steps: pick items, then review the cart", async ({ page, api }) => {
    const item = await api.manager.createItem({ name: uid("Juice "), sale_price: "3.50" });
    await page.goto("/sell");
    await page.getByPlaceholder("Search items or scan a barcode").fill(item.name);
    await page.getByRole("button", { name: new RegExp(item.name) }).click();
    await page.getByRole("button", { name: new RegExp(item.name) }).click();

    const viewCart = page.getByRole("button", { name: /View cart/ });
    await expect(viewCart).toContainText("7.00");
    await viewCart.click();
    await expect(page.getByLabel(`Quantity of ${item.name}`)).toHaveValue("2");
    await page.getByRole("button", { name: "Complete sale" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice INV-/ })).toBeVisible();
    await expect(page.getByTestId("invoice-total")).toContainText("7.00");
  });

  test("no page is wider than the screen", async ({ page, api }) => {
    const item = await api.manager.createItem({ name: uid("A rather long item name for a small screen ") });
    const sale = await api.manager.sell([{ item_id: item.id, quantity: 1 }], { customer_name: "Width Check" });
    const pages = ["/", "/inventory", `/inventory/${item.id}`, "/inventory/new", "/inventory/categories", "/sell", "/sales", `/sales/${sale.id}`, "/account"];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("signing in on a phone", () => {
  test.use(signedOut);

  test("works and lands on the home screen", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, USERS.manager);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Mo/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sell" })).toBeVisible();
  });
});
