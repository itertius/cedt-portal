/**
 * CEDT IDP: the OAuth 2.0 provider at cedtintern.cp.eng.chula.ac.th that Talent Journey, Nisitez
 * and other CEDT apps use for "log in with CEDT". Override the host with CEDT_IDP_BASE_URL (mock).
 */
export function cedtIdpUrls() {
  const base = (process.env.CEDT_IDP_BASE_URL ?? "https://cedtintern.cp.eng.chula.ac.th").replace(
    /\/$/,
    "",
  );
  return {
    authorize: `${base}/oauth/authorize`,
    token: `${base}/api/oauth/token`,
    profile: `${base}/api/oauth/v1/profile`,
  };
}

export const CEDT_IDP_SCOPES = ["profile"];

export interface CedtIdpProfile {
  userId?: string;
  userType?: string;
  studentId?: string | number | null;
  firstNameTh?: string | null;
  firstNameEn?: string | null;
  lastNameTh?: string | null;
  lastNameEn?: string | null;
  profileImageUrl?: string | null;
  email?: string | null;
}

/** Map a CEDT IDP profile to a Better Auth user. Chula student mail is <studentId>@student.chula.ac.th. */
export function mapCedtProfile(p: CedtIdpProfile) {
  const id = p.userId?.trim();
  if (!id) return null;
  const full = (a?: string | null, b?: string | null) =>
    [a?.trim(), b?.trim()].filter(Boolean).join(" ");
  const studentId =
    p.studentId === null || p.studentId === undefined ? "" : String(p.studentId).trim();
  const email =
    p.email?.trim().toLowerCase() ||
    (/^\d{10}$/.test(studentId)
      ? `${studentId}@student.chula.ac.th`
      : `cedt-${id}@cedt-idp.invalid`);
  return {
    id,
    name:
      full(p.firstNameEn, p.lastNameEn) ||
      full(p.firstNameTh, p.lastNameTh) ||
      `CEDT student ${studentId || id}`,
    email,
    image: p.profileImageUrl ?? undefined,
    // We never confirm mailbox ownership, so the email is never used to link accounts.
    emailVerified: false,
  };
}

export async function fetchCedtProfile(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(cedtIdpUrls().profile, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return mapCedtProfile((await res.json()) as CedtIdpProfile);
}
