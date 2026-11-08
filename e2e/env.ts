import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "..");
export const AUTH_DIR = path.join(here, ".auth");

// A separate compose project on its own ports, so the tests never touch a real
// Hydro running on the same machine (or its data).
export const PROJECT = "hydro-e2e";
export const PORT = Number(process.env.E2E_PORT ?? 8100);
export const DB_PORT = Number(process.env.E2E_DB_PORT ?? 5499);
export const BASE_URL = `http://localhost:${PORT}`;

export const USERS = {
  admin: { email: "admin@example.com", password: "e2e-admin-pass", name: "Ada Admin" },
  manager: { email: "manager@example.com", password: "e2e-manager-pass", name: "Mo Manager" },
  sales: { email: "sales@example.com", password: "e2e-sales-pass", name: "Sam Sales" },
};
export type Role = keyof typeof USERS;

export const authFile = (role: Role) => path.join(AUTH_DIR, `${role}.json`);

const composeEnv = {
  POSTGRES_PASSWORD: "e2edbpass",
  SECRET_KEY: randomBytes(32).toString("hex"),
  INITIAL_ADMIN_EMAIL: USERS.admin.email,
  INITIAL_ADMIN_PASSWORD: USERS.admin.password,
  INITIAL_ADMIN_NAME: USERS.admin.name,
  HYDRO_PORT: String(PORT),
  HYDRO_BIND: "127.0.0.1",
  DB_PORT: String(DB_PORT),
};

/** Runs `docker compose` for the test project, ignoring any real .env file. */
export function compose(args: string) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const emptyEnvFile = path.join(AUTH_DIR, "empty.env");
  writeFileSync(emptyEnvFile, "");
  execSync(`docker compose -p ${PROJECT} --env-file "${emptyEnvFile}" ${args}`, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...composeEnv },
  });
}
