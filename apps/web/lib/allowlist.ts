/**
 * Who may create an account with "Log in with Google" (personal / invite-only mode).
 * ALLOWED_EMAILS is comma- or space-separated: exact emails, or "@domain" for a whole domain.
 * Matching is case-insensitive. Empty means nobody can sign up with Google.
 */
export function parseAllowlist(raw = process.env.ALLOWED_EMAILS ?? "") {
  return raw
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));
}

export function isEmailAllowed(email: string | null | undefined, list = parseAllowlist()) {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return false;
  const domain = e.slice(at);
  return list.some((entry) => (entry.startsWith("@") ? entry === domain : entry === e));
}
