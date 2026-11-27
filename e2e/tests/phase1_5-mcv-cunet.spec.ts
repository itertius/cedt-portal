import { expect, type Page, test } from "@playwright/test";
import { E2E } from "../support/env";
import { dbQuery } from "../support/helpers";

// Phase 1.5f: MyCourseVille via the student's own CUNET login (owner-approved rule), gated by
// MCV_PASSWORD_SYNC_EMAILS = owner@example.com.
const CUNET = "6933243721";
const PASSWORD = "cunet-pass";
const stats = async (page: Page) =>
  (await (await page.request.get(`${E2E.mcvURL}/__test/web/stats`)).json()) as { logins: number };
const mcvCard = (page: Page) => page.locator("section#mcv");

async function loginOwner(page: Page) {
  await page.request.put(`${E2E.googleURL}/__test/user`, {
    data: { sub: "g-owner", email: "owner@example.com", name: "Owner Person" },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Hi, Owner Person" })).toBeVisible();
}

async function syncNow(page: Page) {
  await page.goto("/settings");
  await mcvCard(page).getByRole("button", { name: "Sync now" }).click();
  await expect(mcvCard(page).getByRole("status").last()).not.toHaveText("");
}

test.describe("Phase 1.5 · MyCourseVille via CUNET login", () => {
  test("not offered to accounts outside MCV_PASSWORD_SYNC_EMAILS", async ({ page }) => {
    await page.goto("/settings"); // the MCV OAuth student
    await expect(mcvCard(page).getByLabel("CUNET password", { exact: true })).toHaveCount(0);
  });

  test.describe
    .serial("owner", () => {
      // One logged-in browser for the whole flow, like a real user: logging in before every test
      // would trip Better Auth's per-IP sign-in rate limit.
      let page: Page;
      test.beforeAll(async ({ browser }) => {
        const ctx = await browser.newContext({
          baseURL: E2E.baseURL,
          storageState: { cookies: [], origins: [] },
          extraHTTPHeaders: { "x-forwarded-for": "203.0.113.51" },
        });
        page = await ctx.newPage();
        await loginOwner(page);
      });
      test.afterAll(async () => {
        await page.request.put(`${E2E.googleURL}/__test/user`, { data: "" });
        await page.context().close();
      });

      test("a wrong password is reported once and never retried", async () => {
        const before = (await stats(page)).logins;
        await page.goto("/settings");
        await mcvCard(page).getByLabel("CUNET username").fill(CUNET);
        await mcvCard(page).getByLabel("CUNET password", { exact: true }).fill("wrong-pass");
        await mcvCard(page)
          .getByLabel(/I agree/)
          .check();
        await mcvCard(page).getByRole("button", { name: "Connect MyCourseVille" }).click();
        await expect(mcvCard(page).locator("[role=alert]")).toHaveText(
          "MyCourseVille rejected that CUNET username or password.",
        );
        expect((await stats(page)).logins).toBe(before + 1);
        expect(
          await dbQuery(`select 1 from connector_credential where source = 'mcv'`),
        ).toHaveLength(0);
      });

      test("connect: pending assignments with course names reach the dashboard", async () => {
        await page.goto("/settings");
        await mcvCard(page).getByLabel("CUNET username").fill(CUNET);
        await mcvCard(page).getByLabel("CUNET password", { exact: true }).fill(PASSWORD);
        await mcvCard(page)
          .getByLabel(/I agree/)
          .check();
        await mcvCard(page).getByRole("button", { name: "Connect MyCourseVille" }).click();
        await expect(mcvCard(page)).toContainText(`Connected with CUNET ${CUNET}`);

        await page.goto("/");
        const soon = page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: /^Due soon/ }) });
        await expect(soon.getByRole("link", { name: "Lab 5: OAuth" })).toHaveAttribute(
          "href",
          "https://www.mycourseville.com/?q=courseville/worksheet/1001/50001",
        );
        await expect(soon.getByText("Problem set 3")).toBeVisible();
        const courses = page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: /^Courses/ }) });
        await expect(courses.getByText("Computer Engineering Essentials")).toBeVisible();
      });

      test("the CUNET password is stored encrypted, and appears in no column in plain text", async () => {
        const [row] = await dbQuery<{ secret: string; label: string }>(
          `select secret, label from connector_credential where source = 'mcv'`,
        );
        expect(row?.label).toBe(CUNET);
        expect(row?.secret.startsWith("v1.")).toBe(true);
        const cols = await dbQuery<{ hit: string }>(`
        select table_name || '.' || column_name as hit from information_schema.columns
        where table_schema = 'public' and data_type in ('text', 'character varying')`);
        for (const { hit } of cols) {
          const [table, column] = hit.split(".");
          const [found] = await dbQuery<{ n: number }>(
            `select count(*)::int as n from "${table}" where "${column}"::text like $1`,
            [`%${PASSWORD}%`],
          );
          expect(found?.n, `password found in ${hit}`).toBe(0);
        }
      });

      test("the session is reused; an expired session logs in again once", async () => {
        const start = (await stats(page)).logins;
        await syncNow(page);
        expect((await stats(page)).logins).toBe(start); // reused the saved session

        await page.request.post(`${E2E.mcvURL}/__test/web/expire`);
        await syncNow(page);
        await expect(mcvCard(page).getByRole("status").last()).toHaveText(
          "Synced 2 pending items.",
        );
        expect((await stats(page)).logins).toBe(start + 1);
      });

      test("an assignment that leaves the pending list was handed in: marked done", async () => {
        await page.request.put(`${E2E.mcvURL}/__test/web/panel`, {
          data: [
            { cvCid: 1001, code: "2110101", itemId: 50001, title: "Lab 5: OAuth", due: "2 days" },
          ],
        });
        await syncNow(page);
        await page.goto("/");
        const done = page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: /^Done this week/ }) });
        await expect(done.getByText("Problem set 3")).toBeVisible();
      });

      test("a changed password stops all logins until the user updates it", async () => {
        await page.request.put(`${E2E.mcvURL}/__test/web/password`, {
          form: { password: "new-cunet-pass" },
        });
        await page.request.post(`${E2E.mcvURL}/__test/web/expire`);
        const start = (await stats(page)).logins;
        await syncNow(page);
        await expect(mcvCard(page).getByRole("status").last()).toContainText(
          "rejected your CUNET password",
        );
        expect((await stats(page)).logins).toBe(start + 1);

        await syncNow(page); // blocked: no new login attempt
        expect((await stats(page)).logins).toBe(start + 1);

        await page.reload();
        await mcvCard(page).getByLabel("New CUNET password").fill("new-cunet-pass");
        await mcvCard(page).getByRole("button", { name: "Update password" }).click();
        await expect(mcvCard(page).locator("p.error")).toHaveCount(0);
        await syncNow(page);
        await expect(mcvCard(page).getByRole("status").last()).toHaveText(
          /Synced \d+ pending items\./,
        );
      });

      test("disconnect deletes the saved password and the MCV data", async () => {
        await page.goto("/settings");
        page.once("dialog", (d) => d.accept());
        await mcvCard(page).getByRole("button", { name: "Disconnect" }).click();
        await expect(
          mcvCard(page).getByRole("button", { name: "Connect MyCourseVille" }),
        ).toBeVisible();
        expect(
          await dbQuery(`select 1 from connector_credential where source = 'mcv'`),
        ).toHaveLength(0);
        const [own] = await dbQuery<{ n: number }>(
          `select count(*)::int as n from task t join "user" u on u.id = t.user_id where u.email = 'owner@example.com' and t.source = 'mcv'`,
        );
        expect(own?.n).toBe(0);
        await page.request.put(`${E2E.mcvURL}/__test/web/password`, {
          form: { password: PASSWORD },
        });
      });
    });
});
