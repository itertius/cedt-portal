import { expect, test } from "@playwright/test";
import { eventually, runCron } from "../support/helpers";

// Phase 1: MCV aggregation, dashboard, tasks, launcher, sync.
test.describe("Phase 1 · MCV sync + dashboard", () => {
  test("first visit syncs MCV and fills the dashboard", async ({ page }) => {
    await page.goto("/");
    await eventually(page, async () => {
      await expect(page.getByText("Lab 5: OAuth")).toBeVisible({ timeout: 1000 });
    });

    const overdue = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Overdue/ }) });
    await expect(overdue.getByText("Project proposal")).toBeVisible();
    const soon = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Due soon/ }) });
    await expect(soon.getByText("Lab 5: OAuth")).toBeVisible();
    await expect(soon.getByText("Problem set 3")).toBeVisible();
    const undated = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^No deadline/ }) });
    await expect(undated.getByText("Reading: series")).toBeVisible();
    // Only the current term is synced.
    await expect(page.getByText("Old term HW")).toHaveCount(0);
    await expect(page.getByText(/MyCourseVille synced/)).toBeVisible();
  });

  test("tasks deep-link to MCV and courses list the current term", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Lab 5: OAuth" })).toHaveAttribute(
      "href",
      "https://www.mycourseville.com/?q=courseville/worksheet/1001/50001",
    );
    const courses = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Courses/ }) });
    await expect(courses.getByText("Computer Engineering Essentials")).toBeVisible();
    await expect(courses.getByText("Calculus II")).toBeVisible();
    await expect(courses.getByText("Calculus I", { exact: true })).toHaveCount(0);
  });

  test("marking a task done moves it to Done this week, and back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: 'Mark "Problem set 3" as done' }).check();
    const done = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Done this week/ }) });
    await expect(done.getByText("Problem set 3")).toBeVisible();
    // A sync never undoes the user's "done".
    await runCron(page.request);
    await page.reload();
    await expect(done.getByText("Problem set 3")).toBeVisible();
    await page.getByRole("checkbox", { name: 'Mark "Problem set 3" as not done' }).uncheck();
    await expect(done).toHaveCount(0);
  });

  test("Sync now runs without errors", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
    await expect(page.locator(".dash-header .error")).toHaveCount(0);
  });

  test("launcher links every CEDT platform", async ({ page }) => {
    await page.goto("/");
    const apps = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Apps" }) });
    const expected: [string, string][] = [
      ["MyCourseVille", "https://www.mycourseville.com/?q=courseville&type=course&role=all"],
      ["CEDT Grader", "https://cedt-grader.nattee.net/main/list"],
      ["Talent Journey", "https://talent.cedt.community/"],
      ["CEDT Intern Portal", "https://cedtintern.cp.eng.chula.ac.th/"],
      ["Nisitez", "https://nisitez.siamcodex.com/login"],
      ["CEDT-ICES", "https://cedt-ices.com/login"],
    ];
    for (const [name, href] of expected) {
      await expect(apps.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  test("cron with the secret syncs every user", async ({ request }) => {
    const body = await runCron(request);
    expect(body.mcv).toMatchObject({ users: 1, ok: 1, error: 0 });
  });
});
