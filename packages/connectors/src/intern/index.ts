/**
 * CEDT Intern Portal JSON API, called with the student's own session cookie.
 * Override the host with INTERN_BASE_URL (local mock). Links always point to the real site.
 */
export const INTERN_HOME = "https://cedtintern.cp.eng.chula.ac.th/";

export function internBaseUrl() {
  return (process.env.INTERN_BASE_URL ?? "https://cedtintern.cp.eng.chula.ac.th").replace(
    /\/$/,
    "",
  );
}

export const internOpeningUrl = (openingId: number, sessionId: number) =>
  `https://cedtintern.cp.eng.chula.ac.th/opening/${openingId}/session/${sessionId}`;

export class InternError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InternError";
  }
}

/** Keep only name=value pairs from a pasted Cookie header (drops "Cookie:" and attributes). */
export function cleanCookieHeader(raw: string): string {
  const text = raw.trim().replace(/^cookie:\s*/i, "");
  const pairs = text
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter((p) => /^[^=\s;,]+=[^;\r\n]*$/.test(p))
    .filter((p) => !/^(path|domain|expires|max-age|samesite|secure|httponly)=/i.test(p));
  return pairs.join("; ");
}

async function internGet<T>(path: string, cookie: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${internBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookie,
      "User-Agent": "CEDT-Hub (+https://hub.witsanupong-kolakul.com)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new InternError(
      res.status === 401 || res.status === 403
        ? "Intern Portal session expired"
        : `Intern Portal ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

type Scalar = string | number | null | undefined;

export interface InternSessionRaw {
  sessionId?: Scalar;
  title?: Scalar;
  sessionGroupTitle?: Scalar;
  currentRound?: Scalar;
  studentRankingDeadline?: Scalar;
  reorderRankingDeadline?: Scalar;
  cancelRankingDeadline?: Scalar;
  applicationAnnouncementDate?: Scalar;
  resultAnnouncementDate?: Scalar;
  rounds?: {
    round?: Scalar;
    studentRankingDeadline?: Scalar;
    reorderRankingDeadline?: Scalar;
    cancelRankingDeadline?: Scalar;
    applicationAnnouncementDate?: Scalar;
    resultAnnouncementDate?: Scalar;
  }[];
}

/** A date students must act on or know about. */
export interface InternDeadline {
  sourceId: string;
  title: string;
  dueAt: Date;
  kind: "deadline" | "announcement";
}

export interface NormalizedInternSession {
  sessionId: number;
  title: string;
  deadlines: InternDeadline[];
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
const date = (v: Scalar) => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DATE_FIELDS: [keyof InternSessionRaw & string, string, InternDeadline["kind"]][] = [
  ["studentRankingDeadline", "Rank your internship choices", "deadline"],
  ["reorderRankingDeadline", "Last day to reorder your ranking", "deadline"],
  ["cancelRankingDeadline", "Last day to cancel a ranking", "deadline"],
  ["applicationAnnouncementDate", "Application results announced", "announcement"],
  ["resultAnnouncementDate", "Final internship results announced", "announcement"],
];

export function normalizeInternSessions(list: InternSessionRaw[]): NormalizedInternSession[] {
  const out: NormalizedInternSession[] = [];
  for (const s of Array.isArray(list) ? list : []) {
    const id = int(s.sessionId);
    if (id === null) continue;
    const title = str(s.title) ?? str(s.sessionGroupTitle) ?? `Session ${id}`;
    const deadlines: InternDeadline[] = [];
    const add = (src: Record<string, Scalar>, round: number | null) => {
      for (const [field, label, kind] of DATE_FIELDS) {
        const due = date(src[field] as Scalar);
        if (!due) continue;
        const sourceId = `${id}:${round ?? "s"}:${field}`;
        if (deadlines.some((d) => d.dueAt.getTime() === due.getTime() && d.title.startsWith(label)))
          continue;
        deadlines.push({
          sourceId,
          title: `${label}${round ? ` (round ${round})` : ""} · ${title}`,
          dueAt: due,
          kind,
        });
      }
    };
    add(s as Record<string, Scalar>, null);
    for (const r of s.rounds ?? []) add(r as Record<string, Scalar>, int(r.round));
    out.push({ sessionId: id, title, deadlines });
  }
  return out;
}

export interface InternOpeningRaw {
  openingId?: Scalar;
  sessionId?: Scalar;
  title?: Scalar;
  company?: { companyNameTh?: Scalar; companyNameEn?: Scalar; logoUrl?: Scalar } | null;
  compensationAmount?: Scalar;
  compensationType?: { compensationType?: Scalar } | null;
  workingCondition?: Scalar;
  tags?: { tagName?: Scalar }[] | null;
  quota?: Scalar;
  startDate?: Scalar;
  endDate?: Scalar;
  isBookmarked?: boolean | null;
  isAcceptingApplication?: boolean | null;
}

interface OpeningsPage {
  items?: InternOpeningRaw[];
  meta?: { totalPage?: number; totalItem?: number };
}

export interface NormalizedInternship {
  openingId: number;
  sessionId: number;
  title: string;
  company: string;
  logoUrl: string | null;
  tags: string[];
  workingCondition: string | null;
  compensation: number | null;
  compensationType: string | null;
  quota: number | null;
  startDate: string | null;
  endDate: string | null;
  bookmarked: boolean;
  acceptingApplications: boolean;
  url: string;
}

export function normalizeOpenings(
  items: InternOpeningRaw[],
  sessionId: number,
): NormalizedInternship[] {
  const seen = new Set<number>();
  const out: NormalizedInternship[] = [];
  for (const o of items) {
    const id = int(o.openingId);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const sid = int(o.sessionId) ?? sessionId;
    const comp = str(o.compensationAmount);
    out.push({
      openingId: id,
      sessionId: sid,
      title: str(o.title) ?? `Opening ${id}`,
      company: str(o.company?.companyNameEn) ?? str(o.company?.companyNameTh) ?? "Unknown company",
      logoUrl: str(o.company?.logoUrl),
      tags: (o.tags ?? []).map((t) => str(t.tagName)).filter((t): t is string => t !== null),
      workingCondition: str(o.workingCondition),
      compensation:
        comp !== null && Number.isFinite(Number(comp)) ? Math.round(Number(comp)) : null,
      compensationType: str(o.compensationType?.compensationType),
      quota: int(o.quota),
      startDate: str(o.startDate)?.slice(0, 10) ?? null,
      endDate: str(o.endDate)?.slice(0, 10) ?? null,
      bookmarked: o.isBookmarked === true,
      acceptingApplications: o.isAcceptingApplication !== false,
      url: internOpeningUrl(id, sid),
    });
  }
  return out;
}

export async function fetchInternSessions(cookie: string, fetchImpl: typeof fetch = fetch) {
  return normalizeInternSessions(
    await internGet<InternSessionRaw[]>("/api/common/sessions", cookie, fetchImpl),
  );
}

/** All openings of a session (pages of up to 500, at most 20 pages). */
export async function fetchInternOpenings(
  cookie: string,
  sessionId: number,
  fetchImpl: typeof fetch = fetch,
) {
  const items: InternOpeningRaw[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({
      search: "",
      page: String(page),
      limit: "500",
      onlyBookmarked: "false",
      onlyAvailablePositions: "false",
    });
    const body = await internGet<OpeningsPage>(
      `/api/sessions/${sessionId}/openings?${q}`,
      cookie,
      fetchImpl,
    );
    items.push(...(body.items ?? []));
    if (!body.meta?.totalPage || page >= body.meta.totalPage) break;
  }
  return normalizeOpenings(items, sessionId);
}

/** The session whose openings matter now: the newest one. */
export function currentSession(sessions: NormalizedInternSession[]) {
  return sessions.reduce<NormalizedInternSession | null>(
    (best, s) => (!best || s.sessionId > best.sessionId ? s : best),
    null,
  );
}
