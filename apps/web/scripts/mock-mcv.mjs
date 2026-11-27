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
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;
const COURSES = [
  {
    cv_cid: 1001,
    course_no: "2110101",
    title: "Computer Engineering Essentials",
    year: 2026,
    semester: 2,
    role: "student",
  },
  {
    cv_cid: 1002,
    course_no: "2301108",
    title: "Calculus II",
    year: 2026,
    semester: 2,
    role: "student",
  },
  {
    cv_cid: 900,
    course_no: "2301107",
    title: "Calculus I",
    year: 2026,
    semester: 1,
    role: "student",
  },
];
const ASSIGNMENTS = {
  1001: [
    { itemid: 50001, cv_cid: 1001, title: "Lab 5: OAuth", duetime: now + 2 * DAY },
    { itemid: 50002, cv_cid: 1001, title: "Project proposal", duetime: now - DAY },
  ],
  1002: [
    { itemid: 60001, cv_cid: 1002, title: "Problem set 3", duetime: now + 5 * DAY },
    { itemid: 60002, cv_cid: 1002, title: "Reading: series", duetime: 0 },
  ],
  900: [{ itemid: 40001, cv_cid: 900, title: "Old term HW", duetime: now - 120 * DAY }],
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

// ---- MyCourseVille website (CUNET login + pending panel) ----------------------------------------
// Login: CUNET 6933243721 / cunet-pass. Hooks: POST /__test/web/expire, GET /__test/web/stats,
// PUT /__test/web/password (change the account password), PUT /__test/web/panel (replace items).
const web = { password: "cunet-pass", sessions: new Set(), logins: 0, failedLogins: 0 };
const COURSE_TITLES = {
  1001: "2110101 (2026/2) Computer Engineering Essentials [Section 1]",
  1002: "2301108 (2026/2) Calculus II [Section 2]",
};
let panelItems = [
  { cvCid: 1001, code: "2110101", itemId: 50001, title: "Lab 5: OAuth", due: "2 days" },
  { cvCid: 1002, code: "2301108", itemId: 60001, title: "Problem set 3", due: "5 hours" },
];
const cookieOf = (req, name) =>
  (req.headers.cookie ?? "")
    .split(/;\s*/)
    .map((p) => p.split("="))
    .find(([k]) => k === name)?.[1];
const html = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
};

async function handleWeb(req, res, url) {
  const loggedIn = web.sessions.has(cookieOf(req, "mcv_session"));
  const q = url.searchParams.get("q") ?? "";
  if (url.pathname === "/" && req.method === "GET") {
    const m = /^courseville\/course\/(\d+)$/.exec(q);
    if (m) {
      const title = COURSE_TITLES[m[1]];
      return title
        ? html(res, 200, `<html><head><meta property="og:title" content="${title}"></head></html>`)
        : html(res, 404, "nope");
    }
    return html(
      res,
      200,
      loggedIn
        ? '<div class="courseville-usermenutrigger">Test Student</div>'
        : "<html><a>Log in</a></html>",
      { "Set-Cookie": "laravel_session=anon; Path=/" },
    );
  }
  if (
    url.pathname === "/" &&
    req.method === "POST" &&
    q === "courseville/ajax/getactivepanelcontent"
  ) {
    if (!loggedIn) return html(res, 200, "<html>Please log in</html>");
    const blocks = panelItems
      .map(
        (i) =>
          `<div class="cv-item"><span class="cvui-course-badge">${i.code}</span><a href="/?q=courseville/worksheet/${i.cvCid}/${i.itemId}">open</a><strong>&ldquo;${i.title}&rdquo;</strong> due in <strong>${i.due}</strong></div>`,
      )
      .join("");
    return json(res, 200, {
      status: 1,
      count: panelItems.length,
      html: `<div>${panelItems.length} items due in 7 days</div><div class="cv-item">summary</div>${blocks}`,
    });
  }
  if (url.pathname === "/api/chulalogin" && req.method === "POST") {
    const body = await readBody(req);
    if (body.get("_token") !== "csrf-123") return html(res, 419, "Page expired");
    web.logins++;
    if (body.get("username") !== "6933243721" || body.get("password") !== web.password) {
      web.failedLogins++;
      return html(res, 200, '<div class="alert">ชื่อบัญชี หรือ รหัสผ่านผิดพลาด</div>');
    }
    const sid = randomUUID();
    web.sessions.add(sid);
    res.writeHead(302, { Location: "/", "Set-Cookie": `mcv_session=${sid}; Path=/; HttpOnly` });
    return res.end();
  }
  if (url.pathname.startsWith("/__test/web/")) {
    if (url.pathname === "/__test/web/expire" && req.method === "POST") {
      web.sessions.clear();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/__test/web/stats")
      return json(res, 200, { logins: web.logins, failedLogins: web.failedLogins });
    if (url.pathname === "/__test/web/password" && req.method === "PUT") {
      web.password = (await readBody(req)).get("password") ?? web.password;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/__test/web/panel" && req.method === "PUT") {
      let raw = "";
      for await (const c of req) raw += c;
      panelItems = JSON.parse(raw || "[]");
      return json(res, 200, { ok: true });
    }
  }
  return false;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // MCV's own first-party OAuth client (the website login) shows the CU-SSO form.
  if (
    req.method === "GET" &&
    url.pathname === "/api/oauth/authorize" &&
    url.searchParams.get("client_id") === "mycourseville.com"
  ) {
    return html(
      res,
      200,
      '<form id="cv-login-cvecologin-form" action="/api/chulalogin" method="post"><input type="hidden" name="_token" value="csrf-123"><input type="text" id="username" name="username"><input type="password" id="password" name="password"><button type="submit">Login</button></form>',
    );
  }
  if (
    url.pathname === "/" ||
    url.pathname === "/api/chulalogin" ||
    url.pathname.startsWith("/__test/web/")
  ) {
    if ((await handleWeb(req, res, url)) !== false) return;
  }

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

  const authed = () => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    return Boolean(token && tokens.has(token));
  };

  if (req.method === "GET" && url.pathname === "/api/v1/public/get/user/courses") {
    if (!authed()) return json(res, 401, { error: "invalid_token" });
    return json(res, 200, { status: 200, data: { student: COURSES } });
  }

  if (req.method === "GET" && url.pathname === "/api/v1/public/get/course/assignments") {
    if (!authed()) return json(res, 401, { error: "invalid_token" });
    const list = ASSIGNMENTS[url.searchParams.get("cv_cid") ?? ""];
    if (!list) return json(res, 404, { error: "course_not_found" });
    return json(res, 200, { status: 200, data: list });
  }

  json(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`mock MCV on http://localhost:${PORT}`));
