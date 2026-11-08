import { writeFileSync } from "node:fs";

import { request } from "@playwright/test";

import { BASE_URL, USERS, authFile, compose, type Role } from "./env";

async function waitForApp() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE_URL}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Hydro didn't come up at ${BASE_URL}`);
}

/** Starts a fresh copy of Hydro in Docker and signs in the three standard users. */
export default async function globalSetup() {
  compose("down -v --remove-orphans");
  compose("up -d --build --wait");
  await waitForApp();

  const api = await request.newContext({ baseURL: BASE_URL });
  const login = async (role: Role) => {
    const response = await api.post("/api/auth/login", { data: USERS[role] });
    if (!response.ok()) throw new Error(`login as ${role} failed: ${response.status()}`);
    return (await response.json()).access_token as string;
  };

  const adminToken = await login("admin");
  for (const role of ["manager", "sales"] as const) {
    const response = await api.post("/api/users", {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS[role].email, full_name: USERS[role].name, password: USERS[role].password, role },
    });
    if (!response.ok()) throw new Error(`creating ${role} failed: ${await response.text()}`);
  }

  // Saved browser state so tests start signed in (the app keeps its token in localStorage).
  for (const role of Object.keys(USERS) as Role[]) {
    const token = role === "admin" ? adminToken : await login(role);
    writeFileSync(
      authFile(role),
      JSON.stringify({ cookies: [], origins: [{ origin: BASE_URL, localStorage: [{ name: "hydro.token", value: token }] }] }),
    );
  }
  await api.dispose();
}
