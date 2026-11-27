import { GoogleApiError, googleFetch, googleUrls } from "./api";

/** The subset of a Google Calendar event the hub uses. */
export interface GoogleEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

interface EventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

/** Private property that marks a Google event as a copy of a hub event. */
export const HUB_ID_PROPERTY = "cedtHubId";

export async function listGoogleEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(googleUrls().events);
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleFetch<EventsPage>(url.toString(), accessToken, {}, fetchImpl);
    out.push(...(body?.items ?? []));
    pageToken = body?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export interface HubEventForGoogle {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const localDate = (d: Date) => new Date(d.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);

/** Hub event -> Google request body. All-day events use local (Bangkok) dates, end exclusive. */
export function toGoogleBody(e: HubEventForGoogle) {
  return {
    summary: e.title,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: e.allDay
      ? { date: localDate(e.startsAt) }
      : { dateTime: e.startsAt.toISOString(), timeZone: "Asia/Bangkok" },
    end: e.allDay
      ? { date: localDate(e.endsAt) }
      : { dateTime: e.endsAt.toISOString(), timeZone: "Asia/Bangkok" },
    extendedProperties: { private: { [HUB_ID_PROPERTY]: e.id } },
  };
}

export async function insertGoogleEvent(
  token: string,
  e: HubEventForGoogle,
  fetchImpl?: typeof fetch,
) {
  return (await googleFetch<GoogleEvent>(
    googleUrls().events,
    token,
    { method: "POST", body: toGoogleBody(e) },
    fetchImpl,
  )) as GoogleEvent;
}

export async function patchGoogleEvent(
  token: string,
  remoteId: string,
  e: HubEventForGoogle,
  fetchImpl?: typeof fetch,
) {
  return (await googleFetch<GoogleEvent>(
    googleUrls().event(remoteId),
    token,
    { method: "PATCH", body: toGoogleBody(e) },
    fetchImpl,
  )) as GoogleEvent;
}

/** Deletes a Google event. Already-deleted (404/410) counts as success. */
export async function deleteGoogleEvent(token: string, remoteId: string, fetchImpl?: typeof fetch) {
  try {
    await googleFetch(googleUrls().event(remoteId), token, { method: "DELETE" }, fetchImpl);
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

export interface NormalizedGoogleEvent {
  remoteId: string;
  cancelled: boolean;
  /** Set when this Google event is a copy of a hub event. */
  hubId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  url: string | null;
  updated: string | null;
}

/** Local (Bangkok) "YYYY-MM-DD" to the instant of local midnight. */
const dateToInstant = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - BKK_OFFSET_MS);

export function normalizeGoogleEvent(g: GoogleEvent): NormalizedGoogleEvent | null {
  if (!g.id) return null;
  const hubId = g.extendedProperties?.private?.[HUB_ID_PROPERTY] ?? null;
  const cancelled = g.status === "cancelled";
  const allDay = Boolean(g.start?.date);
  const startsAt = g.start?.dateTime
    ? new Date(g.start.dateTime)
    : g.start?.date
      ? dateToInstant(g.start.date)
      : null;
  let endsAt = g.end?.dateTime
    ? new Date(g.end.dateTime)
    : g.end?.date
      ? dateToInstant(g.end.date)
      : null;
  if (!cancelled && (!startsAt || Number.isNaN(startsAt.getTime()))) return null;
  if (startsAt && (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
    endsAt = new Date(startsAt.getTime() + (allDay ? 86_400_000 : 3_600_000));
  }
  return {
    remoteId: g.id,
    cancelled,
    hubId,
    title: g.summary?.trim() || "(No title)",
    description: g.description ?? null,
    location: g.location ?? null,
    startsAt: startsAt ?? new Date(0),
    endsAt: endsAt ?? new Date(0),
    allDay,
    url: g.htmlLink ?? null,
    updated: g.updated ?? null,
  };
}
