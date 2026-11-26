#!/usr/bin/env node
// Calendar end-to-end test. Run by scripts/e2e-auth.sh after login.
// Submits the real server-action forms the way a browser without JavaScript would.
// Usage: node scripts/e2e-calendar.mjs <baseUrl> <curl-cookie-jar>
import { readFileSync } from "node:fs";

const [base, jarPath] = process.argv.slice(2);
const cookie = readFileSync(jarPath, "utf8")
  .split("\n")
  .map((l) => l.replace(/^#HttpOnly_/, ""))
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t"))
  .filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`)
  .join("; ");

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const pass = (msg) => console.log(`ok - ${msg}`);

const get = async (path) => {
  const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
  return { status: res.status, html: await res.text(), location: res.headers.get("location") };
};

/** Every <form> on the page as { action, hidden: FormData-ready pairs }. */
function forms(html) {
  return [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((m) => {
    const hidden = [...m[1].matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)].map((i) => {
      const name = /name="([^"]*)"/.exec(i[0])?.[1];
      const value = /value="([^"]*)"/.exec(i[0])?.[1] ?? "";
      return [name, value.replaceAll("&quot;", '"').replaceAll("&amp;", "&")];
    });
    return { html: m[0], hidden: hidden.filter(([n]) => n) };
  });
}

async function submit(path, form, fields) {
  const body = new FormData();
  for (const [k, v] of form.hidden) body.append(k, v);
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const res = await fetch(base + path, {
    method: "POST",
    headers: { cookie, origin: base },
    body,
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? res.headers.get("x-action-redirect"),
  };
}

// Bangkok "tomorrow"
const tomorrow = new Date(Date.now() + 7 * 3600_000 + 86400_000).toISOString().slice(0, 10);
const due = new Date(Date.now() + 7 * 3600_000 + 2 * 86400_000).toISOString().slice(0, 10);

// 1. MCV deadlines appear on the calendar.
const week = await get(`/calendar?view=week&date=${due}`);
if (week.status !== 200) fail(`calendar returned ${week.status}`);
if (!week.html.includes("Lab 5: OAuth")) fail("synced MCV deadline missing from week view");
pass("calendar shows MCV deadlines");

const month = await get(`/calendar?view=month&date=${due}`);
if (!month.html.includes("cal-grid month")) fail("month view did not render");
pass("month view renders");

// 2. Invalid input is rejected with a message.
const addForm = forms(week.html).find((f) => f.html.includes('name="title"'));
if (!addForm) fail("add-event form not found");
const bad = await submit("/calendar", addForm, {
  title: "Broken",
  date: tomorrow,
  start: "21:00",
  end: "19:00",
});
if (bad.status !== 200) fail(`invalid event should re-render the form, got ${bad.status}`);
const afterBad = await get(`/calendar?view=week&date=${tomorrow}`);
if (afterBad.html.includes(">Broken<") || afterBad.html.includes("Broken</"))
  fail("invalid event was saved");
pass("invalid event is rejected");

// 3. Create an event.
const created = await submit("/calendar", addForm, {
  title: "E2E study block",
  date: tomorrow,
  start: "19:00",
  end: "21:00",
  location: "Eng 4",
});
if (created.status !== 303 && created.status !== 200) fail(`create returned ${created.status}`);
const withEvent = await get(`/calendar?view=week&date=${tomorrow}`);
const link =
  /href="(\/calendar\/event\/[0-9a-f-]{36})"[^>]*>(?:(?!<\/a>)[\s\S])*E2E study block/.exec(
    withEvent.html,
  );
if (!link) fail("created event not shown on the calendar");
if (!withEvent.html.includes("19:00–21:00")) fail("event time not shown in Bangkok time");
pass("create event (19:00–21:00 Bangkok)");

// 4. Edit it.
const editPage = await get(link[1]);
if (editPage.status !== 200 || !editPage.html.includes('value="E2E study block"'))
  fail("edit page");
const editForm = forms(editPage.html).find((f) => f.html.includes('name="title"'));
const edited = await submit(link[1], editForm, {
  title: "E2E study block (moved)",
  date: tomorrow,
  start: "20:00",
  end: "22:00",
});
if (edited.status !== 303 && edited.status !== 200) fail(`edit returned ${edited.status}`);
const afterEdit = await get(`/calendar?view=week&date=${tomorrow}`);
if (
  !afterEdit.html.includes("E2E study block (moved)") ||
  !afterEdit.html.includes("20:00–22:00")
) {
  fail("edit not saved");
}
pass("edit event");

// 5. Delete it.
const editPage2 = await get(link[1]);
const deleteForm = forms(editPage2.html).find((f) => f.html.includes("Delete event"));
if (!deleteForm) fail("delete form not found");
const deleted = await submit(link[1], deleteForm, {});
if (deleted.status !== 303 && deleted.status !== 200) fail(`delete returned ${deleted.status}`);
const afterDelete = await get(`/calendar?view=week&date=${tomorrow}`);
if (afterDelete.html.includes("E2E study block")) fail("event still shown after delete");
if ((await get(link[1])).status !== 404) fail("deleted event page should 404");
pass("delete event");
