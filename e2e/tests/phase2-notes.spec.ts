import { expect, type Page, test } from "@playwright/test";
import { bkkDay, fillEvent, openEvent } from "../support/helpers";

// Phase 2c: markdown notes linked to courses and events.
test.describe("Phase 2 · notes", () => {
  async function newNote(page: Page) {
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note" }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  }
  const saved = (page: Page) => expect(page.getByRole("status")).toHaveText(/^Saved /);

  test("autosave keeps title, markdown and course after reload", async ({ page }) => {
    await newNote(page);
    await page.getByLabel("Title").fill("PW Calculus notes");
    await page.getByLabel("Note").fill("# Integration\n\nการอินทิเกรตแบบแยกส่วน by **parts**");
    await page.getByLabel("Course").selectOption({ label: "2301108 Calculus II" });
    await saved(page);
    await page.reload();
    await expect(page.getByLabel("Title")).toHaveValue("PW Calculus notes");
    await expect(page.getByLabel("Note")).toHaveValue(/การอินทิเกรตแบบแยกส่วน/);
    await expect(page.getByLabel("Course")).toHaveValue(/[0-9a-f-]{36}/);
  });

  test("preview renders markdown and neutralises scripts and javascript: links", async ({
    page,
  }) => {
    await newNote(page);
    await page.getByLabel("Title").fill("PW XSS check");
    await page
      .getByLabel("Note")
      .fill(
        "# Heading\n\n- item **bold**\n\n<script>window.__xss = 1</script>\n\n[bad](javascript:window.__xss=2)",
      );
    await saved(page);
    await page.getByRole("tab", { name: "Preview" }).click();
    const md = page.locator(".markdown");
    await expect(md.getByRole("heading", { name: "Heading" })).toBeVisible();
    await expect(md.locator("li strong")).toHaveText("bold");
    await expect(md).toContainText("<script>window.__xss = 1</script>"); // shown as text
    await expect(md.locator("script")).toHaveCount(0);
    await md
      .getByRole("link", { name: "bad" })
      .click()
      .catch(() => {});
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    await expect(md.getByRole("link", { name: "bad" })).not.toHaveAttribute("href", /javascript:/i);
  });

  test("search by Thai substring, by course, and with no match", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("searchbox", { name: "Search notes" }).fill("อินทิเกรต");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("link", { name: /PW Calculus notes/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /PW XSS check/ })).toHaveCount(0);

    await page.goto("/notes");
    await page
      .getByRole("combobox", { name: "Filter by course" })
      .selectOption({ label: "2301108 Calculus II" });
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("link", { name: /PW Calculus notes/ })).toBeVisible();

    await page.goto(`/notes?q=${encodeURIComponent("nothing like this 123")}`);
    await expect(page.getByText("No notes match.")).toBeVisible();
  });

  test("pinned notes stay on top", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("link", { name: /PW Calculus notes/ }).click();
    await expect(page.getByLabel("Title")).toHaveValue("PW Calculus notes");
    await page.getByLabel("Pinned").check();
    await saved(page);
    await page.goto("/notes");
    await expect(page.locator(".note-list > li").first()).toContainText("PW Calculus notes");
  });

  test("create a note from a calendar event", async ({ page }) => {
    await page.goto(`/calendar?date=${bkkDay(2)}`);
    await fillEvent(page, {
      title: "PW review session",
      date: bkkDay(2),
      start: "13:00",
      end: "14:00",
    });
    await openEvent(page, "PW review session");
    await page.getByRole("button", { name: "New note for this event" }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Title")).toHaveValue("PW review session");
    const noteUrl = page.url();
    await page.goBack();
    await page.reload();
    await expect(page.getByRole("link", { name: "PW review session" })).toHaveAttribute(
      "href",
      new URL(noteUrl).pathname,
    );
  });

  test("delete a note", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("link", { name: /PW XSS check/ }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
    const url = page.url();
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("link", { name: /PW XSS check/ })).toHaveCount(0);
    expect((await page.request.get(url)).status()).toBe(404);
  });
});
