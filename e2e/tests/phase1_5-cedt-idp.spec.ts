import { expect, test } from "@playwright/test";
import { E2E } from "../support/env";

// Phase 1.5d: "Log in with CEDT" through CEDT IDP (mock), and linking it to an MCV account.
const setIdpUser = async (request: import("@playwright/test").APIRequestContext, user: object) => {
  expect((await request.put(`${E2E.cedtIdpURL}/__test/user`, { data: user })).ok()).toBe(true);
};

test.describe("Phase 1.5 · Log in with CEDT", () => {
  test.describe("logged out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("the login page offers CEDT first and MyCourseVille as the alternative", async ({
      page,
    }) => {
      await page.goto("/login");
      const cedt = page.getByRole("button", { name: "Log in with CEDT" });
      const mcv = page.getByRole("button", { name: "Log in with MyCourseVille" });
      await expect(cedt).toBeEnabled();
      await expect(mcv).toHaveClass(/secondary/);
      expect((await cedt.boundingBox())?.y ?? 0).toBeLessThan((await mcv.boundingBox())?.y ?? 0);
    });

    test("a new student signs up with CEDT: real name and Chula student mail", async ({
      page,
      request,
    }) => {
      await setIdpUser(request, {
        userId: "cedt-u-001",
        studentId: "6630000099",
        firstNameEn: "Somchai",
        lastNameEn: "Jaidee",
      });
      await page.goto("/login");
      await page.getByRole("button", { name: "Log in with CEDT" }).click();
      await expect(page.getByRole("heading", { name: "Hi, Somchai Jaidee" })).toBeVisible();
      const session = await (await page.request.get("/api/auth/get-session")).json();
      expect(session.user.email).toBe("6630000099@student.chula.ac.th");
      expect(session.user.emailVerified).toBe(false);
    });
  });

  test("sign-in is rate-limited per client IP", async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: E2E.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77", origin: E2E.baseURL },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await api.post("/api/auth/sign-in/social", {
        data: { provider: "cedt", callbackURL: "/" },
      });
      statuses.push(r.status());
    }
    await api.dispose();
    expect(statuses[0]).toBe(200);
    expect(statuses).toContain(429);
  });

  test("an MCV user links CEDT in Settings, then CEDT login opens the same hub", async ({
    page,
    request,
    browser,
  }) => {
    await setIdpUser(request, {
      userId: "cedt-u-002",
      studentId: "6630000021",
      firstNameEn: "Test",
      lastNameEn: "Student",
    });
    await page.goto("/settings");
    const card = page.locator("section#cedt");
    await card.getByRole("button", { name: "Link CEDT account" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(card).toContainText("Linked.");

    // Fresh browser, log in with CEDT only: lands on the existing MCV user's hub.
    // Its own client IP, like a separate real user: Better Auth rate-limits sign-ins per IP, and this
    // suite signs in many times within seconds from one machine.
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.21" },
    });
    const fresh = await ctx.newPage();
    await fresh.goto("/login");
    await fresh.getByRole("button", { name: "Log in with CEDT" }).click();
    await expect(fresh.getByRole("heading", { name: "Hi, Test Student" })).toBeVisible();
    await expect(fresh.getByText("Lab 5: OAuth")).toBeVisible(); // same MCV data
    await ctx.close();
  });
});
