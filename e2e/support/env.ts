import { randomBytes } from "node:crypto";

const appPort = Number(process.env.E2E_APP_PORT ?? 3300);
const mcvPort = Number(process.env.E2E_MCV_PORT ?? 4310);
const googlePort = Number(process.env.E2E_GOOGLE_PORT ?? 4320);
const databaseURL = process.env.DATABASE_URL ?? "postgres://cedt@localhost:5433/cedt_hub";

export const E2E = {
  appPort,
  mcvPort,
  googlePort,
  baseURL: `http://localhost:${appPort}`,
  mcvURL: `http://localhost:${mcvPort}`,
  googleURL: `http://localhost:${googlePort}`,
  databaseURL,
  cronSecret: "e2e-cron-secret",
  storageState: ".auth/student.json",
  appEnv: {
    DATABASE_URL: databaseURL,
    BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? randomBytes(32).toString("base64"),
    BETTER_AUTH_URL: `http://localhost:${appPort}`,
    MCV_CLIENT_ID: "e2e-mcv",
    MCV_CLIENT_SECRET: "e2e-mcv",
    MCV_BASE_URL: `http://localhost:${mcvPort}`,
    GOOGLE_CLIENT_ID: "e2e-google",
    GOOGLE_CLIENT_SECRET: "e2e-google",
    GOOGLE_BASE_URL: `http://localhost:${googlePort}`,
    CRON_SECRET: "e2e-cron-secret",
  } as Record<string, string>,
};
