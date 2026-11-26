import { test as setup } from "@playwright/test";
import { E2E } from "../support/env";
import { loginWithMcv } from "../support/helpers";

setup("log in as the mock MCV student", async ({ page }) => {
  await loginWithMcv(page);
  await page.context().storageState({ path: E2E.storageState });
});
