import { Api, expect, readFile, returnToTab, signedInAs, test, uid } from "../fixtures";
import type { Page } from "@playwright/test";

async function findAndTap(page: Page, name: string, times = 1) {
  await page.getByPlaceholder("Search items or scan a barcode").fill(name);
  const tile = page.getByRole("button", { name: new RegExp(name) });
  for (let i = 0; i < times; i++) await tile.click();
}

const cartLine = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name });

test.describe("selling as a manager", () => {
  test.use(signedInAs("manager"));

  test("complete a sale and land on its invoice; stock goes down", async ({ page, api }) => {
    const shirt = await api.manager.createItem({ name: uid("Shirt "), sale_price: "25", quantity: "10" });
    const cap = await api.manager.createItem({ name: uid("Cap "), sale_price: "12", quantity: "10" });
    const customer = uid("Customer ");

    await page.goto("/sell");
    await findAndTap(page, shirt.name, 2);
    await findAndTap(page, cap.name);
    await expect(page.getByTestId("cart-total")).toContainText("62.00");

    await page.getByRole("button", { name: /Customer details/ }).click();
    await page.getByLabel("Name", { exact: true }).fill(customer);
    await page.getByRole("button", { name: "Card", exact: true }).click();
    await page.getByRole("button", { name: "Complete sale" }).click();

    await expect(page.getByRole("heading", { name: /^Invoice INV-\d{5}$/ })).toBeVisible();
    await expect(page.getByText(customer)).toBeVisible();
    await expect(page.getByTestId("invoice-total")).toContainText("62.00");
    expect((await api.manager.item(shirt.id)).quantity).toBe("8.000");
    expect((await api.manager.item(cap.id)).quantity).toBe("9.000");
  });

  test("discounts and tax add up the same on screen and on the invoice", async ({ page, api }) => {
    const item = await api.manager.createItem({ sale_price: "100", quantity: "10" });
    await page.goto("/sell");
    await findAndTap(page, item.name, 3);
    await cartLine(page, item.name).getByLabel("Line discount").fill("20");
    await page.getByLabel("Order discount").fill("30");
    await page.getByLabel("Tax rate %").fill("10");
    // 3 x 100 - 20 = 280; minus 30 = 250; plus 10% tax = 275
    await expect(page.getByTestId("cart-total")).toContainText("275.00");
    await page.getByRole("button", { name: "Complete sale" }).click();
    await expect(page.getByTestId("invoice-total")).toContainText("275.00");
    await expect(page.getByRole("main")).toContainText("Tax (10%)");
  });

  test("can't add more than is in stock", async ({ page, api }) => {
    const item = await api.manager.createItem({ quantity: "2" });
    await page.goto("/sell");
    await findAndTap(page, item.name, 3);
    await expect(page.getByRole("status")).toContainText(`Only 2 pcs of ${item.name} in stock`);
    const quantity = page.getByLabel(`Quantity of ${item.name}`);
    await expect(quantity).toHaveValue("2");

    await cartLine(page, item.name).getByRole("button", { name: "Increase" }).click();
    await expect(quantity).toHaveValue("2");

    await quantity.fill("5");
    await expect(cartLine(page, item.name)).toContainText("Only 2 pcs in stock");
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    await quantity.fill("2");
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeEnabled();
  });

  test("out-of-stock items can't be tapped", async ({ page, api }) => {
    const item = await api.manager.createItem({ quantity: "0" });
    await page.goto("/sell");
    await page.getByPlaceholder("Search items or scan a barcode").fill(item.name);
    await expect(page.getByRole("button", { name: new RegExp(item.name) })).toBeDisabled();
  });

  test("whole-number items refuse part quantities; fractional ones accept them", async ({ page, api }) => {
    const whole = await api.manager.createCategory(uid("Apparel "), false);
    const bulk = await api.manager.createCategory(uid("Bulk "), true);
    const shirt = await api.manager.createItem({ name: uid("Tee "), category_id: whole.id });
    const rice = await api.manager.createItem({ name: uid("Rice "), category_id: bulk.id, unit: "kg" });

    await page.goto("/sell");
    await findAndTap(page, shirt.name);
    await findAndTap(page, rice.name);
    await page.getByLabel(`Quantity of ${shirt.name}`).fill("1.5");
    await page.getByLabel(`Quantity of ${rice.name}`).fill("1.5");
    await expect(cartLine(page, shirt.name)).toContainText("Whole numbers only");
    await expect(cartLine(page, rice.name)).not.toContainText("Whole numbers only");
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();

    await page.getByLabel(`Quantity of ${shirt.name}`).fill("2");
    await page.getByRole("button", { name: "Complete sale" }).click();
    await expect(page.getByRole("heading", { name: /^Invoice INV-/ })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("1.5 kg");
  });

  test("a sale made on another device is noticed before checkout", async ({ page, api }) => {
    const item = await api.manager.createItem({ quantity: "2" });
    await page.goto("/sell");
    await findAndTap(page, item.name, 2);
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeEnabled();

    await api.sales.sell([{ item_id: item.id, quantity: 1 }]); // someone else sells one
    await returnToTab(page);
    await expect(cartLine(page, item.name)).toContainText("Only 1 pcs in stock");
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  test("an item archived while in the cart is flagged", async ({ page, api }) => {
    const item = await api.manager.createItem();
    await page.goto("/sell");
    await findAndTap(page, item.name);
    await api.manager.call("PATCH", `/items/${item.id}`, { is_active: false });
    await returnToTab(page);
    await expect(cartLine(page, item.name)).toContainText("No longer for sale");
    await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  test("download the invoice as a PDF", async ({ page, api }) => {
    const item = await api.manager.createItem();
    const sale = await api.manager.sell([{ item_id: item.id, quantity: 1 }], { customer_name: "PDF Test" });
    await page.goto(`/sales/${sale.id}`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
    expect(download.suggestedFilename()).toBe(`${sale.invoice_number}.pdf`);
    expect(readFile(await download.path()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("voiding a sale marks the invoice and puts the stock back", async ({ page, api }) => {
    const item = await api.manager.createItem({ quantity: "10" });
    const sale = await api.manager.sell([{ item_id: item.id, quantity: 4 }]);
    expect((await api.manager.item(item.id)).quantity).toBe("6.000");

    await page.goto(`/sales/${sale.id}`);
    await page.getByRole("button", { name: "Void", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Customer returned it");
    await dialog.getByRole("button", { name: "Void sale" }).click();
    await expect(page.getByText(/This sale was voided/)).toBeVisible();
    await expect(page.getByText("Reason: Customer returned it")).toBeVisible();
    await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0);
    expect((await api.manager.item(item.id)).quantity).toBe("10.000");
  });

  test("the sales list finds sales by customer", async ({ page, api }) => {
    const item = await api.manager.createItem();
    const customer = uid("Priya ");
    const sale = await api.manager.sell([{ item_id: item.id, quantity: 1 }], { customer_name: customer });
    await page.goto("/sales");
    await page.getByPlaceholder("Invoice no., customer name or phone").fill(customer);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText(sale.invoice_number);
  });
});

test.describe("selling as sales staff", () => {
  test.use(signedInAs("sales"));

  test("no price, discount or tax controls, but a sale goes through at list price", async ({ page, api }) => {
    const item = await api.manager.createItem({ sale_price: "40" });
    await page.goto("/sell");
    await findAndTap(page, item.name);
    await expect(page.getByLabel("Order discount")).toHaveCount(0);
    await expect(page.getByLabel("Unit price")).toHaveCount(0);
    await expect(page.getByLabel("Tax rate %")).toHaveCount(0);
    await page.getByRole("button", { name: "Complete sale" }).click();
    await expect(page.getByTestId("invoice-total")).toContainText("40.00");
    await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0);
  });

  test("only see their own sales", async ({ page, api }) => {
    const item = await api.manager.createItem();
    const mine = uid("Mine ");
    const theirs = uid("Theirs ");
    await api.sales.sell([{ item_id: item.id, quantity: 1 }], { customer_name: mine });
    const colleague = await api.admin.createUser("sales", "password123");
    const colleagueApi = await Api.signIn(colleague.email, "password123");
    const other = await colleagueApi.sell([{ item_id: item.id, quantity: 1 }], { customer_name: theirs });
    await colleagueApi.dispose();

    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "My sales" })).toBeVisible();
    await page.getByPlaceholder("Invoice no., customer name or phone").fill(mine);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByPlaceholder("Invoice no., customer name or phone").fill(theirs);
    await expect(page.getByText("No sales found")).toBeVisible();

    await page.goto(`/sales/${other.id}`);
    await expect(page.getByRole("alert")).toContainText("Sale not found");
  });
});
