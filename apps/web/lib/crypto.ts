import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for connector credentials (Grader JWT, Intern Portal cookie).
 * The key is derived from BETTER_AUTH_SECRET with HKDF, so no extra secret is needed. Rotating
 * BETTER_AUTH_SECRET makes stored credentials unreadable; users then simply reconnect.
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 */
const INFO = "cedt-hub/connector-credentials/v1";

function key(secret = process.env.BETTER_AUTH_SECRET): Buffer {
  if (!secret || secret.length < 16) throw new Error("BETTER_AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "cedt-hub", INFO, 32));
}

export function encryptSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Returns null if the value was tampered with or encrypted with another key. */
export function decryptSecret(sealed: string, secret?: string): string | null {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
