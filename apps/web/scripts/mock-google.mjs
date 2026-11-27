#!/usr/bin/env node
// Minimal fake Google (OAuth + userinfo + Calendar v3 "primary") for local dev and e2e.
// Usage: node apps/web/scripts/mock-google.mjs   (listens on http://localhost:4020)
// Then set GOOGLE_BASE_URL=http://localhost:4020 and any GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
//
// Test hooks (simulate changes made directly in Google):
//   GET    /__test/events          all events, including cancelled
//   POST   /__test/events          create a native Google event
//   PATCH  /__test/events/:id      edit an event
//   DELETE /__test/events/:id      delete (cancel) an event
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_GOOGLE_PORT ?? 4020);
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DEFAULT_USER = {
  sub: "g-109876",
  email: "student@example.com",
  email_verified: true,
  name: "Google Student",
};
let USER = { ...DEFAULT_USER };

const codes = new Map(); // code -> { challenge }
const access = new Set();
const refresh = new Set();
const events = new Map();
let clock = Date.now();
/** Strictly increasing `updated` values, like Google's. */
const stamp = () => {
  clock = Math.max(clock + 1, Date.now());
  return new Date(clock).toISOString();
};

const bkk = (days, hh, mm = 0) => {
  const d = new Date(Date.now() + 7 * 3600_000 + days * 86400_000);
  const day = d.toISOString().slice(0, 10);
  return new Date(
    Date.parse(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`),
  ).toISOString();
};
const dateIn = (days) =>
  new Date(Date.now() + 7 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);

function put(ev) {
  const e = {
    status: "confirmed",
    htmlLink: `https://calendar.google.com/event?eid=${ev.id}`,
    ...ev,
    updated: stamp(),
  };
  events.set(e.id, e);
  return e;
}
put({
  id: "gnative1",
  summary: "Google: Club meeting",
  start: { dateTime: bkk(1, 9) },
  end: { dateTime: bkk(1, 11) },
});
put({
  id: "gnative2",
  summary: "Google: Holiday",
  start: { date: dateIn(3) },
  end: { date: dateIn(4) },
});

const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
    });
    req.on("end", () => resolve(d));
  });
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const startMs = (e) => Date.parse(e.start?.dateTime ?? `${e.start?.date}T00:00:00+07:00`);
const endMs = (e) => Date.parse(e.end?.dateTime ?? `${e.end?.date}T00:00:00+07:00`);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  const authed = () => Boolean(bearer && access.has(bearer));

  // ---- OAuth ----
  if (req.method === "GET" && path === "/o/oauth2/v2/auth") {
    const p = url.searchParams;
    if (!p.get("client_id") || !p.get("redirect_uri"))
      return json(res, 400, { error: "invalid_request" });
    if (!p.get("scope")?.split(" ").includes(SCOPE))
      return json(res, 400, { error: "missing calendar scope" });
    const code = randomUUID();
    codes.set(code, { challenge: p.get("code_challenge") });
    const target = new URL(p.get("redirect_uri"));
    target.searchParams.set("code", code);
    if (p.get("state")) target.searchParams.set("state", p.get("state"));
    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }
  if (req.method === "POST" && path === "/token") {
    const b = new URLSearchParams(await readBody(req));
    if (!b.get("client_id") || !b.get("client_secret"))
      return json(res, 401, { error: "invalid_client" });
    if (b.get("grant_type") === "authorization_code") {
      const entry = codes.get(b.get("code"));
      if (!entry) return json(res, 400, { error: "invalid_grant" });
      if (entry.challenge) {
        const v = b.get("code_verifier") ?? "";
        const hashed = createHash("sha256").update(v).digest("base64url");
        if (hashed !== entry.challenge)
          return json(res, 400, { error: "invalid_grant", error_description: "PKCE" });
      }
      codes.delete(b.get("code"));
    } else if (b.get("grant_type") === "refresh_token") {
      if (!refresh.has(b.get("refresh_token"))) return json(res, 400, { error: "invalid_grant" });
    } else {
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    const at = randomUUID();
    access.add(at);
    const out = {
      access_token: at,
      token_type: "Bearer",
      expires_in: 3600,
      scope: `openid email profile ${SCOPE}`,
    };
    if (b.get("grant_type") === "authorization_code") {
      out.refresh_token = randomUUID();
      refresh.add(out.refresh_token);
    }
    return json(res, 200, out);
  }
  if (req.method === "GET" && path === "/v1/userinfo") {
    if (!authed()) return json(res, 401, { error: "invalid_token" });
    return json(res, 200, USER);
  }

  // ---- Calendar ----
  const base = "/calendar/v3/calendars/primary/events";
  if (path === base || path.startsWith(`${base}/`)) {
    if (!authed()) return json(res, 401, { error: { code: 401 } });
    const id = path.length > base.length ? decodeURIComponent(path.slice(base.length + 1)) : null;
    if (req.method === "GET" && !id) {
      const min = Date.parse(url.searchParams.get("timeMin") ?? "1970-01-01");
      const max = Date.parse(url.searchParams.get("timeMax") ?? "2100-01-01");
      const showDeleted = url.searchParams.get("showDeleted") === "true";
      const items = [...events.values()].filter(
        (e) => (showDeleted || e.status !== "cancelled") && startMs(e) < max && endMs(e) > min,
      );
      return json(res, 200, { kind: "calendar#events", items });
    }
    if (req.method === "POST" && !id) {
      const body = JSON.parse((await readBody(req)) || "{}");
      return json(
        res,
        200,
        put({ ...body, id: `g${randomUUID().replaceAll("-", "").slice(0, 20)}` }),
      );
    }
    const existing = id ? events.get(id) : undefined;
    if (!existing) return json(res, 404, { error: { code: 404 } });
    if (req.method === "PATCH") {
      if (existing.status === "cancelled") return json(res, 410, { error: { code: 410 } });
      const body = JSON.parse((await readBody(req)) || "{}");
      return json(res, 200, put({ ...existing, ...body, id }));
    }
    if (req.method === "DELETE") {
      if (existing.status === "cancelled") return json(res, 410, { error: { code: 410 } });
      put({ ...existing, status: "cancelled" });
      return json(res, 204);
    }
  }

  // ---- Test hooks ----
  // PUT /__test/user sets who signs in next (empty body = the default user).
  if (path === "/__test/user" && req.method === "PUT") {
    const body = await readBody(req);
    USER = body ? { ...DEFAULT_USER, ...JSON.parse(body) } : { ...DEFAULT_USER };
    return json(res, 200, USER);
  }
  if (path === "/__test/events" && req.method === "GET")
    return json(res, 200, [...events.values()]);
  if (path === "/__test/events" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    return json(res, 200, put({ id: `gtest${randomUUID().slice(0, 8)}`, ...body }));
  }
  if (path.startsWith("/__test/events/")) {
    const id = decodeURIComponent(path.slice("/__test/events/".length));
    const e = events.get(id);
    if (!e) return json(res, 404, { error: "not_found" });
    if (req.method === "PATCH")
      return json(res, 200, put({ ...e, ...JSON.parse((await readBody(req)) || "{}"), id }));
    if (req.method === "DELETE") return json(res, 200, put({ ...e, status: "cancelled" }));
  }

  json(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`mock Google on http://localhost:${PORT}`));
