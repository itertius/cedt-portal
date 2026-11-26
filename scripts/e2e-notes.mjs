#!/usr/bin/env node
// Notes end-to-end test. Run by scripts/e2e-auth.sh after login + MCV sync.
// Usage: node scripts/e2e-notes.mjs <baseUrl> <curl-cookie-jar>
import { bkkDay, Client, fail, forms, pass } from "./e2e-lib.mjs";

const [base, jar] = process.argv.slice(2);
const app = new Client(base, jar);

const list = await app.get("/notes");
if (list.status !== 200 || !list.html.includes("No notes yet")) fail("empty notes page");

// 1. New note -> redirected to its editor.
const newForm = forms(list.html).find((f) => f.html.includes("New note"));
const created = await app.submit("/notes", newForm, {});
const noteUrl = created.location?.match(/\/notes\/[0-9a-f-]{36}$/)?.[0];
if (!noteUrl)
  fail(`new note should redirect to the editor, got ${created.status} ${created.location}`);
pass("create note");

// 2. Save title, markdown body and a course link (the plain form works without JavaScript).
const editor = await app.get(noteUrl);
const course = /<option value="([0-9a-f-]{36})">2110101 /.exec(editor.html)?.[1];
if (!course) fail("synced MCV course missing from the course picker");
const saveForm = forms(editor.html).find((f) => f.html.includes('name="body"'));
const body = [
  "# Integration",
  "",
  "การอินทิเกรตแบบแยกส่วน by **parts**",
  "",
  "<script>alert('xss')</script>",
  "[bad link](javascript:alert(1))",
].join("\n");
const saved = await app.submit(noteUrl, saveForm, {
  title: "E2E Calculus notes",
  body,
  courseId: course,
});
if (saved.status !== 200) fail(`save returned ${saved.status}`);
const reopened = await app.get(noteUrl);
if (!reopened.html.includes('value="E2E Calculus notes"')) fail("title not saved");
if (!reopened.html.includes("การอินทิเกรตแบบแยกส่วน")) fail("Thai body not saved");
if (!new RegExp(`<option value="${course}" selected`).test(reopened.html))
  fail("course link not saved");
pass("save note with markdown, Thai text and course link");

// 3. Untrusted markdown never becomes live HTML.
for (const page of [reopened.html, (await app.get("/notes")).html]) {
  if (page.includes("<script>alert('xss')</script>"))
    fail("raw <script> from a note reached the page");
  if (/href="javascript:/i.test(page)) fail("javascript: link reached the page");
}
pass("note content is escaped (no script injection)");

// 4. Search: Thai substring, course filter, no match.
const thai = await app.get(`/notes?q=${encodeURIComponent("อินทิเกรต")}`);
if (!thai.html.includes("E2E Calculus notes")) fail("Thai substring search");
const byCourse = await app.get(`/notes?course=${course}`);
if (!byCourse.html.includes("E2E Calculus notes")) fail("course filter");
const none = await app.get(`/notes?q=${encodeURIComponent("nothing like this 123")}`);
if (!none.html.includes("No notes match")) fail("non-matching search should be empty");
pass("search notes (Thai substring, course filter)");

// 5. Notes for a calendar event.
const cal = await app.get(`/calendar?view=week&date=${bkkDay(1)}`);
const addEvent = forms(cal.html).find((f) => f.html.includes('name="title"'));
await app.submit("/calendar", addEvent, {
  title: "E2E review session",
  date: bkkDay(1),
  start: "13:00",
  end: "14:00",
});
const eventUrl =
  /href="(\/calendar\/event\/[0-9a-f-]{36})"[^>]*>(?:(?!<\/a>)[\s\S])*E2E review session/.exec(
    (await app.get(`/calendar?view=week&date=${bkkDay(1)}`)).html,
  )?.[1];
if (!eventUrl) fail("event for notes not created");
const eventPage = await app.get(eventUrl);
const eventNoteForm = forms(eventPage.html).find((f) => f.html.includes("New note for this event"));
const eventNote = await app.submit(eventUrl, eventNoteForm, {});
const eventNoteUrl = eventNote.location?.match(/\/notes\/[0-9a-f-]{36}$/)?.[0];
if (!eventNoteUrl) fail("new note for event should open the editor");
if (!(await app.get(eventNoteUrl)).html.includes('value="E2E review session"'))
  fail("event note title");
if (!(await app.get(eventUrl)).html.includes(`href="${eventNoteUrl}"`))
  fail("event page should list its note");
pass("create a note from a calendar event");

// 6. Delete.
const delForm = forms((await app.get(noteUrl)).html).find((f) => f.html.includes("Delete note"));
await app.submit(noteUrl, delForm, {});
if ((await app.get("/notes")).html.includes("E2E Calculus notes"))
  fail("deleted note still listed");
if ((await app.get(noteUrl)).status !== 404) fail("deleted note should 404");
pass("delete note");
