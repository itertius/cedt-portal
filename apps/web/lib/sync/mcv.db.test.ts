import type { McvSnapshot } from "@cedt-hub/connectors/mcv";
import { schema } from "@cedt-hub/db";
import { eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { acquireLock, releaseLock, saveMcvSnapshot } from "./mcv";

// Runs only against a real, migrated database. Skipped locally without one; required in CI.
if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in CI so database tests cannot be skipped silently");
}
const run = process.env.DATABASE_URL ? describe : describe.skip;

const userId = `test-${Date.now()}`;
const course = (id: string, title = `Course ${id}`) => ({
  source: "mcv" as const,
  sourceId: id,
  code: id,
  title,
  year: 2026,
  semester: 2,
  role: "student",
  url: null,
});
const taskOf = (courseId: string, id: string, title = `Task ${id}`) => ({
  source: "mcv" as const,
  sourceId: id,
  courseSourceId: courseId,
  title,
  dueAt: new Date("2027-01-01T00:00:00Z"),
  url: null,
});

async function tasks() {
  const rows = await getDb()
    .select({
      sourceId: schema.task.sourceId,
      title: schema.task.title,
      completedAt: schema.task.completedAt,
    })
    .from(schema.task)
    .where(eq(schema.task.userId, userId));
  return rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

run("saveMcvSnapshot (database)", () => {
  beforeAll(async () => {
    await getDb()
      .insert(schema.user)
      .values({ id: userId, name: "Test", email: `${userId}@mcv.invalid` });
  });
  afterAll(async () => {
    await getDb().delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("inserts, updates, keeps user state, and deletes only for fully fetched courses", async () => {
    const first: McvSnapshot = {
      courses: [course("A"), course("B")],
      tasks: [taskOf("A", "1"), taskOf("A", "2"), taskOf("B", "3")],
      fetchedCourses: ["A", "B"],
      failedCourses: [],
    };
    await saveMcvSnapshot(userId, first);
    expect((await tasks()).map((t) => t.sourceId)).toEqual(["1", "2", "3"]);

    // The user ticks task 1 as done.
    await getDb()
      .update(schema.task)
      .set({ completedAt: new Date() })
      .where(eq(schema.task.sourceId, "1"));

    // Next sync: task 1 renamed, task 2 removed on MCV, course B failed to fetch.
    await saveMcvSnapshot(userId, {
      courses: [course("A"), course("B")],
      tasks: [taskOf("A", "1", "Task 1 (renamed)")],
      fetchedCourses: ["A"],
      failedCourses: [{ sourceId: "B", error: "MCV 500" }],
    });

    const after = await tasks();
    expect(after.map((t) => t.sourceId)).toEqual(["1", "3"]); // 2 deleted, 3 kept (B failed)
    expect(after[0]?.title).toBe("Task 1 (renamed)");
    expect(after[0]?.completedAt).not.toBeNull(); // user state survives a sync

    // A fetched course that now has no assignments loses all of them.
    await saveMcvSnapshot(userId, {
      courses: [course("A"), course("B")],
      tasks: [],
      fetchedCourses: ["A", "B"],
      failedCourses: [],
    });
    expect(await tasks()).toEqual([]);
  });

  it("allows only one running sync per user", async () => {
    expect(await acquireLock(userId)).toBe(true);
    expect(await acquireLock(userId)).toBe(false);
    await releaseLock(userId, null);
    expect(await acquireLock(userId)).toBe(true);
    await releaseLock(userId, "boom");
    expect(await acquireLock(userId)).toBe(true); // an errored sync can be retried
    await releaseLock(userId, null);
  });
});
