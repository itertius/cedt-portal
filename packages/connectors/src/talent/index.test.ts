import { afterEach, describe, expect, it, vi } from "vitest";
import { bangkokInstant, fetchTalentActivities, normalizeTalentActivities } from "./index";

afterEach(() => {
  delete process.env.TALENT_BASE_URL;
});

describe("Talent Journey", () => {
  it("reads Bangkok date + time", () => {
    expect(bangkokInstant("2026-11-20", "13:00:00")?.toISOString()).toBe(
      "2026-11-20T06:00:00.000Z",
    );
    expect(bangkokInstant("2026-11-20", "13:00")?.toISOString()).toBe("2026-11-20T06:00:00.000Z");
    expect(bangkokInstant("20/11/2026", "13:00")).toBeNull();
    expect(bangkokInstant("2026-11-20", "25:00")).toBeNull();
  });

  it("normalizes activities, skipping bad rows and duplicates", () => {
    const out = normalizeTalentActivities({
      success: true,
      data: {
        activities: [
          {
            activityId: 237,
            name: "Toyota Asia - TOYOTA CAREER TALK",
            date: "2026-11-20",
            startTime: "13:00:00",
            endTime: "16:00:00",
            organization: "Toyota",
            activityStatus: "OPEN",
            currentParticipants: 12,
            maxParticipants: "50",
            posterUrl: ["/uploads/admin/activity-237.png"],
          },
          { activityId: 237, name: "duplicate", date: "2026-11-20", startTime: "09:00:00" },
          { activityId: 238, name: "No end", date: "2026-11-21", startTime: "09:00:00" },
          { activityId: 239, name: "Bad date", date: "soon", startTime: "09:00:00" },
          { name: "No id", date: "2026-11-21" },
        ],
      },
    });
    expect(out.map((a) => a.activityId)).toEqual([237, 238]);
    expect(out[0]).toMatchObject({
      name: "Toyota Asia - TOYOTA CAREER TALK",
      organization: "Toyota",
      startsAt: new Date("2026-11-20T06:00:00Z"),
      endsAt: new Date("2026-11-20T09:00:00Z"),
      participants: 12,
      maxParticipants: 50,
      posterUrl: "https://talent.cedt.community/uploads/admin/activity-237.png",
    });
    expect(out[1]?.endsAt.toISOString()).toBe("2026-11-21T03:00:00.000Z"); // 1 h default
  });

  it("accepts an organization object and an empty feed", () => {
    expect(
      normalizeTalentActivities({
        data: {
          activities: [
            {
              activityId: 1,
              date: "2026-11-20",
              startTime: "10:00",
              organization: { name: "CEDT" },
            },
          ],
        },
      })[0]?.organization,
    ).toBe("CEDT");
    expect(normalizeTalentActivities({})).toEqual([]);
  });

  it("fetches the public bootstrap from the configured host", async () => {
    process.env.TALENT_BASE_URL = "http://localhost:4330/";
    const fetchImpl = vi.fn(async () =>
      Response.json({ data: { activities: [] } }),
    ) as unknown as typeof fetch;
    await fetchTalentActivities(fetchImpl);
    const [url, init] =
      (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:4330/api/v2/home/bootstrap");
    expect(JSON.stringify(init?.headers)).toContain("CEDT-Hub");
    const failing = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchTalentActivities(failing)).rejects.toThrow("Talent Journey 503");
  });
});
