#!/usr/bin/env node
// Minimal fake MyCourseVille OAuth server for local development without real MCV credentials.
// Usage: node apps/web/scripts/mock-mcv.mjs   (listens on http://localhost:4010)
// Then set MCV_BASE_URL=http://localhost:4010 and any MCV_CLIENT_ID / MCV_CLIENT_SECRET.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_MCV_PORT ?? 4010);
const USER = {
  id: process.env.MOCK_MCV_USER_ID ?? "6530000021",
  title_en: "Mr.",
  firstname_en: process.env.MOCK_MCV_FIRSTNAME ?? "Test",
  lastname_en: process.env.MOCK_MCV_LASTNAME ?? "Student",
};
const codes = new Map();
const tokens = new Set();

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => resolve(new URLSearchParams(data)));
  });

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/oauth/authorize") {
    const redirect = url.searchParams.get("redirect_uri");
    if (!redirect || !url.searchParams.get("client_id"))
      return json(res, 400, { error: "invalid_request" });
    const code = randomUUID();
    codes.set(code, redirect);
    const target = new URL(redirect);
    target.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state) target.searchParams.set("state", state);
    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/api/oauth/access_token") {
    const body = await readBody(req);
    const code = body.get("code");
    if (body.get("grant_type") !== "authorization_code" || !code || !codes.has(code)) {
      return json(res, 400, { error: "invalid_grant" });
    }
    if (!body.get("client_id") || !body.get("client_secret")) {
      return json(res, 401, { error: "invalid_client" });
    }
    codes.delete(code);
    const accessToken = randomUUID();
    tokens.add(accessToken);
    return json(res, 200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: randomUUID(),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/v1/public/users/me") {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token || !tokens.has(token)) return json(res, 401, { error: "invalid_token" });
    return json(res, 200, { user: USER });
  }

  json(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`mock MCV on http://localhost:${PORT}`));
