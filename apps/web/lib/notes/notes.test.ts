import { schema } from "@cedt-hub/db";
import { eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../db";
import {
  createNote,
  deleteNote,
  excerpt,
  getNote,
  likePattern,
  listNotes,
  NOTE_LIMITS,
  parseNoteForm,
  updateNote,
} from "./notes";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("note helpers", () => {
  it("parses the form, keeping markdown whitespace", () => {
    const r = parseNoteForm(
      form({ title: "  Lecture 5 ", body: "# H\r\n\r\n    code", pinned: "on" }),
    );
    expect(r.success && r.data).toEqual({
      title: "Lecture 5",
      body: "# H\n\n    code",
      courseId: null,
      eventId: null,
      pinned: true,
    });
  });

  it("rejects oversized notes and bad ids", () => {
    expect(
      parseNoteForm(form({ title: "x", body: "a".repeat(NOTE_LIMITS.body + 1) })).success,
    ).toBe(false);
    expect(parseNoteForm(form({ title: "x", body: "", courseId: "nope" })).success).toBe(false);
  });

  it("escapes LIKE wildcards", () => {
    expect(likePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });

  it("builds a plain-text excerpt from markdown", () => {
    expect(excerpt("# Title\n\nSee [docs](https://x.y) and `code`.\n\n```js\nhidden()\n```")).toBe(
      "Title See docs and code .",
    );
    expect(excerpt("a".repeat(300), 10)).toBe("aaaaaaaaa…");
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("notes (database)", () => {
  const me = `notes-${Date.now()}`;
  const other = `${me}-o`;
  const base = { title: "", body: "", courseId: null, eventId: null, pinned: false };

  beforeAll(async () => {
    await getDb()
      .insert(schema.user)
      .values([
        { id: me, name: "Me", email: `${me}@mcv.invalid` },
        { id: other, name: "O", email: `${other}@mcv.invalid` },
      ]);
  });
  afterAll(async () => {
    await getDb().delete(schema.user).where(eq(schema.user.id, me));
    await getDb().delete(schema.user).where(eq(schema.user.id, other));
  });

  it("creates, updates, lists newest first with pinned on top, deletes", async () => {
    const a = await createNote(me, { title: "Alpha" });
    const b = await createNote(me, { title: "Beta" });
    await updateNote(me, a, { ...base, title: "Alpha", body: "edited" });
    expect((await listNotes(me)).map((n) => n.title)).toEqual(["Alpha", "Beta"]);
    await updateNote(me, b, { ...base, title: "Beta", pinned: true });
    expect((await listNotes(me)).map((n) => n.title)).toEqual(["Beta", "Alpha"]);
    expect(await deleteNote(me, a)).toBe(true);
    expect(await getNote(me, a)).toBeNull();
    await deleteNote(me, b);
  });

  it("searches title and body, including Thai substrings and literal wildcards", async () => {
    await createNote(me, { title: "Calculus", body: "การอินทิเกรตแบบแยกส่วน" });
    await createNote(me, { title: "Discount", body: "save 100% now" });
    await createNote(me, { title: "Other", body: "1000 items" });
    const titles = async (q: string) => (await listNotes(me, { q })).map((n) => n.title).sort();
    expect(await titles("calc")).toEqual(["Calculus"]);
    expect(await titles("อินทิเกรต")).toEqual(["Calculus"]); // Thai has no word spaces
    expect(await titles("100%")).toEqual(["Discount"]); // % is literal, not a wildcard
    expect(await titles("")).toHaveLength(3);
  });

  it("keeps notes private and ignores links to other users' courses", async () => {
    const [theirCourse] = await getDb()
      .insert(schema.course)
      .values({ userId: other, source: "mcv", sourceId: "c1", title: "Theirs" })
      .returning({ id: schema.course.id });
    const id = await createNote(me, { title: "Private", courseId: theirCourse?.id ?? null });
    expect((await getNote(me, id))?.courseId).toBeNull();
    expect(await getNote(other, id)).toBeNull();
    expect(await updateNote(other, id, { ...base, title: "Hacked" })).toBeNull();
    expect(await deleteNote(other, id)).toBe(false);
    expect((await listNotes(other)).map((n) => n.title)).not.toContain("Private");
    expect(await getNote(me, "not-a-uuid")).toBeNull();
  });

  it("links to the user's own course and filters by it", async () => {
    const [mine] = await getDb()
      .insert(schema.course)
      .values({ userId: me, source: "mcv", sourceId: "c2", code: "2110101", title: "Mine" })
      .returning({ id: schema.course.id });
    const id = await createNote(me, { title: "Linked", courseId: mine?.id ?? null });
    const list = await listNotes(me, { courseId: mine?.id });
    expect(list.map((n) => [n.title, n.courseCode])).toEqual([["Linked", "2110101"]]);
    expect((await getNote(me, id))?.courseId).toBe(mine?.id);
  });
});
