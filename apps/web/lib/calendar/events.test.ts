import { schema } from "@cedt-hub/db";
import { eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../db";
import {
  createEvent,
  deleteEvent,
  eventInputSchema,
  getEvent,
  listCalendar,
  parseEventForm,
  updateEvent,
} from "./events";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("event form parsing", () => {
  it("parses a timed event in Bangkok time", () => {
    const r = parseEventForm(
      form({
        title: " Study HW3 ",
        date: "2026-12-03",
        start: "19:00",
        end: "21:00",
        location: "",
      }),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      title: "Study HW3",
      allDay: false,
      location: null,
      courseId: null,
    });
    expect(r.data.startsAt.toISOString()).toBe("2026-12-03T12:00:00.000Z");
    expect(r.data.endsAt.toISOString()).toBe("2026-12-03T14:00:00.000Z");
  });

  it("all-day events span whole local days, end date inclusive", () => {
    const r = parseEventForm(
      form({ title: "Exam week", date: "2026-12-07", endDate: "2026-12-11", allDay: "on" }),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.startsAt.toISOString()).toBe("2026-12-06T17:00:00.000Z");
    expect(r.data.endsAt.toISOString()).toBe("2026-12-11T17:00:00.000Z");
  });

  it("supports overnight events via endDate", () => {
    const r = parseEventForm(
      form({
        title: "Hackathon",
        date: "2026-12-05",
        endDate: "2026-12-06",
        start: "20:00",
        end: "08:00",
      }),
    );
    expect(r.success).toBe(true);
  });

  it("reports field errors", () => {
    const r = eventInputSchema.safeParse({
      title: "",
      date: "2026-12-03",
      start: "21:00",
      end: "19:00",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const paths = r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("title");
    const r2 = parseEventForm(
      form({ title: "x", date: "2026-12-03", start: "21:00", end: "19:00" }),
    );
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error.issues[0]?.message).toBe("End must be after start");
    const r3 = parseEventForm(form({ title: "x", date: "2026-12-03" }));
    expect(r3.success).toBe(false);
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("events (database)", () => {
  const me = `cal-${Date.now()}`;
  const other = `${me}-other`;
  const input = (title: string, startIso: string, endIso: string) => ({
    title,
    allDay: false,
    startsAt: new Date(startIso),
    endsAt: new Date(endIso),
    location: null,
    description: null,
    courseId: null,
  });

  beforeAll(async () => {
    await getDb()
      .insert(schema.user)
      .values([
        { id: me, name: "Me", email: `${me}@mcv.invalid` },
        { id: other, name: "Other", email: `${other}@mcv.invalid` },
      ]);
  });
  afterAll(async () => {
    await getDb().delete(schema.user).where(eq(schema.user.id, me));
    await getDb().delete(schema.user).where(eq(schema.user.id, other));
  });

  it("creates, lists by overlap, updates and deletes", async () => {
    const id = await createEvent(
      me,
      input("Study", "2026-12-03T12:00:00Z", "2026-12-03T14:00:00Z"),
    );
    expect(id).toBeTruthy();
    await createEvent(me, input("Long", "2026-11-30T00:00:00Z", "2026-12-10T00:00:00Z"));
    await createEvent(me, input("Outside", "2027-01-05T00:00:00Z", "2027-01-05T01:00:00Z"));

    const week = await listCalendar(
      me,
      new Date("2026-12-01T00:00:00Z"),
      new Date("2026-12-08T00:00:00Z"),
    );
    expect(week.map((i) => i.title)).toEqual(["Long", "Study"]); // overlap, sorted by start

    expect(
      await updateEvent(
        me,
        id as string,
        input("Study (moved)", "2026-12-04T12:00:00Z", "2026-12-04T13:00:00Z"),
      ),
    ).toBe(true);
    expect((await getEvent(me, id as string))?.title).toBe("Study (moved)");

    expect(await deleteEvent(me, id as string)).toEqual({ remoteId: null });
    expect(await getEvent(me, id as string)).toBeNull();
  });

  it("never lets another user read, edit or delete my events", async () => {
    const id = (await createEvent(
      me,
      input("Mine", "2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z"),
    )) as string;
    expect(await getEvent(other, id)).toBeNull();
    expect(
      await updateEvent(other, id, input("Hacked", "2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z")),
    ).toBe(false);
    expect(await deleteEvent(other, id)).toBe(false);
    expect((await getEvent(me, id))?.title).toBe("Mine");
  });

  it("ignores a course the user does not own", async () => {
    const [c] = await getDb()
      .insert(schema.course)
      .values({ userId: other, source: "mcv", sourceId: "x1", title: "Not mine" })
      .returning({ id: schema.course.id });
    const id = (await createEvent(me, {
      ...input("Linked", "2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z"),
      courseId: c?.id ?? null,
    })) as string;
    expect((await getEvent(me, id))?.courseId).toBeNull();
  });

  it("rejects malformed ids without querying", async () => {
    expect(await getEvent(me, "not-a-uuid")).toBeNull();
    expect(await deleteEvent(me, "not-a-uuid")).toBe(false);
  });
});
