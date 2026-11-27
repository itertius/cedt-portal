import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGraderProblems,
  GraderError,
  graderLogin,
  normalizeGraderProblems,
  problemState,
} from "./index";

afterEach(() => {
  delete process.env.GRADER_BASE_URL;
});
const calls = (f: typeof fetch) =>
  (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;

describe("CEDT Grader", () => {
  it("logs in once and returns the JWT, expiry and user", async () => {
    process.env.GRADER_BASE_URL = "http://localhost:4340";
    const fetchImpl = vi.fn(async () =>
      Response.json({
        token: "jwt.abc",
        expires_at: "2026-11-27T12:00:00Z",
        user: { id: 7, login: "6630000021", full_name: "Test" },
      }),
    ) as unknown as typeof fetch;
    const r = await graderLogin("6630000021", "pw", fetchImpl);
    expect(r).toEqual({
      token: "jwt.abc",
      expiresAt: new Date("2026-11-27T12:00:00Z"),
      user: { id: 7, login: "6630000021", fullName: "Test" },
    });
    const [url, init] = calls(fetchImpl)[0] ?? [];
    expect(url).toBe("http://localhost:4340/api/v1/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ login: "6630000021", password: "pw" });
  });

  it("surfaces the server's error text and status (no retry)", async () => {
    const bad = vi.fn(async () =>
      Response.json({ error: "Invalid login or password" }, { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(graderLogin("x", "y", bad)).rejects.toMatchObject({
      message: "Invalid login or password",
      status: 401,
    });
    expect(bad).toHaveBeenCalledTimes(1);
    const throttled = vi.fn(async () =>
      Response.json({ error: "Too many failed login attempts; try again later" }, { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(graderLogin("x", "y", throttled)).rejects.toBeInstanceOf(GraderError);
  });

  it("normalizes the problem list", () => {
    const out = normalizeGraderProblems([
      {
        id: 1,
        name: "00_Intro_11",
        full_name: "Hello",
        best_score: "100.0",
        last_score: 100,
        submission_count: 3,
        last_submission_time: "2026-11-20T10:00:00Z",
        tags: ["intro"],
      },
      { id: 2, name: " ", best_score: null, submission_count: 0 },
      { id: 1, name: "duplicate" },
      { name: "no id" },
    ]);
    expect(out).toEqual([
      {
        problemId: 1,
        name: "00_Intro_11",
        fullName: "Hello",
        bestScore: 100,
        lastScore: 100,
        submissionCount: 3,
        lastSubmittedAt: new Date("2026-11-20T10:00:00Z"),
        tags: ["intro"],
      },
      {
        problemId: 2,
        name: "Problem 2",
        fullName: null,
        bestScore: null,
        lastScore: null,
        submissionCount: 0,
        lastSubmittedAt: null,
        tags: [],
      },
    ]);
  });

  it("classifies problem progress", () => {
    expect(problemState({ bestScore: 100, submissionCount: 2 })).toBe("solved");
    expect(problemState({ bestScore: 40, submissionCount: 2 })).toBe("partial");
    expect(problemState({ bestScore: 0, submissionCount: 1 })).toBe("attempted");
    expect(problemState({ bestScore: null, submissionCount: 0 })).toBe("new");
  });

  it("sends the bearer token and reports expiry as 401", async () => {
    const ok = vi.fn(async () => Response.json([{ id: 5, name: "P" }])) as unknown as typeof fetch;
    expect((await fetchGraderProblems("jwt.abc", ok)).map((p) => p.problemId)).toEqual([5]);
    expect(JSON.stringify(calls(ok)[0]?.[1]?.headers)).toContain("Bearer jwt.abc");
    const expired = vi.fn(async () =>
      Response.json({ error: "Token has expired" }, { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(fetchGraderProblems("old", expired)).rejects.toMatchObject({
      status: 401,
      message: "Token has expired",
    });
  });
});
