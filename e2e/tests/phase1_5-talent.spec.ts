import { expect, test } from "@playwright/test";
import { bkkDay, runCron, setTalentFeed } from "../support/helpers";

// Phase 1.5a: Talent Journey public activities on the dashboard and calendar.
test.describe
  .serial("Phase 1.5 · Talent Journey activities", () => {
    test("cron pulls the public feed; the dashboard lists upcoming activities", async ({
      page,
      request,
    }) => {
      const body = await runCron(request);
      expect(body.talent).toBe("ok");
      await page.goto("/");
      const card = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: /CEDT activities/ }) });
      await expect(card.getByRole("link", { name: "Mock Corp - CAREER TALK" })).toHaveAttribute(
        "href",
        "https://talent.cedt.community/",
      );
      await expect(card).toContainText("12/50 joined");
      await expect(card.getByText("AI Security Workshop")).toBeVisible();
    });

    test("activities show on the calendar at their Bangkok times", async ({ page }) => {
      await page.goto(`/calendar?view=week&date=${bkkDay(1)}`);
      const item = page
        .locator(".cal-item.source-talent")
        .filter({ hasText: "Mock Corp - CAREER TALK" });
      await expect(item).toContainText("13:00–16:00");
      await expect(item.getByRole("link")).toHaveAttribute(
        "href",
        "https://talent.cedt.community/",
      );
      await expect(page.locator(".legend")).toContainText("Talent Journey");
    });

    test("a cancelled activity disappears after the next sync", async ({ page, request }) => {
      await setTalentFeed(request, [
        {
          activityId: 502,
          name: "AI Security Workshop",
          date: bkkDay(2),
          startTime: "09:00:00",
          endTime: "12:00:00",
        },
      ]);
      await runCron(request);
      await page.goto(`/calendar?view=week&date=${bkkDay(1)}`);
      await expect(
        page.locator(".cal-item.source-talent").filter({ hasText: "Mock Corp" }),
      ).toHaveCount(0);
      await page.goto(`/calendar?view=week&date=${bkkDay(2)}`);
      await expect(
        page.locator(".cal-item.source-talent").filter({ hasText: "AI Security Workshop" }),
      ).toBeVisible();
    });
  });
