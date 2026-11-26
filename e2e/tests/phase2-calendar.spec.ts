import { expect, test } from "@playwright/test";
import { E2E } from "../support/env";
import { bkkDay, eventually, fillEvent, openEvent } from "../support/helpers";

// Phase 2a: unified calendar (MCV deadlines + hub events).
test.describe("Phase 2 · calendar", () => {
  test.beforeAll(async ({ browser }) => {
    // Make sure MCV data is synced (dashboard visit triggers it).
    const page = await browser.newPage({ storageState: E2E.storageState });
    await page.goto("/");
    await eventually(page, async () => {
      await expect(page.getByText("Lab 5: OAuth")).toBeVisible({ timeout: 1000 });
    });
    await page.close();
  });

  test("week view shows MCV deadlines; month view and navigation work", async ({ page }) => {
    await page.goto(`/calendar?view=week&date=${bkkDay(2)}`);
    await expect(page.locator(".cal-item.task").filter({ hasText: "Lab 5: OAuth" })).toBeVisible();
    await page.getByRole("link", { name: "Month view" }).click();
    await expect(page.locator(".cal-grid.month")).toBeVisible();
    const title = await page.getByRole("heading", { level: 1 }).textContent();
    await page.getByRole("link", { name: "Next →" }).click();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(title ?? "");
    await page.getByRole("link", { name: "Today" }).click();
    await expect(page.locator(".cal-day.today")).toBeVisible();
  });

  test("invalid times are rejected with a message", async ({ page }) => {
    await page.goto(`/calendar?date=${bkkDay(1)}`);
    await fillEvent(page, { title: "Backwards", date: bkkDay(1), start: "21:00", end: "19:00" });
    await expect(page.locator(".form [role=alert]")).toHaveText("End must be after start");
    await page.reload();
    await expect(page.locator(".cal-item").filter({ hasText: "Backwards" })).toHaveCount(0);
  });

  test("create, edit and delete an event (Bangkok time)", async ({ page }) => {
    await page.goto(`/calendar?date=${bkkDay(1)}`);
    await fillEvent(page, {
      title: "PW study block",
      date: bkkDay(1),
      start: "19:00",
      end: "21:00",
    });
    const item = page.locator(".cal-item.event").filter({ hasText: "PW study block" });
    await expect(item).toContainText("19:00–21:00");

    await openEvent(page, "PW study block");
    await fillEvent(page, {
      title: "PW study block (moved)",
      date: bkkDay(1),
      start: "20:00",
      end: "22:00",
    });
    const moved = page.locator(".cal-item.event").filter({ hasText: "PW study block (moved)" });
    await expect(moved).toContainText("20:00–22:00");

    await openEvent(page, "PW study block (moved)");
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.locator(".cal-item").filter({ hasText: "PW study block" })).toHaveCount(0);
  });

  test("a multi-day all-day event shows on every day it covers", async ({ page }) => {
    const from = bkkDay(7);
    const to = bkkDay(9);
    await page.goto(`/calendar?date=${from}`);
    await fillEvent(page, { title: "PW exam days", date: from, allDay: true, endDate: to });
    await page.goto(`/calendar?view=month&date=${from}`);
    const days = page
      .locator(".cal-day")
      .filter({ has: page.locator(".cal-item", { hasText: "PW exam days" }) });
    await expect(days).toHaveCount(3);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the event form still works (progressive enhancement)", async ({ page }) => {
      await page.goto(`/calendar?date=${bkkDay(1)}`);
      const form = page.locator("form").filter({ has: page.getByLabel("Title") });
      await form.getByLabel("Title").fill("PW no-JS event");
      await form.getByLabel("Date", { exact: true }).fill(bkkDay(1));
      await form.getByLabel("Start").fill("08:00");
      await form.getByLabel("End", { exact: true }).fill("09:00");
      await form.getByRole("button", { name: "Add event" }).click();
      await expect(
        page.locator(".cal-item.event").filter({ hasText: "PW no-JS event" }),
      ).toContainText("08:00–09:00");
    });
  });
});
