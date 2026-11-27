import type { NormalizedGoogleEvent } from "@cedt-hub/connectors/gcal";
import { schema } from "@cedt-hub/db";
import { and, eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { applyGoogleEvents, forgetGoogleEvents } from "./gcal";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const { event } = schema;

const W0 = new Date("2026-11-01T00:00:00Z");
const W1 = new Date("2027-06-01T00:00:00Z");

const g = (over: Partial<NormalizedGoogleEvent> & { remoteId: string }): NormalizedGoogleEvent => ({
  cancelled: false,
  hubId: null,
  title: "Google event",
  description: null,
  location: null,
  startsAt: new Date("2026-12-03T02:00:00Z"),
  endsAt: new Date("2026-12-03T03:00:00Z"),
  allDay: false,
  url: null,
  updated: "2026-11-20T00:00:00.000Z",
  ...over,
});

run("applyGoogleEvents (database)", () => {
  const userId = `gcal-${Date.now()}`;
  const db = () => getDb();
  const rows = () => db().select().from(event).where(eq(event.userId, userId)).orderBy(event.title);

  async function hubEvent(
    title: string,
    state: { pushed: boolean; editedHere?: boolean; remoteUpdated?: string },
  ) {
    const t = new Date("2026-11-25T00:00:00Z");
    const [row] = await db()
      .insert(event)
      .values({
        userId,
        source: "hub",
        title,
        startsAt: new Date("2026-12-04T02:00:00Z"),
        endsAt: new Date("2026-12-04T03:00:00Z"),
        remoteId: state.pushed ? `r-${title}` : null,
        remoteUpdated: state.remoteUpdated ?? (state.pushed ? "v1" : null),
        pushedAt: state.pushed ? t : null,
        updatedAt: state.editedHere ? new Date(t.getTime() + 60_000) : t,
      })
      .returning();
    return row as typeof event.$inferSelect;
  }

  beforeAll(async () => {
    await db()
      .insert(schema.user)
      .values({ id: userId, name: "G", email: `${userId}@mcv.invalid` });
  });
  afterAll(async () => {
    await db().delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("mirrors native events, then removes ones Google no longer lists in the window", async () => {
    const remove = vi.fn(async () => {});
    await applyGoogleEvents(
      userId,
      "tok",
      [g({ remoteId: "n1", title: "Lecture" }), g({ remoteId: "n2", title: "Lab" })],
      W0,
      W1,
      { remove },
    );
    expect((await rows()).map((r) => [r.source, r.title])).toEqual([
      ["gcal", "Lab"],
      ["gcal", "Lecture"],
    ]);

    // Outside the window: never touched even if Google does not list it.
    await db()
      .insert(event)
      .values({
        userId,
        source: "gcal",
        sourceId: "old",
        title: "Old",
        startsAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: new Date("2026-01-01T01:00:00Z"),
      });

    const r = await applyGoogleEvents(
      userId,
      "tok",
      [g({ remoteId: "n1", title: "Lecture (moved)" }), g({ remoteId: "n2", cancelled: true })],
      W0,
      W1,
      { remove },
    );
    expect(r.deleted).toBe(1);
    expect((await rows()).map((x) => x.title)).toEqual(["Lecture (moved)", "Old"]);
    expect(remove).not.toHaveBeenCalled();
    await db().delete(event).where(eq(event.userId, userId));
  });

  it("applies Google edits to hub events, but local unpushed edits win", async () => {
    const remove = vi.fn(async () => {});
    const clean = await hubEvent("Clean", { pushed: true });
    const dirty = await hubEvent("Dirty", { pushed: true, editedHere: true });
    const same = await hubEvent("Same", { pushed: true, remoteUpdated: "v1" });

    const r = await applyGoogleEvents(
      userId,
      "tok",
      [
        g({
          remoteId: clean.remoteId as string,
          hubId: clean.id,
          title: "Clean (Google)",
          updated: "v2",
        }),
        g({
          remoteId: dirty.remoteId as string,
          hubId: dirty.id,
          title: "Dirty (Google)",
          updated: "v2",
        }),
        g({
          remoteId: same.remoteId as string,
          hubId: same.id,
          title: "Same (Google?)",
          updated: "v1",
        }),
      ],
      W0,
      W1,
      { remove },
    );
    expect(r.pulled).toBe(1);
    const byId = new Map((await rows()).map((x) => [x.id, x]));
    expect(byId.get(clean.id)?.title).toBe("Clean (Google)");
    expect(byId.get(clean.id)?.remoteUpdated).toBe("v2");
    // a pulled change must not count as a local change to push back
    expect(byId.get(clean.id)?.updatedAt.getTime()).toBe(byId.get(clean.id)?.pushedAt?.getTime());
    expect(byId.get(dirty.id)?.title).toBe("Dirty"); // local edit wins; push will overwrite Google
    expect(byId.get(same.id)?.title).toBe("Same"); // unchanged `updated` = our own write
    await db().delete(event).where(eq(event.userId, userId));
  });

  it("deletes hub events cancelled in Google and removes orphan Google copies", async () => {
    const remove = vi.fn(async () => {});
    const gone = await hubEvent("Cancelled in Google", { pushed: true });
    const r = await applyGoogleEvents(
      userId,
      "tok",
      [
        g({ remoteId: gone.remoteId as string, hubId: gone.id, cancelled: true }),
        g({ remoteId: "orphan", hubId: "00000000-0000-4000-8000-000000000000", title: "Orphan" }),
      ],
      W0,
      W1,
      { remove },
    );
    expect(r.deleted).toBe(2);
    expect(await rows()).toEqual([]);
    expect(remove).toHaveBeenCalledWith("tok", "orphan");
  });

  it("ignores another user's hub event even if Google tags it", async () => {
    const otherId = `${userId}-other`;
    await db()
      .insert(schema.user)
      .values({ id: otherId, name: "O", email: `${otherId}@mcv.invalid` });
    const [theirs] = await db()
      .insert(event)
      .values({ userId: otherId, source: "hub", title: "Theirs", startsAt: W0, endsAt: W1 })
      .returning();
    const remove = vi.fn(async () => {});
    await applyGoogleEvents(
      userId,
      "tok",
      [g({ remoteId: "x", hubId: theirs?.id as string, cancelled: true })],
      W0,
      W1,
      { remove },
    );
    const [still] = await db()
      .select()
      .from(event)
      .where(and(eq(event.id, theirs?.id as string)));
    expect(still?.title).toBe("Theirs");
    await db().delete(schema.user).where(eq(schema.user.id, otherId));
  });

  it("disconnect forgets Google events and push state, keeps hub events", async () => {
    await hubEvent("Keep me", { pushed: true });
    await applyGoogleEvents(userId, "tok", [g({ remoteId: "n9", title: "Mirror" })], W0, W1, {
      remove: vi.fn(),
    });
    await forgetGoogleEvents(userId);
    const left = await rows();
    expect(left.map((x) => [x.source, x.title, x.remoteId, x.pushedAt])).toEqual([
      ["hub", "Keep me", null, null],
    ]);
  });
});
