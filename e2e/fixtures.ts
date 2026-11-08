import { readFileSync } from "node:fs";

import { test as base, expect, request, type APIRequestContext, type Page } from "@playwright/test";

import { BASE_URL, USERS, authFile, type Role } from "./env";

export { expect };

let counter = 0;
/** A short unique string, so parallel tests never trip over each other's data. */
export function uid(prefix = "") {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Start a test signed in as one of the standard users. */
export const signedInAs = (role: Role) => ({ storageState: authFile(role) });
export const signedOut = { storageState: { cookies: [], origins: [] } };

type Item = { id: number; name: string; quantity: string; category: { id: number; name: string } | null };

/** Talks to the Hydro API directly, to set up data quickly. */
export class Api {
  constructor(private ctx: APIRequestContext) {}

  static async signIn(email: string, password: string) {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const response = await ctx.post("/api/auth/login", { data: { email, password } });
    if (!response.ok()) throw new Error(`sign-in for ${email} failed: ${response.status()}`);
    const { access_token } = await response.json();
    await ctx.dispose();
    return new Api(await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } }));
  }

  async call<T = any>(method: string, path: string, data?: unknown): Promise<T> {
    const response = await this.ctx.fetch(`/api${path}`, { method, data });
    if (!response.ok()) throw new Error(`${method} ${path} -> ${response.status()}: ${await response.text()}`);
    return (response.status() === 204 ? undefined : await response.json()) as T;
  }

  createCategory(name = uid("Cat "), allowFractions = false) {
    return this.call<{ id: number; name: string }>("POST", "/categories", { name, allow_fractions: allowFractions });
  }

  createItem(fields: Record<string, unknown> = {}) {
    return this.call<Item>("POST", "/items", {
      name: uid("Item "),
      unit: "pcs",
      sale_price: "10",
      cost_price: "6",
      quantity: "10",
      ...fields,
    });
  }

  item(id: number) {
    return this.call<Item>("GET", `/items/${id}`);
  }

  sell(lines: { item_id: number; quantity: string | number }[], extra: Record<string, unknown> = {}) {
    return this.call<{ id: number; invoice_number: string }>("POST", "/sales", { lines, ...extra });
  }

  createUser(role: Role, password = "password123", email = `${uid("user")}@example.com`) {
    return this.call<{ id: number; email: string; full_name: string }>("POST", "/users", {
      email,
      full_name: uid("User "),
      role,
      password,
    });
  }

  dispose() {
    return this.ctx.dispose();
  }
}

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Tells the app the tab became visible again, which makes it refresh data (like switching back to it). */
export async function returnToTab(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
}

export function readFile(path: string) {
  return readFileSync(path);
}

type Fixtures = { consoleGuard: void; allowConsoleErrors: RegExp[] };
type WorkerFixtures = { api: Record<Role, Api> };

export const test = base.extend<Fixtures, WorkerFixtures>({
  // Console errors a test expects (e.g. from a deliberately failed request).
  allowConsoleErrors: [[], { option: true }],

  // One API client per standard user, shared by the tests in a worker.
  api: [
    async ({}, use) => {
      const clients = {
        admin: await Api.signIn(USERS.admin.email, USERS.admin.password),
        manager: await Api.signIn(USERS.manager.email, USERS.manager.password),
        sales: await Api.signIn(USERS.sales.email, USERS.sales.password),
      };
      await use(clients);
      await Promise.all(Object.values(clients).map((client) => client.dispose()));
    },
    { scope: "worker" },
  ],

  // Every test fails if the browser logs an error (which includes Content-Security-Policy
  // violations). Expected 4xx responses from tests that check error handling are allowed.
  consoleGuard: [
    async ({ page, allowConsoleErrors }, use) => {
      const allowed = [/status of 4\d\d/, ...allowConsoleErrors];
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !allowed.some((pattern) => pattern.test(message.text()))) {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, "errors in the browser console").toEqual([]);
    },
    { auto: true },
  ],
});
