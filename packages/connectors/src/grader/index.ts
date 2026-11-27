/**
 * CEDT Grader (cafe-grader-web) JSON API, /api/v1 with JWT bearer auth.
 * Override the host with GRADER_BASE_URL (local mock). Links always point to the real site.
 */
export const GRADER_HOME = "https://cedt-grader.nattee.net/main/list";

export function graderBaseUrl() {
  return (process.env.GRADER_BASE_URL ?? "https://cedt-grader.nattee.net").replace(/\/$/, "");
}

export const graderProblemUrl = (problemId: number) =>
  `https://cedt-grader.nattee.net/submissions/direct_edit_problem/${problemId}`;

/** cafe-grader scores are points out of the problem's full score, 100 by default. */
export const GRADER_FULL_SCORE = 100;

export class GraderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GraderError";
  }
}

const headers = (token?: string) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "CEDT-Hub (+https://hub.witsanupong-kolakul.com)",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function errorMessage(res: Response) {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Grader ${res.status}`;
  } catch {
    return `Grader ${res.status}`;
  }
}

export interface GraderLogin {
  token: string;
  expiresAt: Date | null;
  user: { id: number; login: string; fullName: string | null };
}

/**
 * Exchange a login + password for a JWT (cafe-grader issues 12-hour tokens).
 * Called once per connect; never retried, because the server throttles failed logins.
 */
export async function graderLogin(
  login: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GraderLogin> {
  const res = await fetchImpl(`${graderBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ login, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GraderError(await errorMessage(res), res.status);
  const body = (await res.json()) as {
    token?: string;
    expires_at?: string;
    user?: { id?: number; login?: string; full_name?: string | null };
  };
  if (!body.token) throw new GraderError("Grader did not return a token", 502);
  const expires = body.expires_at ? new Date(body.expires_at) : null;
  return {
    token: body.token,
    expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
    user: {
      id: Number(body.user?.id ?? 0),
      login: String(body.user?.login ?? login),
      fullName: body.user?.full_name ?? null,
    },
  };
}

export interface GraderProblemRaw {
  id?: number | string;
  name?: string | null;
  full_name?: string | null;
  tags?: string[] | null;
  submission_count?: number | null;
  best_score?: number | string | null;
  last_score?: number | string | null;
  last_submission_time?: string | null;
}

export interface NormalizedGraderProblem {
  problemId: number;
  name: string;
  fullName: string | null;
  bestScore: number | null;
  lastScore: number | null;
  submissionCount: number;
  lastSubmittedAt: Date | null;
  tags: string[];
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeGraderProblems(list: GraderProblemRaw[]): NormalizedGraderProblem[] {
  const out: NormalizedGraderProblem[] = [];
  const seen = new Set<number>();
  for (const p of Array.isArray(list) ? list : []) {
    const id = num(p.id);
    if (id === null || !Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    const last = p.last_submission_time ? new Date(p.last_submission_time) : null;
    out.push({
      problemId: id,
      name: (p.name ?? "").trim() || `Problem ${id}`,
      fullName: p.full_name?.trim() || null,
      bestScore: num(p.best_score),
      lastScore: num(p.last_score),
      submissionCount: Math.max(0, Math.trunc(num(p.submission_count) ?? 0)),
      lastSubmittedAt: last && !Number.isNaN(last.getTime()) ? last : null,
      tags: (p.tags ?? []).filter((t): t is string => typeof t === "string"),
    });
  }
  return out;
}

/** Every problem the user may submit to, with their best score: one request. */
export async function fetchGraderProblems(token: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${graderBaseUrl()}/api/v1/problems`, {
    headers: headers(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new GraderError(await errorMessage(res), res.status);
  return normalizeGraderProblems((await res.json()) as GraderProblemRaw[]);
}

export type GraderProblemState = "solved" | "partial" | "attempted" | "new";

export function problemState(
  p: Pick<NormalizedGraderProblem, "bestScore" | "submissionCount">,
): GraderProblemState {
  if (p.bestScore !== null && p.bestScore >= GRADER_FULL_SCORE) return "solved";
  if (p.bestScore !== null && p.bestScore > 0) return "partial";
  if (p.submissionCount > 0) return "attempted";
  return "new";
}
