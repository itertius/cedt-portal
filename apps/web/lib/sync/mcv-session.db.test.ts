import { schema } from "@cedt-hub/db";
import { and, eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCredential, saveCredential } from "../connectors/credentials";
import { getDb } from "../db";
import { mcvPasswordSyncAllowed } from "../mcv/password-sync";
import { saveSessionSnapshot } from "./mcv-session";

describe("CUNET password sync gate", () => {
  it("needs both a listed email and a separate 32+ char key", () => {
    const prev = {
      emails: process.env.MCV_PASSWORD_SYNC_EMAILS,
      key: process.env.CREDENTIAL_ENCRYPTION_KEY,
    };
    process.env.MCV_PASSWORD_SYNC_EMAILS = "owner@example.com, @student.chula.ac.th";
    process.env.CREDENTIAL_ENCRYPTION_KEY = "k".repeat(40);
    expect(mcvPasswordSyncAllowed("Owner@Example.com")).toBe(true);
    expect(mcvPasswordSyncAllowed("6933243721@student.chula.ac.th")).toBe(true);
    expect(mcvPasswordSyncAllowed("someone@gmail.com")).toBe(false);
    process.env.CREDENTIAL_ENCRYPTION_KEY = "too-short";
    expect(mcvPasswordSyncAllowed("owner@example.com")).toBe(false);
    process.env.MCV_PASSWORD_SYNC_EMAILS = prev.emails;
    process.env.CREDENTIAL_ENCRYPTION_KEY = prev.key;
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("CUNET session sync (database)", () => {
  const userId = `mcvs-${Date.now()}`;
  const db = () => getDb();
  const now = new Date("2026-11-27T05:00:00Z");
  const at = (h: number) => new Date(now.getTime() + h * 3600_000);
  const course = {
    source: "mcv" as const,
    sourceId: "85196",
    code: "2110101",
    title: "CEDT Essentials",
    year: 2026,
    semester: 2,
    role: "student",
    url: null,
  };
  const item = (id: string, dueAt: Date | null) => ({
    source: "mcv" as const,
    sourceId: id,
    courseSourceId: "85196",
    title: `Item ${id}`,
    dueAt,
    url: null,
  });
  const rows = () =>
    db()
      .select({ id: schema.task.sourceId, done: schema.task.completedAt })
      .from(schema.task)
      .where(and(eq(schema.task.userId, userId), eq(schema.task.source, "mcv")))
      .orderBy(schema.task.sourceId);

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "db-test-secret-db-test-secret-xx";
    await db()
      .insert(schema.user)
      .values({ id: userId, name: "S", email: `${userId}@x.test` });
  });
  afterAll(async () => {
    await db().delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("marks an upcoming item done when it leaves the pending list (handed in); never deletes", async () => {
    await saveSessionSnapshot(
      userId,
      { courses: [course], tasks: [item("A", at(48)), item("B", at(24)), item("C", at(-2))] },
      now,
    );
    expect((await rows()).map((r) => [r.id, r.done])).toEqual([
      ["A", null],
      ["B", null],
      ["C", null],
    ]);
    // Next sync: B handed in; C is past due and simply no longer listed.
    await saveSessionSnapshot(userId, { courses: [course], tasks: [item("A", at(47))] }, now);
    const after = await rows();
    expect(after.map((r) => r.id)).toEqual(["A", "B", "C"]);
    expect(after.find((r) => r.id === "A")?.done).toBeNull();
    expect(after.find((r) => r.id === "B")?.done).not.toBeNull();
    expect(after.find((r) => r.id === "C")?.done).toBeNull();
  });

  it("the stored login is encrypted with the separate key, unreadable with the auth secret", async () => {
    const key = "separate-credential-key-separate-credential-key";
    await saveCredential(userId, "mcv", JSON.stringify({ u: "6933243721", p: "pw-secret" }), {
      label: "6933243721",
      key,
    });
    const [raw] = await db()
      .select({ secret: schema.connectorCredential.secret })
      .from(schema.connectorCredential)
      .where(eq(schema.connectorCredential.userId, userId));
    expect(raw?.secret).not.toContain("pw-secret");
    expect(await getCredential(userId, "mcv")).toBeNull(); // default key (BETTER_AUTH_SECRET) can't read it
    expect(
      JSON.parse((await getCredential(userId, "mcv", new Date(), key))?.secret ?? "{}").p,
    ).toBe("pw-secret");
  });
});
