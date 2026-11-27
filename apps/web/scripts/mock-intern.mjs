#!/usr/bin/env node
// Fake CEDT Intern Portal API for local dev and e2e.
// Usage: node apps/web/scripts/mock-intern.mjs   (http://localhost:4050), then INTERN_BASE_URL=http://localhost:4050
// A request is logged in when its Cookie contains "cedt_session=good". Hook: POST /__test/expire.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_INTERN_PORT ?? 4050);
let valid = true;
const at = (days, hh = 16, mm = 59) => {
  const d = new Date(Date.now() + days * 86400_000);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString();
};
const sessions = [
  {
    sessionId: 8,
    title: "Internship 2026 (closed)",
    sessionGroupTitle: "2026",
    currentRound: 2,
    rounds: [],
  },
  {
    sessionId: 9,
    title: "CEDT Internship 2027",
    sessionGroupTitle: "2027",
    currentRound: 1,
    studentRankingDeadline: at(3),
    applicationAnnouncementDate: at(10, 3, 0),
    rounds: [
      { round: 1, studentRankingDeadline: at(3) },
      { round: 2, studentRankingDeadline: at(30) },
    ],
  },
];
const company = (en, th) => ({
  companyId: en.length,
  companyNameEn: en,
  companyNameTh: th,
  logoUrl: null,
});
const openings = [
  {
    openingId: 9001,
    sessionId: 9,
    title: "Backend Engineer Intern",
    company: company("Acme Tech", "แอคมี"),
    compensationAmount: 15000,
    compensationType: { compensationType: "per month" },
    workingCondition: "Hybrid",
    tags: [{ tagName: "Backend" }, { tagName: "Go" }],
    quota: 2,
    isBookmarked: true,
    isAcceptingApplication: true,
  },
  {
    openingId: 9002,
    sessionId: 9,
    title: "Data Analyst Intern",
    company: company("Beta Bank", "เบต้า"),
    compensationAmount: 20000,
    compensationType: { compensationType: "per month" },
    workingCondition: "On-Site",
    tags: [{ tagName: "Data" }],
    quota: 1,
    isBookmarked: false,
    isAcceptingApplication: true,
  },
  {
    openingId: 9003,
    sessionId: 9,
    title: "Frontend Intern",
    company: company("Gamma Studio", "แกมมา"),
    compensationAmount: null,
    workingCondition: "Online",
    tags: [{ tagName: "React" }],
    quota: 3,
    isBookmarked: false,
    isAcceptingApplication: false,
  },
];

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const authed = valid && (req.headers.cookie ?? "").includes("cedt_session=good");
  if (req.method === "POST" && url.pathname === "/__test/expire") {
    valid = false;
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__test/restore") {
    valid = true;
    return json(res, 200, { ok: true });
  }
  if (url.pathname.startsWith("/api/") && !authed)
    return json(res, 401, { message: "Unauthorized" });
  if (req.method === "GET" && url.pathname === "/api/common/sessions")
    return json(res, 200, sessions);
  const m = /^\/api\/sessions\/(\d+)\/openings$/.exec(url.pathname);
  if (req.method === "GET" && m) {
    const list = openings.filter((o) => o.sessionId === Number(m[1]));
    const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 10));
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const items = list.slice((page - 1) * limit, page * limit);
    return json(res, 200, {
      items,
      meta: {
        totalItem: list.length,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPage: Math.ceil(list.length / limit),
        currentPage: page,
      },
    });
  }
  json(res, 404, { message: "Not found" });
}).listen(PORT, () => console.log(`mock CEDT Intern Portal on http://localhost:${PORT}`));
