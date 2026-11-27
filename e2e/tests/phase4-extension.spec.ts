import { fileURLToPath } from "node:url";
import { type BrowserContext, test as base, chromium, expect } from "@playwright/test";
import { E2E } from "../support/env";
import { dbQuery, loginWithMcv } from "../support/helpers";

// Phase 4 (first piece): the real CEDT Hub extension, loaded into Chromium, pairs with the hub in
// one click and keeps the Intern Portal session synced with no copy-pasting.
const EXTENSION = fileURLToPath(new URL("../../apps/extension", import.meta.url));

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium", // new headless mode supports extensions
      baseURL: E2E.baseURL,
      timezoneId: "Asia/Bangkok",
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.41" },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
});

test.describe.configure({ mode: "serial" });

const popup = async (context: BrowserContext, id: string) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  return page;
};

test("Phase 4 · extension: one-click pairing, automatic sync, login prompt, revoke", async ({
  context,
  extensionId,
}) => {
  // Logged into the hub in this browser.
  const hub = await context.newPage();
  await loginWithMcv(hub);

  // 1. Popup: point it at the test hub and mock portal, then Connect.
  let pop = await popup(context, extensionId);
  await pop.locator("summary").click();
  await pop.locator("#portal").fill(E2E.internURL);
  await pop.locator("#save-portal").click();
  await pop.locator("#hub").selectOption("custom");
  await pop.locator("#hub-custom").fill(E2E.baseURL);
  const [pairTab] = await Promise.all([
    context.waitForEvent("page"),
    pop.locator("#connect").click(),
  ]);

  // 2. Hub pairing page: the extension is detected; one click on Allow.
  await pairTab.waitForLoadState();
  await expect(pairTab).toHaveURL(/\/extension\/connect\?state=/);
  const allow = pairTab.getByRole("button", { name: "Allow" });
  await expect(allow).toBeEnabled();
  await allow.click();
  await expect(pairTab.getByRole("status")).toContainText("Connected.");
  // The token never appears on the page.
  expect(await pairTab.content()).not.toContain("cedtx_");

  // 3. Logging in to the Intern Portal (a cookie appears) syncs the hub by itself.
  await context.addCookies([{ name: "cedt_session", value: "good", url: E2E.internURL }]);
  await expect
    .poll(
      async () => (await dbQuery<{ n: number }>("select count(*)::int as n from internship"))[0]?.n,
      {
        timeout: 20_000,
      },
    )
    .toBe(3);
  const [cred] = await dbQuery<{ label: string; secret: string }>(
    `select label, secret from connector_credential where source = 'intern'`,
  );
  expect(cred?.label).toContain("browser extension");
  expect(cred?.secret.startsWith("v1.")).toBe(true);

  pop = await popup(context, extensionId); // like clicking the icon again
  await expect(pop.locator("#who")).toContainText("as Test Student");
  await expect(pop.locator("#intern-status")).toContainText("3 openings");

  // 4. Settings lists the browser, and the hub shows the openings.
  await hub.goto("/settings");
  const card = hub.locator("section#extension");
  await expect(card).toContainText("Chrome");
  await expect(card).toContainText("last update");
  await hub.goto("/internships");
  await expect(hub.locator(".internship")).toHaveCount(3);

  // 5. Logged out of the portal (session no longer valid): the popup asks to log in.
  await context.addCookies([{ name: "cedt_session", value: "expired", url: E2E.internURL }]);
  pop = await popup(context, extensionId); // like clicking the icon again
  await expect(pop.locator("#intern-status")).toContainText("Log in to the Intern Portal", {
    timeout: 15_000,
  });
  await expect(pop.locator("#open-portal")).toBeVisible();

  // 6. Disconnecting the browser in Settings: the extension notices and asks to connect again.
  await hub.goto("/settings");
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card).toContainText("Install it, click its icon");
  pop = await popup(context, extensionId); // like clicking the icon again
  await pop.locator("#sync").click();
  await expect(pop.locator("#unpaired")).toBeVisible();
  await expect(pop.locator("#unpaired p")).toContainText("disconnected in CEDT Hub");
});

test("the pairing page refuses to run without a state from the extension", async ({ context }) => {
  const page = await context.newPage();
  await loginWithMcv(page);
  await page.goto("/extension/connect");
  await expect(page.getByText("Open this page from the extension")).toBeVisible();
});
