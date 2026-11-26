/**
 * Google OAuth + Calendar API endpoints. Set GOOGLE_BASE_URL to send every call to one host
 * (the local mock, scripts/mock-google.mjs); otherwise the real Google hosts are used.
 */
export function googleUrls() {
  const mock = process.env.GOOGLE_BASE_URL?.replace(/\/$/, "");
  const oauth = mock ?? "https://accounts.google.com";
  const token = mock ? `${mock}/token` : "https://oauth2.googleapis.com/token";
  const userinfo = mock
    ? `${mock}/v1/userinfo`
    : "https://openidconnect.googleapis.com/v1/userinfo";
  const api = mock ?? "https://www.googleapis.com";
  const events = `${api}/calendar/v3/calendars/primary/events`;
  return {
    authorize: `${oauth}/o/oauth2/v2/auth`,
    token,
    userinfo,
    events,
    event: (id: string) => `${events}/${encodeURIComponent(id)}`,
  };
}

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export async function googleFetch<T>(
  url: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T | null> {
  const res = await fetchImpl(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new GoogleApiError(
      `Google ${res.status} for ${init.method ?? "GET"} ${new URL(url).pathname}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}
