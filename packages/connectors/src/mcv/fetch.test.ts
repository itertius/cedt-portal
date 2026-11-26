import { describe, expect, it, vi } from "vitest";
import { fetchMcvSnapshot } from "./fetch";

function fakeMcv(routes: Record<string, unknown | number>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const key =
      url.pathname + (url.searchParams.get("cv_cid") ? `?${url.searchParams.get("cv_cid")}` : "");
    const body = routes[key];
    if (typeof body === "number") return new Response("err", { status: body });
    if (body === undefined) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as unknown as typeof fetch;
}

describe("fetchMcvSnapshot", () => {
  it("fetches current-term assignments and reports failing courses", async () => {
    const fetchImpl = fakeMcv({
      "/api/v1/public/get/user/courses": {
        data: {
          student: [
            { cv_cid: 1, title: "Now A", year: 2026, semester: 2 },
            { cv_cid: 2, title: "Now B", year: 2026, semester: 2 },
            { cv_cid: 3, title: "Old", year: 2025, semester: 1 },
          ],
        },
      },
      "/api/v1/public/get/course/assignments?1": {
        data: [{ itemid: 10, title: "HW", duetime: 1 }],
      },
      "/api/v1/public/get/course/assignments?2": 500,
    });

    const snap = await fetchMcvSnapshot("tok", fetchImpl);
    expect(snap.courses.map((c) => c.sourceId)).toEqual(["1", "2", "3"]);
    expect(snap.tasks.map((t) => t.sourceId)).toEqual(["10"]);
    expect(snap.fetchedCourses).toEqual(["1"]);
    expect(snap.failedCourses).toEqual([
      { sourceId: "2", error: "MCV 500 for /api/v1/public/get/course/assignments" },
    ]);
    // never fetches old-term courses
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws when the course list itself fails (e.g. expired token)", async () => {
    await expect(
      fetchMcvSnapshot("bad", fakeMcv({ "/api/v1/public/get/user/courses": 401 })),
    ).rejects.toMatchObject({ status: 401 });
  });
});
