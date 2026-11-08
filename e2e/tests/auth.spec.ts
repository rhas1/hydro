import { USERS } from "../env";
import { expect, signIn, signedInAs, signedOut, test } from "../fixtures";

test.describe("signing in", () => {
  test.use(signedOut);

  test("sends you to sign in, then on to the page you asked for", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, USERS.manager);
    await expect(page).toHaveURL(/\/sales$/);
    await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible();
  });

  test("a wrong password is refused with a clear message", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, { email: USERS.manager.email, password: "not-the-password" });
    await expect(page.getByRole("alert")).toHaveText("Incorrect email or password");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("disabled accounts can't sign in", async ({ page, api }) => {
    const user = await api.admin.createUser("sales");
    await api.admin.call("PATCH", `/users/${user.id}`, { is_active: false });
    await page.goto("/login");
    await signIn(page, { email: user.email, password: "password123" });
    await expect(page.getByRole("alert")).toHaveText("This account has been disabled");
  });

  test("signing out returns to the sign-in page and stays signed out", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, USERS.manager);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Mo/ })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("sales staff", () => {
  test.use(signedInAs("sales"));

  test("see selling pages but not admin ones", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    for (const name of ["Home", "Inventory", "New sale", "Sales", "My account"]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
    await expect(sidebar.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });

  test("are turned away from admin pages opened directly", async ({ page }) => {
    for (const path of ["/users", "/settings", "/inventory/new", "/inventory/categories"]) {
      await page.goto(path);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
    }
  });
});

test.describe("admins", () => {
  test.use(signedInAs("admin"));

  test("see every page", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    for (const name of ["Home", "Inventory", "New sale", "Sales", "Users", "Settings", "My account"]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
  });
});

test.describe("password changes", () => {
  test.use(signedOut);

  test("changing your password keeps you signed in here but retires the old one", async ({ page, api }) => {
    const user = await api.admin.createUser("sales", "first-password");
    await page.goto("/login");
    await signIn(page, { email: user.email, password: "first-password" });
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.goto("/account");
    await page.getByLabel("Current password").fill("first-password");
    await page.getByLabel("New password", { exact: true }).fill("second-password");
    await page.getByLabel("Repeat new password").fill("second-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toHaveText("Password changed");

    // Still signed in on this device...
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "My sales" })).toBeVisible();
    // ...but the old password no longer works.
    const oldLogin = await page.request.post("/api/auth/login", { data: { email: user.email, password: "first-password" } });
    expect(oldLogin.status()).toBe(401);
  });

  test("mismatched new passwords are caught before sending", async ({ page, api }) => {
    const user = await api.admin.createUser("sales", "first-password");
    await page.goto("/login");
    await signIn(page, { email: user.email, password: "first-password" });
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.goto("/account");
    await page.getByLabel("Current password").fill("first-password");
    await page.getByLabel("New password", { exact: true }).fill("second-password");
    await page.getByLabel("Repeat new password").fill("something-else");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("alert")).toHaveText("New passwords don't match");
  });
});

test.describe("a lost connection", () => {
  test.use({ ...signedInAs("manager"), allowConsoleErrors: [/Failed to load resource/] });

  test("at start-up doesn't sign you out, and Try again recovers", async ({ page }) => {
    await page.route("**/api/auth/me", (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await expect(page.getByText("Can't reach the Hydro server")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("hydro.token"))).toBeTruthy();

    await page.unroute("**/api/auth/me");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Mo/ })).toBeVisible();
  });
});
