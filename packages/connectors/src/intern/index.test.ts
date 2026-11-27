import { describe, expect, it, vi } from "vitest";
import {
  cleanCookieHeader,
  currentSession,
  fetchInternOpenings,
  fetchInternSessions,
  normalizeInternSessions,
  normalizeOpenings,
} from "./index";

describe("CEDT Intern Portal", () => {
  it("cleans a pasted Cookie header", () => {
    expect(cleanCookieHeader("Cookie: sid=abc; _ga=GA1.2; Path=/; theme=dark\n")).toBe(
      "sid=abc; _ga=GA1.2; theme=dark",
    );
    expect(cleanCookieHeader("garbage without pairs")).toBe("");
  });

  it("turns session dates (session-level and per round) into deadlines", () => {
    const [s] = normalizeInternSessions([
      {
        sessionId: 9,
        title: "Internship 2027",
        studentRankingDeadline: "2026-12-10T16:59:59.000Z",
        applicationAnnouncementDate: "2026-12-20T03:00:00.000Z",
        rounds: [
          { round: 1, studentRankingDeadline: "2026-12-10T16:59:59.000Z" }, // same as session-level: deduped
          {
            round: 2,
            studentRankingDeadline: "2027-01-15T16:59:59.000Z",
            resultAnnouncementDate: null,
          },
        ],
      },
    ]);
    expect(s?.deadlines.map((d) => [d.title, d.kind, d.dueAt.toISOString()])).toEqual([
      ["Rank your internship choices · Internship 2027", "deadline", "2026-12-10T16:59:59.000Z"],
      [
        "Application results announced · Internship 2027",
        "announcement",
        "2026-12-20T03:00:00.000Z",
      ],
      [
        "Rank your internship choices (round 2) · Internship 2027",
        "deadline",
        "2027-01-15T16:59:59.000Z",
      ],
    ]);
  });

  it("normalizes openings", () => {
    const [o] = normalizeOpenings(
      [
        {
          openingId: 101,
          title: "Backend Intern",
          company: { companyNameTh: "บริษัท", companyNameEn: "Acme", logoUrl: "https://x/logo.png" },
          compensationAmount: "15000.00",
          compensationType: { compensationType: "ต่อเดือน" },
          workingCondition: "Hybrid",
          tags: [{ tagName: "Backend" }, { tagName: null }],
          quota: 2,
          startDate: "2027-06-01T00:00:00.000Z",
          isBookmarked: true,
        },
        { openingId: 101, title: "dup" },
      ],
      9,
    );
    expect(o).toEqual({
      openingId: 101,
      sessionId: 9,
      title: "Backend Intern",
      company: "Acme",
      logoUrl: "https://x/logo.png",
      tags: ["Backend"],
      workingCondition: "Hybrid",
      compensation: 15000,
      compensationType: "ต่อเดือน",
      quota: 2,
      startDate: "2027-06-01",
      endDate: null,
      bookmarked: true,
      acceptingApplications: true,
      url: "https://cedtintern.cp.eng.chula.ac.th/opening/101/session/9",
    });
  });

  it("pages through openings with the cookie, and maps 401 to 'session expired'", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push(
        `${url.pathname}?page=${url.searchParams.get("page")} cookie=${(init?.headers as Record<string, string> | undefined)?.Cookie}`,
      );
      const page = Number(url.searchParams.get("page"));
      return Response.json({
        items: [{ openingId: page, title: `O${page}` }],
        meta: { totalPage: 2, totalItem: 2 },
      });
    }) as unknown as typeof fetch;
    const out = await fetchInternOpenings("sid=abc", 9, fetchImpl);
    expect(out.map((o) => o.openingId)).toEqual([1, 2]);
    expect(seen).toEqual([
      "/api/sessions/9/openings?page=1 cookie=sid=abc",
      "/api/sessions/9/openings?page=2 cookie=sid=abc",
    ]);

    const expired = vi.fn(async () =>
      Response.json({ message: "Unauthorized" }, { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(fetchInternSessions("old", expired)).rejects.toMatchObject({
      status: 401,
      message: "Intern Portal session expired",
    });
  });

  it("picks the newest session", () => {
    expect(
      currentSession(
        normalizeInternSessions([{ sessionId: 7 }, { sessionId: 9 }, { sessionId: 8 }]),
      )?.sessionId,
    ).toBe(9);
    expect(currentSession([])).toBeNull();
  });
});
