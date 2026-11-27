/**
 * Talent Journey (talent.cedt.community). The home page's bootstrap endpoint is public: it lists
 * upcoming activities without any login. Override the host with TALENT_BASE_URL (local mock).
 */
export function talentBaseUrl() {
  return (process.env.TALENT_BASE_URL ?? "https://talent.cedt.community").replace(/\/$/, "");
}

/** Activities always link to the real site. */
export const TALENT_HOME = "https://talent.cedt.community/";

type Scalar = string | number | null | undefined;

export interface TalentActivityRaw {
  activityId?: Scalar;
  name?: Scalar;
  date?: Scalar;
  startTime?: Scalar;
  endTime?: Scalar;
  organization?: Scalar | { name?: Scalar; organizationName?: Scalar };
  activityStatus?: Scalar;
  currentParticipants?: Scalar;
  maxParticipants?: Scalar;
  posterUrl?: Scalar | Scalar[];
}

export interface TalentBootstrap {
  success?: boolean;
  data?: { activities?: TalentActivityRaw[] };
}

export interface NormalizedTalentActivity {
  activityId: number;
  name: string;
  organization: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string | null;
  participants: number | null;
  maxParticipants: number | null;
  posterUrl: string | null;
}

const str = (v: Scalar) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};
const int = (v: Scalar) => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/** "2026-11-20" + "13:00:00" in Bangkok (UTC+7, no DST) -> instant. */
export function bangkokInstant(date: string, time: string): Date | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeTalentActivities(body: TalentBootstrap): NormalizedTalentActivity[] {
  const out: NormalizedTalentActivity[] = [];
  const seen = new Set<number>();
  for (const a of body.data?.activities ?? []) {
    const id = int(a.activityId);
    const date = str(a.date);
    if (id === null || !date || seen.has(id)) continue;
    const startsAt = bangkokInstant(date, str(a.startTime) ?? "00:00:00");
    if (!startsAt) continue;
    let endsAt = bangkokInstant(date, str(a.endTime) ?? "");
    if (!endsAt || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const org =
      typeof a.organization === "object" && a.organization !== null
        ? (str(a.organization.name) ?? str(a.organization.organizationName))
        : str(a.organization as Scalar);
    const poster = Array.isArray(a.posterUrl) ? str(a.posterUrl[0]) : str(a.posterUrl);
    seen.add(id);
    out.push({
      activityId: id,
      name: str(a.name) ?? `Activity ${id}`,
      organization: org,
      startsAt,
      endsAt,
      status: str(a.activityStatus),
      participants: int(a.currentParticipants),
      maxParticipants: int(a.maxParticipants),
      // Relative poster paths are on the real site.
      posterUrl: poster ? new URL(poster, TALENT_HOME).toString() : null,
    });
  }
  return out;
}

export async function fetchTalentActivities(fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${talentBaseUrl()}/api/v2/home/bootstrap`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CEDT-Hub (+https://hub.witsanupong-kolakul.com)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Talent Journey ${res.status}`);
  return normalizeTalentActivities((await res.json()) as TalentBootstrap);
}
