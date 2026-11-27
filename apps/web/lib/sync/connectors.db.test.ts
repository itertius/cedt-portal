import { schema } from "@cedt-hub/db";
import { and, eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  credentialInfo,
  deleteCredential,
  getCredential,
  saveCredential,
} from "../connectors/credentials";
import { getDb } from "../db";
import { disconnectGrader, graderSummary, saveGraderProblems } from "./grader";
import { disconnectIntern, listInternships, saveInternData } from "./intern";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("connector credentials and data (database)", () => {
  const userId = `conn-${Date.now()}`;
  const db = () => getDb();
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "db-test-secret-db-test-secret-xx";
    await db()
      .insert(schema.user)
      .values({ id: userId, name: "C", email: `${userId}@mcv.invalid` });
  });
  afterAll(async () => {
    await db().delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("stores credentials encrypted and exposes only metadata", async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    await saveCredential(userId, "grader", "jwt.super-secret-token", {
      label: "6630000021",
      expiresAt,
    });
    const [raw] = await db()
      .select()
      .from(schema.connectorCredential)
      .where(
        and(
          eq(schema.connectorCredential.userId, userId),
          eq(schema.connectorCredential.source, "grader"),
        ),
      );
    expect(raw?.secret.startsWith("v1.")).toBe(true);
    expect(raw?.secret).not.toContain("super-secret");
    expect(await getCredential(userId, "grader")).toMatchObject({
      secret: "jwt.super-secret-token",
      expired: false,
    });
    expect(await credentialInfo(userId, "grader")).toMatchObject({ label: "6630000021" });
    expect(Object.keys((await credentialInfo(userId, "grader")) ?? {})).not.toContain("secret");

    await saveCredential(userId, "grader", "jwt.old", { expiresAt: new Date(Date.now() - 1000) });
    expect((await getCredential(userId, "grader"))?.expired).toBe(true);
    await deleteCredential(userId, "grader");
    expect(await getCredential(userId, "grader")).toBeNull();
  });

  it("grader: upserts problems, drops removed ones, summarizes progress; disconnect wipes all", async () => {
    const p = (problemId: number, bestScore: number | null, submissionCount: number) => ({
      problemId,
      name: `P${problemId}`,
      fullName: null,
      bestScore,
      lastScore: bestScore,
      submissionCount,
      lastSubmittedAt: submissionCount ? new Date() : null,
      tags: [],
    });
    await saveCredential(userId, "grader", "jwt");
    await saveGraderProblems(userId, [p(1, 100, 2), p(2, 40, 3), p(3, null, 0), p(4, 0, 1)]);
    let s = await graderSummary(userId);
    expect([s.total, s.solved, s.inProgress.map((x) => x.problemId).sort()]).toEqual([
      4,
      1,
      [2, 4],
    ]);
    await saveGraderProblems(userId, [p(1, 100, 2), p(2, 100, 4)]);
    s = await graderSummary(userId);
    expect([s.total, s.solved, s.inProgress.length]).toEqual([2, 2, 0]);
    await disconnectGrader(userId);
    expect((await graderSummary(userId)).total).toBe(0);
    expect(await getCredential(userId, "grader")).toBeNull();
  });

  it("intern: openings + deadlines; user 'done' survives a sync; disconnect wipes all", async () => {
    const opening = (openingId: number, compensation: number | null, bookmarked = false) => ({
      openingId,
      sessionId: 9,
      title: `Role ${openingId}`,
      company: openingId === 2 ? "Beta Co" : "Acme",
      logoUrl: null,
      tags: ["Backend"],
      workingCondition: "Hybrid",
      compensation,
      compensationType: null,
      quota: 1,
      startDate: null,
      endDate: null,
      bookmarked,
      acceptingApplications: true,
      url: `https://cedtintern.cp.eng.chula.ac.th/opening/${openingId}/session/9`,
    });
    const deadline = {
      sourceId: "9:s:studentRankingDeadline",
      title: "Rank your internship choices · S",
      dueAt: new Date("2026-12-10T16:59:59Z"),
      kind: "deadline" as const,
    };
    const session = { sessionId: 9, title: "S", deadlines: [deadline] };
    await saveCredential(userId, "intern", "sid=abc");
    await saveInternData(
      userId,
      session,
      [opening(1, 15000, true), opening(2, 20000), opening(3, null)],
      [deadline],
    );

    expect((await listInternships(userId)).map((o) => o.openingId)).toEqual([2, 1, 3]); // pay desc, nulls last
    expect((await listInternships(userId, { bookmarked: true })).map((o) => o.openingId)).toEqual([
      1,
    ]);
    expect((await listInternships(userId, { q: "beta" })).map((o) => o.openingId)).toEqual([2]);
    expect((await listInternships(userId, { q: "backend" })).length).toBe(3); // tag search

    const [t] = await db()
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.userId, userId), eq(schema.task.source, "intern")));
    expect(t?.title).toBe("Rank your internship choices · S");
    await db()
      .update(schema.task)
      .set({ completedAt: new Date() })
      .where(eq(schema.task.id, t?.id as string));

    // Next sync: opening 3 closed, deadline moved.
    const moved = { ...deadline, dueAt: new Date("2026-12-12T16:59:59Z") };
    await saveInternData(userId, session, [opening(1, 15000, true), opening(2, 20000)], [moved]);
    expect((await listInternships(userId)).map((o) => o.openingId)).toEqual([2, 1]);
    const [t2] = await db()
      .select()
      .from(schema.task)
      .where(eq(schema.task.id, t?.id as string));
    expect(t2?.dueAt?.toISOString()).toBe("2026-12-12T16:59:59.000Z");
    expect(t2?.completedAt).not.toBeNull();

    await disconnectIntern(userId);
    expect(await listInternships(userId)).toEqual([]);
    expect(
      await db()
        .select()
        .from(schema.task)
        .where(and(eq(schema.task.userId, userId), eq(schema.task.source, "intern"))),
    ).toEqual([]);
    expect(await getCredential(userId, "intern")).toBeNull();
  });
});
