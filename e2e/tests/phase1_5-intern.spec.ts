import { expect, test } from "@playwright/test";
import { E2E } from "../support/env";
import { dbQuery } from "../support/helpers";

// Phase 1.5c: CEDT Intern Portal via the student's own (pasted, encrypted) session cookie.
test.describe
  .serial("Phase 1.5 · CEDT Intern Portal", () => {
    const intern = (page: import("@playwright/test").Page) => page.locator("section#intern");
    const COOKIE = "Cookie: cedt_session=good; _ga=GA1.2.3; Path=/";

    test("a cookie the portal rejects is refused with a clear message", async ({ page }) => {
      await page.goto("/settings");
      await intern(page).getByLabel("Intern Portal cookie").fill("cedt_session=bad");
      await intern(page).getByRole("button", { name: "Connect Intern Portal" }).click();
      await expect(intern(page).getByRole("alert")).toContainText("did not accept this cookie");
      expect(
        await dbQuery(`select 1 from connector_credential where source = 'intern'`),
      ).toHaveLength(0);
    });

    test("connect: openings and deadlines sync; the cookie is stored encrypted", async ({
      page,
    }) => {
      await page.goto("/settings");
      await intern(page).getByLabel("Intern Portal cookie").fill(COOKIE);
      await intern(page).getByRole("button", { name: "Connect Intern Portal" }).click();
      // The card switches to its connected view, which says what was synced.
      await expect(intern(page)).toContainText("Connected. 3 openings synced.");
      const [row] = await dbQuery<{ secret: string }>(
        `select secret from connector_credential where source = 'intern'`,
      );
      expect(row?.secret.startsWith("v1.")).toBe(true);
      expect(row?.secret).not.toContain("cedt_session");
    });

    test("browse openings: sorted by pay, filters, search, links to the portal", async ({
      page,
    }) => {
      await page.goto("/internships");
      const titles = page.locator(".internship strong");
      await expect(titles).toHaveText([
        "Data Analyst Intern",
        "★ Backend Engineer Intern",
        "Frontend Intern",
      ]);
      await expect(page.getByRole("link", { name: /Backend Engineer Intern/ })).toHaveAttribute(
        "href",
        "https://cedtintern.cp.eng.chula.ac.th/opening/9001/session/9",
      );
      await expect(
        page.locator(".internship").filter({ hasText: "Frontend Intern" }),
      ).toContainText("not accepting applications");

      await page.getByLabel("Bookmarked only").check();
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(titles).toHaveText(["★ Backend Engineer Intern"]);

      await page.goto("/internships?q=react");
      await expect(titles).toHaveText(["Frontend Intern"]);
      await page.goto("/internships?condition=On-Site");
      await expect(titles).toHaveText(["Data Analyst Intern"]);
    });

    test("bookmarks and the ranking deadline reach the dashboard", async ({ page }) => {
      await page.goto("/");
      const card = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /^Internships/ }) });
      await expect(card.getByRole("heading")).toContainText("3 openings");
      await expect(card.getByRole("link", { name: "Backend Engineer Intern" })).toBeVisible();
      await expect(card).toContainText("฿15,000");
      const soon = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /^Due soon/ }) });
      await expect(
        soon.getByText(/Rank your internship choices · CEDT Internship 2027/).first(),
      ).toBeVisible();
    });

    test("an expired session asks for a fresh cookie; disconnect removes everything", async ({
      page,
      request,
    }) => {
      await request.post(`${E2E.internURL}/__test/expire`);
      await page.goto("/settings");
      await intern(page).getByRole("button", { name: "Sync now" }).click();
      await expect(
        intern(page)
          .getByRole("status")
          .filter({ hasText: /expired/ }),
      ).toBeVisible();
      await page.reload();
      await expect(intern(page).getByRole("button", { name: "Update cookie" })).toBeVisible();
      await request.post(`${E2E.internURL}/__test/restore`);

      page.once("dialog", (d) => d.accept());
      await intern(page).getByRole("button", { name: "Disconnect" }).click();
      await expect(
        intern(page).getByRole("button", { name: "Connect Intern Portal" }),
      ).toBeVisible();
      expect(await dbQuery(`select 1 from internship`)).toHaveLength(0);
      expect(await dbQuery(`select 1 from task where source = 'intern'`)).toHaveLength(0);
      await page.goto("/internships");
      await expect(
        page.getByRole("link", { name: "Connect the CEDT Intern Portal" }),
      ).toBeVisible();
    });
  });
