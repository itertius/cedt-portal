#!/usr/bin/env node
// Google Calendar two-way sync end-to-end test against scripts/mock-google.mjs.
// Usage: node scripts/e2e-gcal.mjs <baseUrl> <curl-cookie-jar> <mockGoogleUrl> <cronSecret>
import { bkkDay, Client, fail, forms, pass, waitFor } from "./e2e-lib.mjs";

const [base, jar, google, cronSecret] = process.argv.slice(2);
const app = new Client(base, jar);
const tomorrow = bkkDay(1);

const googleEvents = async () => (await fetch(`${google}/__test/events`)).json();
const googleCopyOf = async (title) =>
  (await googleEvents()).find(
    (e) => e.summary === title && e.extendedProperties?.private?.cedtHubId,
  );
const cron = async () => {
  const r = await fetch(`${base}/api/cron/sync`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const body = await r.json();
  if (body.gcal?.error) fail(`google sync errored: ${JSON.stringify(body)}`);
  return body;
};
/** Calendar items rendered with this title (the HTML also embeds page data, so plain text counts double). */
const renderedItems = (html, title) =>
  [...html.matchAll(/<li class="cal-item[^"]*"[^>]*>((?:(?!<\/li>)[\s\S])*)<\/li>/g)].filter((m) =>
    m[1].includes(title),
  ).length;
const calendarHtml = async (day = tomorrow) =>
  (await app.get(`/calendar?view=week&date=${day}`)).html;

// 1. Connect Google from Settings (link to the logged-in MCV user).
const settings = await app.get("/settings");
if (!settings.html.includes("Connect Google Calendar"))
  fail("settings has no Connect Google button");
const link = await app.postJson("/api/auth/link-social", {
  provider: "google",
  callbackURL: "/settings",
});
if (!link.json?.url?.startsWith(`${google}/o/oauth2/v2/auth`))
  fail(`link-social: ${JSON.stringify(link)}`);
const authUrl = new URL(link.json.url);
if (!authUrl.searchParams.get("scope")?.includes("calendar.events"))
  fail("calendar scope not requested");
if (authUrl.searchParams.get("access_type") !== "offline") fail("offline access not requested");
if (!authUrl.searchParams.get("code_challenge")) fail("PKCE not used");
const toCallback = await fetch(link.json.url, { redirect: "manual" });
const callback = toCallback.headers.get("location");
if (!callback?.startsWith(`${base}/api/auth/callback/google`))
  fail(`bad redirect_uri: ${callback}`);
const done = await app.request(callback);
const landed = done.headers.get("location") ?? "";
if (done.status !== 302 || !landed.endsWith("/settings"))
  fail(`callback: ${done.status} ${landed}`);
if (!(await app.get("/settings")).html.includes("Connected. Your hub events"))
  fail("settings not connected");
const session = await app.get("/api/auth/get-session");
if (!session.html.includes("Test Student")) fail("linking Google must keep the MCV user logged in");
pass("connect Google Calendar (PKCE, offline, calendar scope) keeps the MCV login");

// 2. Pull: native Google events appear, read-only.
await cron();
let html = await calendarHtml();
if (!html.includes("Google: Club meeting")) fail("Google event not pulled");
if (!html.includes("09:00–11:00")) fail("Google event time wrong");
if (
  !/href="https:\/\/calendar\.google\.com\/[^"]*"[^>]*>(?:(?!<\/a>)[\s\S])*Google: Club meeting/.test(
    html,
  )
) {
  fail("Google event should link to Google, not to the hub editor");
}
if (!(await calendarHtml(bkkDay(3))).includes("Google: Holiday"))
  fail("all-day Google event not pulled");
pass("pull Google events (timed + all-day) as read-only");

// 3. Push: a hub event appears in Google, tagged with its hub id.
const addForm = forms(html).find((f) => f.html.includes('name="title"'));
await app.submit("/calendar", addForm, {
  title: "E2E gcal push",
  date: tomorrow,
  start: "15:00",
  end: "16:00",
});
const copy = await waitFor(() => googleCopyOf("E2E gcal push"), "hub event in Google");
if (copy.start?.timeZone !== "Asia/Bangkok") fail("pushed event should carry Asia/Bangkok");
await cron(); // must not duplicate the copy as a "gcal" event
html = await calendarHtml();
if (renderedItems(html, "E2E gcal push") !== 1) {
  fail("hub event duplicated after pulling its own copy");
}
pass("push hub event to Google without duplicates");

// 4. Edited in Google -> updated in the hub.
await fetch(`${google}/__test/events/${copy.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ summary: "E2E edited in Google" }),
});
await cron();
html = await calendarHtml();
if (!html.includes("E2E edited in Google") || html.includes("E2E gcal push"))
  fail("Google edit not pulled");
pass("edit in Google updates the hub event");

// 5. Edited in the hub -> updated in Google.
const hubLink =
  /href="(\/calendar\/event\/[0-9a-f-]{36})"[^>]*>(?:(?!<\/a>)[\s\S])*E2E edited in Google/.exec(
    html,
  );
if (!hubLink) fail("edited event should still be a hub event");
const editForm = forms((await app.get(hubLink[1])).html).find((f) =>
  f.html.includes('name="title"'),
);
await app.submit(hubLink[1], editForm, {
  title: "E2E edited in hub",
  date: tomorrow,
  start: "16:00",
  end: "17:00",
});
await waitFor(
  async () =>
    (await googleEvents()).find((e) => e.id === copy.id && e.summary === "E2E edited in hub"),
  "hub edit in Google",
);
pass("edit in the hub updates Google");

// 6. Deleted in the hub -> deleted in Google.
const deleteForm = forms((await app.get(hubLink[1])).html).find((f) =>
  f.html.includes("Delete event"),
);
await app.submit(hubLink[1], deleteForm, {});
await waitFor(
  async () => (await googleEvents()).find((e) => e.id === copy.id && e.status === "cancelled"),
  "Google copy deleted",
);
pass("delete in the hub deletes the Google copy");

// 7. Deleted in Google -> deleted in the hub (both hub copies and native events).
await app.submit("/calendar", addForm, {
  title: "E2E delete me in Google",
  date: tomorrow,
  start: "18:00",
  end: "19:00",
});
const copy2 = await waitFor(() => googleCopyOf("E2E delete me in Google"), "second copy in Google");
await fetch(`${google}/__test/events/${copy2.id}`, { method: "DELETE" });
await fetch(`${google}/__test/events/gnative1`, { method: "DELETE" });
await cron();
html = await calendarHtml();
if (html.includes("E2E delete me in Google")) fail("hub event deleted in Google still shown");
if (html.includes("Google: Club meeting")) fail("native event deleted in Google still shown");
pass("delete in Google removes it from the hub");
