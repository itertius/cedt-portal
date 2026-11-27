#!/usr/bin/env node
// Fake CEDT Grader (cafe-grader /api/v1) for local dev and e2e.
// Usage: node apps/web/scripts/mock-grader.mjs   (http://localhost:4040), then GRADER_BASE_URL=http://localhost:4040
// Login: 6630000021 / correct-horse. Test hooks: POST /__test/expire (invalidate tokens), GET /__test/stats.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_GRADER_PORT ?? 4040);
const USER = { id: 42, login: "6630000021", full_name: "Test Student" };
const PASSWORD = "correct-horse";
let tokens = new Set();
const stats = { logins: 0, failedLogins: 0 };
const problems = [
  {
    id: 101,
    name: "00_Intro_11",
    full_name: "Hello Grader",
    tags: ["intro"],
    submission_count: 2,
    best_score: 100.0,
    last_score: 100.0,
    last_submission_time: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: 102,
    name: "01_Loop_23",
    full_name: "Nested loops",
    tags: ["loop"],
    submission_count: 3,
    best_score: 40.0,
    last_score: 40.0,
    last_submission_time: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 103,
    name: "02_Func_01",
    full_name: "Functions",
    tags: [],
    submission_count: 0,
    best_score: null,
    last_score: null,
    last_submission_time: null,
  },
];

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const token = req.headers.authorization?.split(" ").at(-1);
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      stats.logins++;
      if (stats.failedLogins >= 5)
        return json(res, 429, { error: "Too many failed login attempts; try again later" });
      const { login, password } = JSON.parse(body || "{}");
      if (login !== USER.login || password !== PASSWORD) {
        stats.failedLogins++;
        return json(res, 401, { error: "Invalid login or password" });
      }
      const t = `mockjwt.${randomUUID()}`;
      tokens.add(t);
      return json(res, 200, {
        token: t,
        expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
        user: USER,
      });
    }
    if (url.pathname.startsWith("/api/v1/")) {
      if (!token) return json(res, 401, { error: "Missing authorization token" });
      if (!tokens.has(token)) return json(res, 401, { error: "Token has expired" });
      if (req.method === "GET" && url.pathname === "/api/v1/problems")
        return json(res, 200, problems);
      if (req.method === "GET" && url.pathname === "/api/v1/me")
        return json(res, 200, { ...USER, admin: false });
    }
    if (req.method === "POST" && url.pathname === "/__test/expire") {
      tokens = new Set();
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/__test/stats") return json(res, 200, stats);
    json(res, 404, { error: "Not found" });
  });
}).listen(PORT, () => console.log(`mock CEDT Grader on http://localhost:${PORT}`));
