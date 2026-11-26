import { mcvUrls } from "@cedt-hub/connectors/mcv";
import type { GenericOAuthUserInfo } from "better-auth/plugins/generic-oauth";

export const MCV_PROVIDER_ID = "mcv";

/** Resolved per call so MCV_BASE_URL (the local mock) can be set at runtime. */
export const MCV_URLS = {
  get authorize() {
    return mcvUrls().authorize;
  },
  get token() {
    return mcvUrls().token;
  },
  get me() {
    return mcvUrls().me;
  },
};

/** Domain for placeholder emails. MCV returns no email; `.invalid` can never receive mail. */
export const MCV_PLACEHOLDER_EMAIL_DOMAIN = "mcv.invalid";

type MaybeString = string | number | null | undefined;

interface McvPerson {
  id?: MaybeString;
  uid?: MaybeString;
  title_en?: MaybeString;
  firstname_en?: MaybeString;
  lastname_en?: MaybeString;
  firstname_th?: MaybeString;
  lastname_th?: MaybeString;
  email?: MaybeString;
}

/**
 * MCV has returned two shapes over time:
 * - `/api/v1/public/users/me`  -> `{ user: {...} }`
 * - `/api/v1/public/get/user/info` -> `{ data: { student: {...}, account: {...} } }`
 */
export interface McvProfileResponse {
  user?: McvPerson;
  data?: { student?: McvPerson; account?: McvPerson };
}

const str = (v: MaybeString): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
};

export function mapMcvProfile(body: McvProfileResponse): GenericOAuthUserInfo | null {
  const person = body.user ?? body.data?.student ?? body.data?.account;
  if (!person) return null;

  const id = str(person.id) ?? str(person.uid);
  if (!id) return null;

  const name =
    [str(person.firstname_en), str(person.lastname_en)].filter(Boolean).join(" ") ||
    [str(person.firstname_th), str(person.lastname_th)].filter(Boolean).join(" ") ||
    `MCV user ${id}`;

  const realEmail = str(person.email)?.toLowerCase();

  return {
    id,
    name,
    email: realEmail ?? `mcv-${id}@${MCV_PLACEHOLDER_EMAIL_DOMAIN}`,
    // MCV never proves email ownership, so never trust it for account linking.
    emailVerified: false,
  };
}

export async function fetchMcvProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GenericOAuthUserInfo | null> {
  const res = await fetchImpl(MCV_URLS.me, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return mapMcvProfile((await res.json()) as McvProfileResponse);
}
