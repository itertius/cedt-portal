import { randomBytes } from "node:crypto";

const appPort = Number(process.env.E2E_APP_PORT ?? 3300);
const mcvPort = Number(process.env.E2E_MCV_PORT ?? 4310);
const googlePort = Number(process.env.E2E_GOOGLE_PORT ?? 4320);
const talentPort = Number(process.env.E2E_TALENT_PORT ?? 4330);
const graderPort = Number(process.env.E2E_GRADER_PORT ?? 4340);
const internPort = Number(process.env.E2E_INTERN_PORT ?? 4350);
const databaseURL = process.env.DATABASE_URL ?? "postgres://cedt@localhost:5433/cedt_hub";

export const E2E = {
  appPort,
  mcvPort,
  googlePort,
  talentPort,
  graderPort,
  internPort,
  baseURL: `http://localhost:${appPort}`,
  mcvURL: `http://localhost:${mcvPort}`,
  googleURL: `http://localhost:${googlePort}`,
  talentURL: `http://localhost:${talentPort}`,
  graderURL: `http://localhost:${graderPort}`,
  internURL: `http://localhost:${internPort}`,
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
    TALENT_BASE_URL: `http://localhost:${talentPort}`,
    GRADER_BASE_URL: `http://localhost:${graderPort}`,
    INTERN_BASE_URL: `http://localhost:${internPort}`,
  } as Record<string, string>,
};
