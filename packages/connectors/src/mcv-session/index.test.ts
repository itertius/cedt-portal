import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionSnapshot,
  McvWrongPasswordError,
  mcvLogin,
  parseCourseTitle,
  parseLoginForm,
  parsePanelHtml,
  parseRelativeDue,
} from "./index";

afterEach(() => {
  delete process.env.MCV_WEB_BASE_URL;
});

describe("login form", () => {
  it("finds the MCV login form, its hidden fields and credential field names", () => {
    const html = `<form id="other" action="/search"><input name="q"></form>
      <form id="cv-login-cvecologin-form" action="/api/chulalogin?x=1&amp;y=2" method="post">
        <input type="hidden" name="_token" value="abc123">
        <input type="text" id="username" name="user_id">
        <input type="password" id="password" name="pass_word">
        <input type="checkbox" name="remember" value="1" checked>
        <input type="checkbox" name="other" value="1">
        <input type="submit" name="go" value="Login">
      </form>`;
    expect(parseLoginForm(html, "https://www.mycourseville.com/api/oauth/authorize?a=1")).toEqual({
      action: "https://www.mycourseville.com/api/chulalogin?x=1&y=2",
      fields: { _token: "abc123", user_id: "", pass_word: "", remember: "1" },
      usernameField: "user_id",
      passwordField: "pass_word",
    });
  });

  it("falls back to any form with a password field, and to null", () => {
    expect(
      parseLoginForm(
        '<form action="/l"><input name="username"><input type="password" name="password"></form>',
        "https://x.test/p",
      )?.action,
    ).toBe("https://x.test/l");
    expect(parseLoginForm("<p>no form</p>", "https://x.test/")).toBeNull();
  });
});

describe("pending-items panel", () => {
  const panel = `<div>2 items due in 7 days</div>
    <div class="cv-item">summary</div>
    <div class="cv-item"><span class="cvui-course-badge">2110101</span>
      <a href="/?q=courseville/worksheet/85196/2154933">open</a>
      <strong>&ldquo;Lab 5: OAuth &amp; you&rdquo;</strong> due in <strong>3 days</strong></div>
    <div class="cv-item"><span class="cvui-course-badge">2301108</span>
      <a href="https://www.mycourseville.com/?q=courseville/worksheet/90001/3000001">open</a>
      <strong>Problem set 3</strong> due in <strong>5 hours</strong></div>
    <div class="cv-item"><a href="/?q=courseville/worksheet/85196/2154933">dup</a></div>`;

  it("parses items with course code, ids, title and due text", () => {
    expect(parsePanelHtml(panel)).toEqual([
      {
        courseCode: "2110101",
        cvCid: "85196",
        itemId: "2154933",
        title: "Lab 5: OAuth & you",
        dueText: "3 days",
        url: "https://www.mycourseville.com/?q=courseville/worksheet/85196/2154933",
      },
      {
        courseCode: "2301108",
        cvCid: "90001",
        itemId: "3000001",
        title: "Problem set 3",
        dueText: "5 hours",
        url: "https://www.mycourseville.com/?q=courseville/worksheet/90001/3000001",
      },
    ]);
  });
});

describe("relative due dates", () => {
  const now = new Date("2026-11-27T05:00:00Z"); // 12:00 in Bangkok
  it("hours and minutes are added exactly", () => {
    expect(parseRelativeDue("5 hours", now)?.toISOString()).toBe("2026-11-27T10:00:00.000Z");
    expect(parseRelativeDue("30 minutes", now)?.toISOString()).toBe("2026-11-27T05:30:00.000Z");
    expect(parseRelativeDue("2 ชั่วโมง", now)?.toISOString()).toBe("2026-11-27T07:00:00.000Z");
  });
  it("days count to 23:59 Bangkok of that day", () => {
    expect(parseRelativeDue("3 days", now)?.toISOString()).toBe("2026-11-30T16:59:00.000Z");
    expect(parseRelativeDue("1 วัน", now)?.toISOString()).toBe("2026-11-28T16:59:00.000Z");
    expect(parseRelativeDue("today", now)?.toISOString()).toBe("2026-11-27T16:59:00.000Z");
    expect(parseRelativeDue("a week", now)?.toISOString()).toBe("2026-12-04T16:59:00.000Z");
  });
  it("unknown wording gives no date", () => {
    expect(parseRelativeDue("", now)).toBeNull();
    expect(parseRelativeDue("soon", now)).toBeNull();
  });
});

describe("course titles", () => {
  it("decodes entities once (no double-unescaping)", () => {
    expect(parseCourseTitle("Club &amp;quot;A&amp;quot; &amp; friends").title).toBe(
      "Club &quot;A&quot; & friends",
    );
  });

  it("stays fast on hostile input (no catastrophic backtracking)", () => {
    const evil = `2110101 (2026/1) ${" ".repeat(50_000)}x[${"[".repeat(50_000)}`;
    const t0 = performance.now();
    parseCourseTitle(evil);
    parsePanelHtml(`<div class="cv-item">${"du in ".repeat(20_000)}<strong>${"<".repeat(10)}`);
    parsePanelHtml(`<div class="cv-item">${'cvui-course-badge">;'.repeat(20_000)}`);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("splits code, term and name, dropping the section", () => {
    expect(
      parseCourseTitle("2110506 (2026/1) Software-Defined Systems I [Section 51 - 55]"),
    ).toEqual({
      code: "2110506",
      year: 2026,
      semester: 1,
      title: "Software-Defined Systems I",
    });
    expect(parseCourseTitle("Some club page")).toEqual({
      code: null,
      year: null,
      semester: null,
      title: "Some club page",
    });
  });
});

describe("login flow (fake MCV)", () => {
  function fakeMcv(correct: string) {
    const calls: string[] = [];
    // Real responses carry their URL; the cookie jar needs it to store cookies.
    const withUrl = (res: Response, url: URL) =>
      Object.defineProperty(res, "url", { value: url.href });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      return withUrl(route(url, init), url);
    }) as unknown as typeof fetch;
    function route(url: URL, init?: RequestInit): Response {
      if (url.pathname === "/api/oauth/authorize") {
        return new Response(
          '<form id="cv-login-cvecologin-form" action="/api/chulalogin"><input type="hidden" name="_token" value="t"><input id="username" name="username"><input type="password" id="password" name="password"></form>',
          { headers: { "content-type": "text/html" } },
        );
      }
      if (url.pathname === "/api/chulalogin") {
        const body = new URLSearchParams(String(init?.body));
        if (body.get("password") !== correct || body.get("_token") !== "t") {
          return new Response("<p>ชื่อบัญชี หรือ รหัสผ่านผิดพลาด</p>", {
            headers: { "content-type": "text/html" },
          });
        }
        return new Response('<div class="courseville-usermenutrigger">me</div>', {
          headers: { "content-type": "text/html", "set-cookie": "laravel_session=ok; Path=/" },
        });
      }
      return new Response("<html>home</html>", { headers: { "content-type": "text/html" } });
    }
    return { fetchImpl, calls };
  }

  it("logs in and keeps the session cookie", async () => {
    process.env.MCV_WEB_BASE_URL = "http://mcv.test";
    const { fetchImpl, calls } = fakeMcv("right");
    const jar = await mcvLogin("6933243721", "right", fetchImpl);
    expect((await jar.getCookieString("http://mcv.test/")).includes("laravel_session=ok")).toBe(
      true,
    );
    expect(calls).toEqual(["GET /", "GET /api/oauth/authorize", "POST /api/chulalogin"]);
  });

  it("reports a wrong password once, without retrying", async () => {
    process.env.MCV_WEB_BASE_URL = "http://mcv.test";
    const { fetchImpl, calls } = fakeMcv("right");
    await expect(mcvLogin("6933243721", "wrong", fetchImpl)).rejects.toBeInstanceOf(
      McvWrongPasswordError,
    );
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  });
});

describe("snapshot", () => {
  it("names courses from their public page and keeps OAuth-compatible ids", async () => {
    process.env.MCV_WEB_BASE_URL = "http://mcv.test";
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<meta property="og:title" content="2110101 (2026/2) Computer Engineering Essentials [Section 1]">',
        ),
    ) as unknown as typeof fetch;
    const snap = await buildSessionSnapshot(
      [
        {
          courseCode: "2110101",
          cvCid: "85196",
          itemId: "2154933",
          title: "Lab 5",
          dueText: "5 hours",
          url: "u",
        },
      ],
      fetchImpl,
      new Date("2026-11-27T05:00:00Z"),
    );
    expect(snap.courses).toEqual([
      {
        source: "mcv",
        sourceId: "85196",
        code: "2110101",
        title: "Computer Engineering Essentials",
        year: 2026,
        semester: 2,
        role: "student",
        url: "https://www.mycourseville.com/?q=courseville/course/85196",
      },
    ]);
    expect(snap.tasks[0]).toMatchObject({
      sourceId: "2154933",
      courseSourceId: "85196",
      dueAt: new Date("2026-11-27T10:00:00Z"),
    });
  });
});
