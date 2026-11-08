import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./env";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    // Staff will mostly use phones, so the phone layout is tested on both engines.
    { name: "android", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    { name: "iphone", use: { ...devices["iPhone 14"] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
