import "server-only";
import { isEmailAllowed, parseAllowlist } from "../allowlist";

/**
 * CUNET-password MCV sync is off unless the hub account's email is listed in
 * MCV_PASSWORD_SYNC_EMAILS (exact emails or "@domain") AND a separate CREDENTIAL_ENCRYPTION_KEY
 * is set. The password is encrypted with that key, never with BETTER_AUTH_SECRET.
 */
export function credentialKey() {
  const k = process.env.CREDENTIAL_ENCRYPTION_KEY ?? "";
  return k.length >= 32 ? k : null;
}

export function mcvPasswordSyncAllowed(email: string | null | undefined) {
  if (!credentialKey()) return false;
  return isEmailAllowed(email, parseAllowlist(process.env.MCV_PASSWORD_SYNC_EMAILS ?? ""));
}
