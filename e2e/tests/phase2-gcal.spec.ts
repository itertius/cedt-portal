import { expect, test } from "@playwright/test";
import { bkkDay, fillEvent, mockGoogle, openEvent } from "../support/helpers";

// Phase 2b: two-way Google Calendar sync (against the mock Google server).
test.describe
  .serial("Phase 2 · Google Calendar sync", () => {
    const syncNow = async (page: import("@playwright/test").Page) => {
      await page.goto("/settings");
      const google = page.locator("section#google");
      await google.getByRole("button", { name: "Sync now" }).click();
      await expect(google.getByRole("status").filter({ hasText: /Synced:/ })).toBeVisible();
    };
    const week = (day = bkkDay(1)) => `/calendar?view=week&date=${day}`;

    test("connect Google from Settings, keeping the MCV login", async ({ page }) => {
      await page.goto("/settings");
      await page.getByRole("button", { name: "Connect Google Calendar" }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByText(/^Connected\. Your hub events/)).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Hi, Test Student" })).toBeVisible();
    });

    test("pull: Google events show read-only, linking to Google", async ({ page }) => {
      await syncNow(page);
      await page.goto(week());
      const meeting = page
        .locator(".cal-item.source-gcal")
        .filter({ hasText: "Google: Club meeting" });
      await expect(meeting).toContainText("09:00–11:00");
      await expect(meeting.getByRole("link")).toHaveAttribute(
        "href",
        /^https:\/\/calendar\.google\.com\//,
      );
      await page.goto(week(bkkDay(3)));
      await expect(
        page.locator(".cal-item.source-gcal").filter({ hasText: "Google: Holiday" }),
      ).toContainText("All day");
    });

    test("push: hub events go to Google once, without duplicates", async ({ page, request }) => {
      await page.goto(week());
      await fillEvent(page, {
        title: "PW pushed event",
        date: bkkDay(1),
        start: "15:00",
        end: "16:00",
      });
      await expect
        .poll(
          async () =>
            (await mockGoogle.events(request)).filter((e) => e.summary === "PW pushed event")
              .length,
        )
        .toBe(1);
      const copy = (await mockGoogle.events(request)).find((e) => e.summary === "PW pushed event");
      expect(copy?.start?.timeZone).toBe("Asia/Bangkok");
      expect(copy?.extendedProperties?.private?.cedtHubId).toBeTruthy();
      await syncNow(page);
      await page.goto(week());
      await expect(page.locator(".cal-item").filter({ hasText: "PW pushed event" })).toHaveCount(1);
    });

    test("edits flow both ways", async ({ page, request }) => {
      const copy = (await mockGoogle.events(request)).find((e) => e.summary === "PW pushed event");
      expect(copy).toBeTruthy();
      await mockGoogle.edit(request, copy?.id as string, { summary: "PW edited in Google" });
      await syncNow(page);
      await page.goto(week());
      const item = page.locator(".cal-item.source-hub").filter({ hasText: "PW edited in Google" });
      await expect(item).toBeVisible();

      await openEvent(page, "PW edited in Google");
      await fillEvent(page, {
        title: "PW edited in hub",
        date: bkkDay(1),
        start: "16:00",
        end: "17:00",
      });
      await expect
        .poll(
          async () => (await mockGoogle.events(request)).find((e) => e.id === copy?.id)?.summary,
        )
        .toBe("PW edited in hub");
    });

    test("deletes flow both ways", async ({ page, request }) => {
      // Hub -> Google
      await page.goto(week());
      await openEvent(page, "PW edited in hub");
      await page.getByRole("button", { name: "Delete event" }).click();
      await expect
        .poll(
          async () =>
            (await mockGoogle.events(request)).find((e) => e.summary === "PW edited in hub")
              ?.status,
        )
        .toBe("cancelled");

      // Google -> hub (a hub copy and a native Google event)
      await page.goto(week());
      await fillEvent(page, {
        title: "PW delete me in Google",
        date: bkkDay(1),
        start: "18:00",
        end: "19:00",
      });
      await expect
        .poll(async () =>
          (await mockGoogle.events(request)).some((e) => e.summary === "PW delete me in Google"),
        )
        .toBe(true);
      const copy = (await mockGoogle.events(request)).find(
        (e) => e.summary === "PW delete me in Google",
      );
      await mockGoogle.remove(request, copy?.id as string);
      await mockGoogle.remove(request, "gnative1");
      await syncNow(page);
      await page.goto(week());
      await expect(
        page.locator(".cal-item").filter({ hasText: "PW delete me in Google" }),
      ).toHaveCount(0);
      await expect(
        page.locator(".cal-item").filter({ hasText: "Google: Club meeting" }),
      ).toHaveCount(0);
    });

    test("disconnect removes Google events and keeps hub events", async ({ page }) => {
      await page.goto(week());
      await fillEvent(page, {
        title: "PW keep after disconnect",
        date: bkkDay(1),
        start: "10:00",
        end: "10:30",
      });
      await page.goto("/settings");
      page.once("dialog", (d) => d.accept());
      await page.locator("section#google").getByRole("button", { name: "Disconnect" }).click();
      await expect(page.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
      await page.goto(week(bkkDay(3)));
      await expect(page.locator(".cal-item.source-gcal")).toHaveCount(0);
      await page.goto(week());
      await expect(
        page.locator(".cal-item.source-hub").filter({ hasText: "PW keep after disconnect" }),
      ).toBeVisible();
    });
  });
