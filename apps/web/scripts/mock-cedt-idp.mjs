#!/usr/bin/env node
// Fake CEDT IDP (OAuth 2.0 at cedtintern) for local dev and e2e.
// Usage: node apps/web/scripts/mock-cedt-idp.mjs   (http://localhost:4060)
// Then CEDT_IDP_BASE_URL=http://localhost:4060 and any CEDT_IDP_CLIENT_ID / CEDT_IDP_CLIENT_SECRET.
// Test hook: PUT /__test/user with a profile JSON chooses who "logs in" next.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_CEDT_IDP_PORT ?? 4060);
let profile = {
  userId: "cedt-u-001",
  userType: "CEDT_STUDENT",
  studentId: "6630000021",
  firstNameTh: "สมชาย",
  firstNameEn: "Somchai",
  lastNameTh: "ใจดี",
  lastNameEn: "Jaidee",
  admissionYear: 2023,
  profileImageUrl: null,
  isInternPortalAdmin: false,
};
const codes = new Map(); // code -> { redirectUri, profile }
const tokens = new Map(); // access token -> profile

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const read = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
    });
    req.on("end", () => resolve(d));
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/oauth/authorize") {
    const p = url.searchParams;
    if (!p.get("client_id") || !p.get("redirect_uri") || p.get("response_type") !== "code") {
      return json(res, 400, { message: "invalid_request" });
    }
    const code = randomUUID();
    codes.set(code, { redirectUri: p.get("redirect_uri"), profile: { ...profile } });
    const to = new URL(p.get("redirect_uri"));
    to.searchParams.set("code", code);
    if (p.get("state")) to.searchParams.set("state", p.get("state"));
    res.writeHead(302, { Location: to.toString() });
    return res.end();
  }
  if (req.method === "POST" && url.pathname === "/api/oauth/token") {
    const b = new URLSearchParams(await read(req));
    if (!b.get("client_id") || !b.get("client_secret"))
      return json(res, 401, { message: "invalid_client" });
    const entry = codes.get(b.get("code"));
    if (b.get("grant_type") !== "authorization_code" || !entry)
      return json(res, 400, { message: "invalid_grant" });
    if (entry.redirectUri !== b.get("redirect_uri"))
      return json(res, 400, { message: "redirect_uri mismatch" });
    codes.delete(b.get("code"));
    const access = `cedtidp.${randomUUID()}`;
    tokens.set(access, entry.profile);
    return json(res, 200, {
      token_type: "Bearer",
      access_token: access,
      refresh_token: randomUUID(),
      expires_in: 86400,
      scope: "profile",
    });
  }
  if (req.method === "GET" && url.pathname === "/api/oauth/v1/profile") {
    const t = req.headers.authorization?.replace(/^Bearer /, "");
    const p = t && tokens.get(t);
    return p ? json(res, 200, p) : json(res, 401, { message: "Unauthorized" });
  }
  if (req.method === "PUT" && url.pathname === "/__test/user") {
    profile = { ...profile, ...JSON.parse((await read(req)) || "{}") };
    return json(res, 200, { ok: true });
  }
  json(res, 404, { message: "Not found" });
}).listen(PORT, () => console.log(`mock CEDT IDP on http://localhost:${PORT}`));
