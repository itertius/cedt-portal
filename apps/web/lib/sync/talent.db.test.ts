import { schema } from "@cedt-hub/db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import {
  listTalentActivities,
  syncTalent,
  talentSyncedAt,
  upcomingTalentActivities,
} from "./talent";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const feed = (activities: object[]) =>
  vi.fn(async () =>
    Response.json({ success: true, data: { activities } }),
  ) as unknown as typeof fetch;

run("Talent Journey sync (database)", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  beforeEach(async () => {
    await getDb().delete(schema.talentActivity);
    await getDb().delete(schema.appState);
  });
  afterAll(async () => {
    await getDb().delete(schema.talentActivity);
    await getDb().delete(schema.appState);
  });

  it("stores activities, updates them, and drops cancelled upcoming ones", async () => {
    const a = {
      activityId: 1,
      name: "Career talk",
      date: "2026-12-01",
      startTime: "13:00:00",
      endTime: "16:00:00",
    };
    const b = {
      activityId: 2,
      name: "Workshop",
      date: "2026-12-02",
      startTime: "09:00:00",
      endTime: "12:00:00",
    };
    const past = {
      activityId: 3,
      name: "Last week",
      date: "2026-11-20",
      startTime: "09:00:00",
      endTime: "10:00:00",
    };
    expect(await syncTalent({ force: true, fetchImpl: feed([a, b, past]), now })).toMatchObject({
      status: "ok",
      activities: 3,
    });

    // b was cancelled, a renamed, the past one simply aged off the feed.
    const r = await syncTalent({
      force: true,
      fetchImpl: feed([{ ...a, name: "Career talk (moved)" }]),
      now,
    });
    expect(r).toEqual({ status: "ok", activities: 1, removed: 1 });
    const rows = await listTalentActivities(
      new Date("2026-11-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(rows.map((x) => x.name)).toEqual(["Last week", "Career talk (moved)"]);
    expect((await upcomingTalentActivities(5, now)).map((x) => x.activityId)).toEqual([1]);
  });

  it("is polite: skips while fresh, and reports fetch errors without touching data", async () => {
    // Pin the clock for every call: the result must not depend on the time of day CI runs.
    await syncTalent({ force: true, fetchImpl: feed([]), now });
    expect(await talentSyncedAt()).toEqual(now);
    const spy = feed([]);
    const in59min = new Date(now.getTime() + 59 * 60_000);
    expect(await syncTalent({ fetchImpl: spy, now: in59min })).toEqual({
      status: "skipped",
      reason: "fresh",
    });
    expect(spy).not.toHaveBeenCalled();
    const in61min = new Date(now.getTime() + 61 * 60_000);
    expect(await syncTalent({ fetchImpl: spy, now: in61min })).toMatchObject({ status: "ok" });
    expect(spy).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => new Response("", { status: 502 })) as unknown as typeof fetch;
    expect(await syncTalent({ force: true, fetchImpl: down })).toEqual({
      status: "error",
      error: "Talent Journey 502",
    });
  });
});
