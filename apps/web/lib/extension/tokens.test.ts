import { schema } from "@cedt-hub/db";
import { eq } from "@cedt-hub/db/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../db";
import {
  createExtensionToken,
  EXTENSION_TOKEN_PREFIX,
  hashToken,
  listExtensionTokens,
  revokeExtensionToken,
  verifyExtensionToken,
} from "./tokens";

describe("extension token hashing", () => {
  it("is a stable SHA-256 hex digest", () => {
    expect(hashToken("cedtx_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("cedtx_abc")).toBe(hashToken("cedtx_abc"));
    expect(hashToken("cedtx_abc")).not.toBe(hashToken("cedtx_abd"));
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("extension tokens (database)", () => {
  const me = `ext-${Date.now()}`;
  const other = `${me}-o`;
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

  it("stores only a hash, verifies the bearer token, and tracks last use", async () => {
    const token = await createExtensionToken(me, "Chrome on macOS");
    expect(token.startsWith(EXTENSION_TOKEN_PREFIX)).toBe(true);
    const rows = await getDb()
      .select()
      .from(schema.extensionToken)
      .where(eq(schema.extensionToken.userId, me));
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);

    expect(await verifyExtensionToken(`Bearer ${token}`)).toMatchObject({ userId: me });
    expect((await listExtensionTokens(me))[0]?.lastUsedAt).not.toBeNull();
  });

  it("rejects malformed, unknown and revoked tokens; only the owner can revoke", async () => {
    expect(await verifyExtensionToken(null)).toBeNull();
    expect(await verifyExtensionToken("Bearer nope")).toBeNull();
    expect(await verifyExtensionToken(`Bearer ${EXTENSION_TOKEN_PREFIX}unknown`)).toBeNull();
    const token = await createExtensionToken(me, null);
    const [row] = await listExtensionTokens(me);
    expect(await revokeExtensionToken(other, row?.id as string)).toBe(false);
    expect(await verifyExtensionToken(`Bearer ${token}`)).not.toBeNull();
    expect(await revokeExtensionToken(me, row?.id as string)).toBe(true);
    expect(await verifyExtensionToken(`Bearer ${token}`)).toBeNull();
  });
});
