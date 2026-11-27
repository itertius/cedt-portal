import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./support/env";

/**
 * Real-browser end-to-end tests, one spec file per SOW phase (see docs/TESTING.md).
 * Needs a migrated Postgres at DATABASE_URL and a built app (`pnpm build`).
 * The database is wiped before each run (global-setup), and both mock providers start fresh.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/global-setup.ts",
  // One shared mock student and shared external state (Google mock): run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E.baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    timezoneId: "Asia/Bangkok",
    locale: "en-GB",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: E2E.storageState },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node ../apps/web/scripts/mock-mcv.mjs",
      port: E2E.mcvPort,
      reuseExistingServer: false,
      env: { MOCK_MCV_PORT: String(E2E.mcvPort) },
    },
    {
      command: "node ../apps/web/scripts/mock-google.mjs",
      port: E2E.googlePort,
      reuseExistingServer: false,
      env: { MOCK_GOOGLE_PORT: String(E2E.googlePort) },
    },
    {
      command: "node ../apps/web/scripts/mock-talent.mjs",
      port: E2E.talentPort,
      reuseExistingServer: false,
      env: { MOCK_TALENT_PORT: String(E2E.talentPort) },
    },
    {
      command: `./node_modules/.bin/next start -p ${E2E.appPort}`,
      cwd: "../apps/web",
      url: `${E2E.baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: E2E.appEnv,
      stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
      stderr: "pipe",
    },
  ],
});
