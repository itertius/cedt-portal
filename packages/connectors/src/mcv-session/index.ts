/**
 * MyCourseVille via the student's own CUNET login (no OAuth client needed).
 *
 * Login is plain HTTP, the same way a browser does it (pattern from
 * github.com/ILFforever/Chula_Attendance):
 *   1. GET the MCV home page (session cookie)
 *   2. GET MCV's own OAuth authorize URL with login_page=itchula -> CU-SSO login form
 *   3. POST the form with the CUNET username/password -> redirects back with MCV session cookies
 * Data: POST ?q=courseville/ajax/getactivepanelcontent returns every pending item of every course.
 * Course names come from each course's public page (og:title), which needs no login.
 *
 * Override the host with MCV_WEB_BASE_URL (local mock). Links always point to the real site.
 */
import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import type { NormalizedCourse, NormalizedTask } from "../types";

export const MCV_SITE = "https://www.mycourseville.com";

export function mcvWebBase() {
  return (process.env.MCV_WEB_BASE_URL ?? MCV_SITE).replace(/\/$/, "");
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class McvWrongPasswordError extends Error {
  constructor() {
    super("MyCourseVille rejected the CUNET username or password.");
    this.name = "McvWrongPasswordError";
  }
}
export class McvLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McvLoginError";
  }
}
export class McvSessionExpiredError extends Error {
  constructor() {
    super("MyCourseVille session expired.");
    this.name = "McvSessionExpiredError";
  }
}

const WRONG_PASSWORD_MARKERS = [
  "incorrect",
  "invalid",
  "ไม่ถูกต้อง",
  "ผิดพลาด",
  "ไม่สามารถเข้าสู่ระบบได้เนื่องจาก",
  "username or password",
];
const isAscii = (s: string) => [...s].every((c) => c.charCodeAt(0) < 128);

/** Present on MCV pages only when logged in. */
const LOGGED_IN_MARKER = "courseville-usermenutrigger";

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ldquo;|&rdquo;/g, "")
    .replace(/&nbsp;/g, " ");

/** Find the login form and every field it would submit. */
export function parseLoginForm(html: string, pageUrl: string) {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  const pick =
    forms.find((f) => /id=["']cv-login-cvecologin-form["']/i.test(f[1] ?? "")) ??
    forms.find((f) => /type=["']password["']/i.test(f[2] ?? ""));
  if (!pick) return null;
  const attrs = pick[1] ?? "";
  const body = pick[2] ?? "";
  const action = decode(/action=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "");
  const fields: Record<string, string> = {};
  let usernameField = "username";
  let passwordField = "password";
  for (const m of body.matchAll(/<input\b([^>]*)>/gi)) {
    const a = m[1] ?? "";
    const name = /name=["']([^"']+)["']/i.exec(a)?.[1];
    if (!name) continue;
    const type = (/type=["']([^"']+)["']/i.exec(a)?.[1] ?? "text").toLowerCase();
    const value = decode(/value=["']([^"']*)["']/i.exec(a)?.[1] ?? "");
    if (["submit", "button", "image"].includes(type)) continue;
    if (type === "radio" || type === "checkbox") {
      if (/\bchecked\b/i.test(a)) fields[name] = value || "on";
      continue;
    }
    if (type === "password") passwordField = name;
    else if (/id=["']username["']/i.test(a) || (type === "text" && /user|login|name/i.test(name)))
      usernameField = name;
    fields[name] = value;
  }
  return {
    action: new URL(action || pageUrl, pageUrl).toString(),
    fields,
    usernameField,
    passwordField,
  };
}

/** A fetch with its own cookie jar (follows redirects across hosts, keeping cookies). */
export function sessionFetch(jar = new CookieJar(), fetchImpl: typeof fetch = fetch) {
  return { jar, fetch: makeFetchCookie(fetchImpl, jar) as unknown as typeof fetch };
}

/** Serialize the jar so the session can be stored (encrypted) and reused. */
export async function exportSession(jar: CookieJar) {
  return JSON.stringify(await jar.serialize());
}
export async function importSession(serialized: string) {
  return CookieJar.deserialize(JSON.parse(serialized));
}

/** Log in with CUNET credentials. Returns the authenticated cookie jar. Never retries. */
export async function mcvLogin(
  username: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
) {
  const base = mcvWebBase();
  const { jar, fetch: f } = sessionFetch(new CookieJar(), fetchImpl);
  const opts = { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) };

  await f(`${base}/`, opts);
  const authorize = `${base}/api/oauth/authorize?response_type=code&client_id=mycourseville.com&redirect_uri=${encodeURIComponent(`${base}`)}&login_page=itchula`;
  const formPage = await f(authorize, opts);
  const form = parseLoginForm(await formPage.text(), formPage.url || authorize);
  if (!form)
    throw new McvLoginError(
      "Could not find the MyCourseVille login form (the page may have changed).",
    );

  const data = new URLSearchParams({
    ...form.fields,
    [form.usernameField]: username,
    [form.passwordField]: password,
  });
  const res = await f(form.action, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: formPage.url || authorize,
    },
    body: data.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!text.includes(LOGGED_IN_MARKER)) {
    const lower = text.toLowerCase();
    if (WRONG_PASSWORD_MARKERS.some((m) => (isAscii(m) ? lower.includes(m) : text.includes(m)))) {
      throw new McvWrongPasswordError();
    }
    // Some flows land elsewhere first: confirm on the home page.
    const home = await (await f(`${base}/`, opts)).text();
    if (!home.includes(LOGGED_IN_MARKER))
      throw new McvLoginError("MyCourseVille login did not complete.");
  }
  return jar;
}

export interface McvPanelItem {
  courseCode: string;
  cvCid: string;
  itemId: string;
  title: string;
  dueText: string;
  url: string;
}

const LINK_RE = /href="([^"]*\?q=courseville\/worksheet\/(\d+)\/(\d+)[^"]*)"/;
const BADGE_RE = /cvui-course-badge">([^<]+)</;
const TITLE_RE = /<strong>(?:&ldquo;|["“])?([^<]*?)(?:&rdquo;|["”])?<\/strong>/;
const DUE_RE = /du\w*\s+in\s*<strong>([^<]+)<\/strong>/i;

/** The panel is an HTML fragment of <div class="cv-item"> blocks; the first is a summary line. */
export function parsePanelHtml(html: string): McvPanelItem[] {
  const out: McvPanelItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<div class="cv-item">').slice(1)) {
    const link = LINK_RE.exec(block);
    if (!link) continue;
    const [, , cvCid = "", itemId = ""] = link;
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    out.push({
      courseCode: decode(BADGE_RE.exec(block)?.[1] ?? "").trim(),
      cvCid,
      itemId,
      title: decode(TITLE_RE.exec(block)?.[1] ?? "").trim() || "Untitled item",
      dueText: decode(DUE_RE.exec(block)?.[1] ?? "").trim(),
      url: `${MCV_SITE}/?q=courseville/worksheet/${cvCid}/${itemId}`,
    });
  }
  return out;
}

const BKK_MS = 7 * 3600_000;

/**
 * The panel only says how long is left ("3 days", "5 hours", "2 วัน"). Turn it into a date:
 * hours/minutes are exact enough; days count to the end of that day (23:59 Bangkok).
 */
export function parseRelativeDue(text: string, now = new Date()): Date | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const n = Number(/(\d+)/.exec(t)?.[1] ?? (/\b(an?|one)\b/.test(t) ? 1 : Number.NaN));
  const at = (ms: number) => new Date(now.getTime() + ms);
  if (/today|วันนี้/.test(t)) return endOfBkkDay(now, 0);
  if (/tomorrow|พรุ่งนี้/.test(t)) return endOfBkkDay(now, 1);
  if (Number.isNaN(n)) return null;
  if (/min|นาที/.test(t)) return at(n * 60_000);
  if (/hour|hr|ชั่วโมง|ชม/.test(t)) return at(n * 3600_000);
  if (/day|วัน/.test(t)) return endOfBkkDay(now, n);
  if (/week|สัปดาห์/.test(t)) return endOfBkkDay(now, n * 7);
  return null;
}

function endOfBkkDay(now: Date, addDays: number) {
  const local = new Date(now.getTime() + BKK_MS + addDays * 86400_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${local}T23:59:00Z`) - BKK_MS);
}

/** Fetch pending items with a logged-in jar. Throws McvSessionExpiredError when logged out. */
export async function fetchPanel(jar: CookieJar, fetchImpl: typeof fetch = fetch) {
  const { fetch: f } = sessionFetch(jar, fetchImpl);
  const res = await f(`${mcvWebBase()}/?q=courseville/ajax/getactivepanelcontent`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
    signal: AbortSignal.timeout(20_000),
  });
  let body: { status?: number; html?: string } | null = null;
  try {
    body = (await res.json()) as { status?: number; html?: string };
  } catch {
    throw new McvSessionExpiredError(); // an HTML login page instead of JSON
  }
  if (!res.ok || body?.status !== 1) throw new McvSessionExpiredError();
  return parsePanelHtml(body.html ?? "");
}

/** "2110506 (2026/1) Software-Defined Systems I [Section 51 - 55]" -> code, year, semester, name. */
export function parseCourseTitle(raw: string) {
  const m = /^\s*(\d{7})\s*\((\d{4})\/(\d)\)\s*(.*?)\s*(?:\[.*\])?\s*$/.exec(decode(raw));
  if (!m) return { code: null, year: null, semester: null, title: decode(raw).trim() };
  return {
    code: m[1] ?? null,
    year: Number(m[2]),
    semester: Number(m[3]),
    title: (m[4] ?? "").trim() || (m[1] ?? ""),
  };
}

/** Public course page (no login): its og:title names the course. */
export async function fetchCourseInfo(cvCid: string, fetchImpl: typeof fetch = fetch) {
  try {
    const res = await fetchImpl(
      `${mcvWebBase()}/?q=courseville/course/${encodeURIComponent(cvCid)}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
    return og ? parseCourseTitle(og) : null;
  } catch {
    return null;
  }
}

export interface McvSessionSnapshot {
  courses: NormalizedCourse[];
  tasks: NormalizedTask[];
}

/** Items + the courses they belong to, normalized like the OAuth connector (same ids). */
export async function buildSessionSnapshot(
  items: McvPanelItem[],
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<McvSessionSnapshot> {
  const courseIds = [...new Set(items.map((i) => i.cvCid))];
  const infos = await Promise.all(courseIds.map((id) => fetchCourseInfo(id, fetchImpl)));
  const courses: NormalizedCourse[] = courseIds.map((id, i) => {
    const info = infos[i];
    const code = info?.code ?? items.find((x) => x.cvCid === id)?.courseCode ?? null;
    return {
      source: "mcv",
      sourceId: id,
      code,
      title: info?.title || code || `Course ${id}`,
      year: info?.year ?? null,
      semester: info?.semester ?? null,
      role: "student",
      url: `${MCV_SITE}/?q=courseville/course/${id}`,
    };
  });
  const tasks: NormalizedTask[] = items.map((i) => ({
    source: "mcv",
    sourceId: i.itemId,
    courseSourceId: i.cvCid,
    title: i.title,
    dueAt: parseRelativeDue(i.dueText, now),
    url: i.url,
  }));
  return { courses, tasks };
}
