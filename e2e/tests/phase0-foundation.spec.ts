import { expect, test } from "@playwright/test";

// Phase 0: deployable app, health check, login, protected pages.
test.describe("Phase 0 · foundation", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // logged out

  test("health endpoint reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("logged-out home offers login, with the app icon", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CEDT Hub" })).toBeVisible();
    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Log in with MyCourseVille" })).toBeEnabled();
    const icon = await page.request.get("/icon.svg");
    expect(icon.ok()).toBe(true);
  });

  for (const path of ["/calendar", "/notes", "/settings"]) {
    test(`${path} requires login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("MCV login, then logout", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in with MyCourseVille" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Test Student" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  });

  test("cron endpoint rejects calls without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/sync")).status()).toBe(401);
    const wrong = await request.get("/api/cron/sync", {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status()).toBe(401);
  });
});
