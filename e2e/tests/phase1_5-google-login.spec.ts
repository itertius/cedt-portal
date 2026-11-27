import { expect, type Page, test } from "@playwright/test";
import { E2E } from "../support/env";
import { dbQuery } from "../support/helpers";

// Phase 1.5e: invite-only "Log in with Google" (ALLOWED_EMAILS = owner@example.com, @invited.test).
const setGoogleUser = async (page: Page, user?: object) => {
  const res = await page.request.put(`${E2E.googleURL}/__test/user`, { data: user ?? "" });
  expect(res.ok()).toBe(true);
};

async function loginWithGoogle(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in with Google" }).click();
}

test.describe("Phase 1.5 · invite-only Google login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.afterAll(async ({ request }) => {
    // Later specs link the default mock Google user to the MCV account.
    await request.put(`${E2E.googleURL}/__test/user`, { data: "" });
  });

  test.describe("not invited", () => {
    test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.31" } });
    test("a Google account not on the list is turned away and no user is created", async ({
      page,
    }) => {
      await setGoogleUser(page, {
        sub: "g-stranger",
        email: "stranger@example.com",
        name: "Stranger",
      });
      await loginWithGoogle(page);
      await expect(page).toHaveURL(/\/login\?error=/);
      await expect(page.locator("main [role=alert]")).toHaveText(
        "This account isn't invited to CEDT Hub yet. Ask the owner to add your email.",
      );
      expect(
        await dbQuery(`select 1 from "user" where email = 'stranger@example.com'`),
      ).toHaveLength(0);
    });
  });

  test.describe("invited email", () => {
    test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.32" } });
    test("an invited email signs up and lands on the dashboard", async ({ page }) => {
      await setGoogleUser(page, {
        sub: "g-owner",
        email: "Owner@Example.com",
        name: "Owner Person",
      });
      await loginWithGoogle(page);
      await expect(page.getByRole("heading", { name: "Hi, Owner Person" })).toBeVisible();
    });
  });

  test.describe("invited domain", () => {
    test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.33" } });
    test("an @domain entry admits anyone on that domain, not look-alikes", async ({
      page,
      browser,
    }) => {
      await setGoogleUser(page, {
        sub: "g-dom",
        email: "friend@invited.test",
        name: "Domain Friend",
      });
      await loginWithGoogle(page);
      await expect(page.getByRole("heading", { name: "Hi, Domain Friend" })).toBeVisible();

      const ctx = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        extraHTTPHeaders: { "x-forwarded-for": "203.0.113.34" },
      });
      const other = await ctx.newPage();
      await setGoogleUser(other, {
        sub: "g-fake",
        email: "x@evil-invited.test",
        name: "Look Alike",
      });
      await loginWithGoogle(other);
      await expect(other.locator("main [role=alert]")).toContainText("isn't invited");
      await ctx.close();
    });
  });
});
