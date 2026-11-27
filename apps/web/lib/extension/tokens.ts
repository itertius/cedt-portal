import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { schema } from "@cedt-hub/db";
import { and, desc, eq } from "@cedt-hub/db/orm";
import { getDb } from "../db";

const { extensionToken } = schema;

/** Prefix makes leaked tokens easy to recognise (and to scan for). */
export const EXTENSION_TOKEN_PREFIX = "cedtx_";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Create a token for this user's browser. The plain token is returned once and never stored. */
export async function createExtensionToken(userId: string, label: string | null) {
  const token = `${EXTENSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  await getDb()
    .insert(extensionToken)
    .values({ userId, tokenHash: hashToken(token), label: label?.slice(0, 100) || null });
  return token;
}

/** Resolve a bearer token to its user (and mark it used). Null if unknown or revoked. */
export async function verifyExtensionToken(authorization: string | null) {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token?.startsWith(EXTENSION_TOKEN_PREFIX) || token.length > 200) return null;
  const [row] = await getDb()
    .update(extensionToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(extensionToken.tokenHash, hashToken(token)))
    .returning({ id: extensionToken.id, userId: extensionToken.userId });
  return row ?? null;
}

export async function listExtensionTokens(userId: string) {
  return getDb()
    .select({
      id: extensionToken.id,
      label: extensionToken.label,
      createdAt: extensionToken.createdAt,
      lastUsedAt: extensionToken.lastUsedAt,
    })
    .from(extensionToken)
    .where(eq(extensionToken.userId, userId))
    .orderBy(desc(extensionToken.createdAt));
}

export async function revokeExtensionToken(userId: string, id: string) {
  const rows = await getDb()
    .delete(extensionToken)
    .where(and(eq(extensionToken.id, id), eq(extensionToken.userId, userId)))
    .returning({ id: extensionToken.id });
  return rows.length > 0;
}
