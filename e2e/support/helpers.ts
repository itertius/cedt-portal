import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { E2E } from "./env";

/** Bangkok-local "YYYY-MM-DD", `days` from today. */
export const bkkDay = (days = 0) =>
  new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

/** Log in through the real MCV OAuth flow (mock MCV approves instantly). */
export async function loginWithMcv(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in with MyCourseVille" }).click();
  await expect(page.getByRole("heading", { name: "Hi, Test Student" })).toBeVisible();
}

/** Force a full MCV + Google sync for every user, like the daily cron. */
export async function runCron(request: APIRequestContext) {
  const res = await request.get("/api/cron/sync", {
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Reload until `check` passes (for work done in the background with `after()`). */
export async function eventually(page: Page, check: () => Promise<void>, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() > end) throw err;
      await page.waitForTimeout(500);
      await page.reload();
    }
  }
}

export interface MockGoogleEvent {
  id: string;
  status: string;
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/** Test hooks of the mock Google server: inspect and change "Google-side" events. */
export const mockGoogle = {
  async events(request: APIRequestContext): Promise<MockGoogleEvent[]> {
    return (await request.get(`${E2E.googleURL}/__test/events`)).json();
  },
  async edit(request: APIRequestContext, id: string, patch: Record<string, unknown>) {
    expect(
      (await request.patch(`${E2E.googleURL}/__test/events/${id}`, { data: patch })).ok(),
    ).toBe(true);
  },
  async remove(request: APIRequestContext, id: string) {
    expect((await request.delete(`${E2E.googleURL}/__test/events/${id}`)).ok()).toBe(true);
  },
};

/** Fill and submit the calendar's event form (on /calendar or an edit page). */
export async function fillEvent(
  page: Page,
  e: {
    title: string;
    date: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    endDate?: string;
  },
) {
  const form = page.locator("form").filter({ has: page.getByLabel("Title") });
  await form.getByLabel("Title").fill(e.title);
  const allDay = form.getByLabel("All day");
  if (Boolean(e.allDay) !== (await allDay.isChecked())) await allDay.click();
  await form.getByLabel(e.allDay ? "From" : "Date", { exact: true }).fill(e.date);
  if (!e.allDay) {
    await form.getByLabel("Start").fill(e.start ?? "19:00");
    await form.getByLabel("End", { exact: true }).fill(e.end ?? "20:00");
  }
  if (e.endDate) await form.getByLabel(e.allDay ? "To" : "End date (optional)").fill(e.endDate);
  await form.getByRole("button", { name: /Add event|Save/ }).click();
}

/** Click a hub event on the calendar and wait for its edit page. */
export async function openEvent(page: Page, title: string | RegExp) {
  await page.locator(".cal-item.source-hub").filter({ hasText: title }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Edit event" })).toBeVisible();
}

/** Replace the mock Talent Journey feed. */
export async function setTalentFeed(request: APIRequestContext, activities: object[]) {
  expect((await request.put(`${E2E.talentURL}/__test/activities`, { data: activities })).ok()).toBe(
    true,
  );
}
