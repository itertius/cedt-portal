import "server-only";
import { schema } from "@cedt-hub/db";
import { and, eq } from "@cedt-hub/db/orm";
import { decryptSecret, encryptSecret } from "../crypto";
import { getDb } from "../db";

const { connectorCredential } = schema;
export type CredentialSource = "grader" | "intern" | "mcv";

export async function saveCredential(
  userId: string,
  source: CredentialSource,
  plain: string,
  meta: { label?: string | null; expiresAt?: Date | null; key?: string } = {},
) {
  const values = {
    userId,
    source,
    // `key` (e.g. CREDENTIAL_ENCRYPTION_KEY for passwords) overrides the default key.
    secret: encryptSecret(plain, meta.key),
    label: meta.label ?? null,
    expiresAt: meta.expiresAt ?? null,
  };
  await getDb()
    .insert(connectorCredential)
    .values(values)
    .onConflictDoUpdate({
      target: [connectorCredential.userId, connectorCredential.source],
      set: {
        secret: values.secret,
        label: values.label,
        expiresAt: values.expiresAt,
        updatedAt: new Date(),
      },
    });
}

export interface Credential {
  secret: string;
  label: string | null;
  expiresAt: Date | null;
  expired: boolean;
}

/** Decrypted credential, or null when missing or unreadable (e.g. after a secret rotation). */
export async function getCredential(
  userId: string,
  source: CredentialSource,
  now = new Date(),
  key?: string,
): Promise<Credential | null> {
  const [row] = await getDb()
    .select()
    .from(connectorCredential)
    .where(and(eq(connectorCredential.userId, userId), eq(connectorCredential.source, source)));
  if (!row) return null;
  const secret = decryptSecret(row.secret, key);
  if (secret === null) return null;
  return {
    secret,
    label: row.label,
    expiresAt: row.expiresAt,
    expired: row.expiresAt !== null && row.expiresAt <= now,
  };
}

/** What Settings shows: never the secret. */
export async function credentialInfo(userId: string, source: CredentialSource) {
  const [row] = await getDb()
    .select({
      label: connectorCredential.label,
      expiresAt: connectorCredential.expiresAt,
      updatedAt: connectorCredential.updatedAt,
    })
    .from(connectorCredential)
    .where(and(eq(connectorCredential.userId, userId), eq(connectorCredential.source, source)));
  return row ?? null;
}

export async function deleteCredential(userId: string, source: CredentialSource) {
  await getDb()
    .delete(connectorCredential)
    .where(and(eq(connectorCredential.userId, userId), eq(connectorCredential.source, source)));
}

export async function credentialUserIds(source: CredentialSource) {
  const rows = await getDb()
    .select({ userId: connectorCredential.userId })
    .from(connectorCredential)
    .where(eq(connectorCredential.source, source));
  return rows.map((r) => r.userId);
}
