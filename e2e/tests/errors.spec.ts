import { expect, signedInAs, test } from "../fixtures";

test.describe("when a screen breaks", () => {
  // React logs the crash to the console on purpose; that's expected here.
  test.use({ ...signedInAs("manager"), allowConsoleErrors: [/./] });

  test("a recovery screen replaces the blank page, and Reload fixes it", async ({ page }) => {
    await page.route("**/api/dashboard", (route) => route.fulfill({ json: {} })); // malformed reply
    await page.goto("/");
    await expect(page.getByText("Something went wrong")).toBeVisible();

    await page.unroute("**/api/dashboard");
    await page.getByRole("button", { name: "Reload" }).click();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Mo/ })).toBeVisible();
  });
});
