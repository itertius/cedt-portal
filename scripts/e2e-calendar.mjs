#!/usr/bin/env node
// Calendar end-to-end test. Run by scripts/e2e-auth.sh after login.
// Usage: node scripts/e2e-calendar.mjs <baseUrl> <curl-cookie-jar>
import { bkkDay, Client, fail, forms, pass } from "./e2e-lib.mjs";

const [base, jar] = process.argv.slice(2);
const app = new Client(base, jar);
const tomorrow = bkkDay(1);
const due = bkkDay(2);

const week = await app.get(`/calendar?view=week&date=${due}`);
if (week.status !== 200) fail(`calendar returned ${week.status}`);
if (!week.html.includes("Lab 5: OAuth")) fail("synced MCV deadline missing from week view");
pass("calendar shows MCV deadlines");

const month = await app.get(`/calendar?view=month&date=${due}`);
if (!month.html.includes("cal-grid month")) fail("month view did not render");
pass("month view renders");

const addForm = forms(week.html).find((f) => f.html.includes('name="title"'));
if (!addForm) fail("add-event form not found");
const bad = await app.submit("/calendar", addForm, {
  title: "Broken",
  date: tomorrow,
  start: "21:00",
  end: "19:00",
});
if (bad.status !== 200) fail(`invalid event should re-render the form, got ${bad.status}`);
if ((await app.get(`/calendar?view=week&date=${tomorrow}`)).html.includes("Broken"))
  fail("invalid event was saved");
pass("invalid event is rejected");

const created = await app.submit("/calendar", addForm, {
  title: "E2E study block",
  date: tomorrow,
  start: "19:00",
  end: "21:00",
  location: "Eng 4",
});
if (created.status !== 303 && created.status !== 200) fail(`create returned ${created.status}`);
const withEvent = await app.get(`/calendar?view=week&date=${tomorrow}`);
const link =
  /href="(\/calendar\/event\/[0-9a-f-]{36})"[^>]*>(?:(?!<\/a>)[\s\S])*E2E study block/.exec(
    withEvent.html,
  );
if (!link) fail("created event not shown on the calendar");
if (!withEvent.html.includes("19:00–21:00")) fail("event time not shown in Bangkok time");
pass("create event (19:00–21:00 Bangkok)");

const editPage = await app.get(link[1]);
if (editPage.status !== 200 || !editPage.html.includes('value="E2E study block"'))
  fail("edit page");
const editForm = forms(editPage.html).find((f) => f.html.includes('name="title"'));
await app.submit(link[1], editForm, {
  title: "E2E study block (moved)",
  date: tomorrow,
  start: "20:00",
  end: "22:00",
});
const afterEdit = await app.get(`/calendar?view=week&date=${tomorrow}`);
if (!afterEdit.html.includes("E2E study block (moved)") || !afterEdit.html.includes("20:00–22:00"))
  fail("edit not saved");
pass("edit event");

const deleteForm = forms((await app.get(link[1])).html).find((f) =>
  f.html.includes("Delete event"),
);
if (!deleteForm) fail("delete form not found");
await app.submit(link[1], deleteForm, {});
if ((await app.get(`/calendar?view=week&date=${tomorrow}`)).html.includes("E2E study block"))
  fail("event still shown after delete");
if ((await app.get(link[1])).status !== 404) fail("deleted event page should 404");
pass("delete event");
