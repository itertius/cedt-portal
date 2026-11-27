#!/usr/bin/env node
// Fake Talent Journey public feed for local dev and e2e.
// Usage: node apps/web/scripts/mock-talent.mjs   (http://localhost:4030), then TALENT_BASE_URL=http://localhost:4030
// Test hook: PUT /__test/activities with a JSON array replaces the feed.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_TALENT_PORT ?? 4030);
const day = (n) => new Date(Date.now() + 7 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
let activities = [
  {
    activityId: 501,
    name: "Mock Corp - CAREER TALK",
    date: day(1),
    startTime: "13:00:00",
    endTime: "16:00:00",
    organization: "Mock Corp",
    activityStatus: "OPEN",
    currentParticipants: 12,
    maxParticipants: 50,
    posterUrl: ["/uploads/admin/activity-501.png"],
  },
  {
    activityId: 502,
    name: "AI Security Workshop",
    date: day(2),
    startTime: "09:00:00",
    endTime: "12:00:00",
    organization: "Cyber Club",
    activityStatus: "OPEN",
    currentParticipants: 30,
    maxParticipants: 30,
    posterUrl: [],
  },
];

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && url.pathname === "/api/v2/home/bootstrap") {
    return json(200, {
      success: true,
      data: { activities, recruitingClubs: [], sponsorPosters: [], sponsorLogos: [] },
    });
  }
  if (req.method === "PUT" && url.pathname === "/__test/activities") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      activities = JSON.parse(body || "[]");
      json(200, { ok: true, count: activities.length });
    });
    return;
  }
  json(404, { success: false });
}).listen(PORT, () => console.log(`mock Talent Journey on http://localhost:${PORT}`));
