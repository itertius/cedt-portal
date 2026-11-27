import { expect, test } from "@playwright/test";
import { E2E } from "../support/env";
import { dbQuery } from "../support/helpers";

// Phase 1.5b: CEDT Grader via its /api/v1 JWT. The password must never be stored.
test.describe
  .serial("Phase 1.5 · CEDT Grader", () => {
    const PASSWORD = "correct-horse";
    const grader = (page: import("@playwright/test").Page) => page.locator("section#grader");

    test("a wrong password shows the grader's error and is not retried", async ({
      page,
      request,
    }) => {
      await page.goto("/settings");
      await grader(page).getByLabel("Grader login").fill("6630000021");
      await grader(page).getByLabel("Grader password").fill("wrong-password");
      await grader(page).getByRole("button", { name: "Connect Grader" }).click();
      await expect(grader(page).getByRole("alert")).toHaveText("Invalid login or password");
      expect((await (await request.get(`${E2E.graderURL}/__test/stats`)).json()).logins).toBe(1);
    });

    test("connect: problems sync and the dashboard shows progress", async ({ page }) => {
      await page.goto("/settings");
      await grader(page).getByLabel("Grader login").fill("6630000021");
      await grader(page).getByLabel("Grader password").fill(PASSWORD);
      await grader(page).getByRole("button", { name: "Connect Grader" }).click();
      // The card switches to its connected view, which says what was synced.
      await expect(grader(page)).toContainText(
        "Connected as 6630000021 (Test Student). 3 problems, 1 solved.",
      );
      await expect(grader(page)).toContainText("Last synced");

      await page.goto("/");
      const card = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /^Grader/ }) });
      await expect(card.getByRole("heading")).toContainText("1/3 solved");
      await expect(card.getByRole("link", { name: "01_Loop_23" })).toHaveAttribute(
        "href",
        "https://cedt-grader.nattee.net/submissions/direct_edit_problem/102",
      );
      await expect(card).toContainText("best 40/100");
      await expect(card.getByText("00_Intro_11")).toHaveCount(0); // solved, not "in progress"
    });

    test("the password is never stored; the token is encrypted at rest", async () => {
      const rows = await dbQuery<{ secret: string; label: string | null }>(
        `select secret, label from connector_credential where source = 'grader'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.secret.startsWith("v1.")).toBe(true);
      expect(rows[0]?.secret).not.toContain("mockjwt");
      // Search every text column of every table for the password.
      const hits = await dbQuery<{ hit: string }>(`
      select table_name || '.' || column_name as hit from information_schema.columns
      where table_schema = 'public' and data_type in ('text', 'character varying')`);
      for (const { hit } of hits) {
        const [table, column] = hit.split(".");
        const found = await dbQuery<{ n: number }>(
          `select count(*)::int as n from "${table}" where "${column}"::text like $1`,
          [`%${PASSWORD}%`],
        );
        expect(found[0]?.n, `password found in ${hit}`).toBe(0);
      }
    });

    test("an expired token asks to reconnect, and reconnecting fixes it", async ({
      page,
      request,
    }) => {
      await request.post(`${E2E.graderURL}/__test/expire`);
      await page.goto("/settings");
      await grader(page).getByRole("button", { name: "Sync now" }).click();
      await expect(
        grader(page)
          .getByRole("status")
          .filter({ hasText: /expired/ }),
      ).toBeVisible();
      await page.reload();
      await expect(grader(page).locator("p.error")).toContainText("Reconnect");
      await grader(page).getByLabel("Grader login").fill("6630000021");
      await grader(page).getByLabel("Grader password").fill(PASSWORD);
      await grader(page).getByRole("button", { name: "Reconnect Grader" }).click();
      await expect(grader(page).locator("p.error")).toHaveCount(0);
      await expect(grader(page)).toContainText("3 problems, 1 solved.");
    });

    test("disconnect removes the token and the problems", async ({ page }) => {
      await page.goto("/settings");
      page.once("dialog", (d) => d.accept());
      await grader(page).getByRole("button", { name: "Disconnect" }).click();
      await expect(grader(page).getByRole("button", { name: "Connect Grader" })).toBeVisible();
      expect(
        await dbQuery(`select 1 from connector_credential where source = 'grader'`),
      ).toHaveLength(0);
      expect(await dbQuery(`select 1 from grader_problem`)).toHaveLength(0);
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Connect CEDT Grader" })).toBeVisible();
    });
  });
