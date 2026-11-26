import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteGoogleEvent,
  HUB_ID_PROPERTY,
  listGoogleEvents,
  normalizeGoogleEvent,
  toGoogleBody,
} from "./events";

afterEach(() => {
  delete process.env.GOOGLE_BASE_URL;
});

describe("toGoogleBody", () => {
  const base = {
    id: "hub-1",
    title: "Study",
    description: null,
    location: "Eng 4",
    startsAt: new Date("2026-12-03T12:00:00Z"),
    endsAt: new Date("2026-12-03T14:00:00Z"),
    allDay: false,
  };

  it("sends timed events as dateTime in Bangkok and tags the hub id", () => {
    expect(toGoogleBody(base)).toEqual({
      summary: "Study",
      description: undefined,
      location: "Eng 4",
      start: { dateTime: "2026-12-03T12:00:00.000Z", timeZone: "Asia/Bangkok" },
      end: { dateTime: "2026-12-03T14:00:00.000Z", timeZone: "Asia/Bangkok" },
      extendedProperties: { private: { [HUB_ID_PROPERTY]: "hub-1" } },
    });
  });

  it("sends all-day events as local dates with an exclusive end", () => {
    const body = toGoogleBody({
      ...base,
      allDay: true,
      startsAt: new Date("2026-12-06T17:00:00Z"), // Dec 7 00:00 Bangkok
      endsAt: new Date("2026-12-11T17:00:00Z"), // Dec 12 00:00 Bangkok
    });
    expect(body.start).toEqual({ date: "2026-12-07" });
    expect(body.end).toEqual({ date: "2026-12-12" });
  });
});

describe("normalizeGoogleEvent", () => {
  it("maps a timed event", () => {
    expect(
      normalizeGoogleEvent({
        id: "g1",
        status: "confirmed",
        summary: " Lecture ",
        htmlLink: "https://calendar.google.com/x",
        updated: "2026-11-01T00:00:00.000Z",
        start: { dateTime: "2026-12-03T09:00:00+07:00" },
        end: { dateTime: "2026-12-03T12:00:00+07:00" },
      }),
    ).toEqual({
      remoteId: "g1",
      cancelled: false,
      hubId: null,
      title: "Lecture",
      description: null,
      location: null,
      startsAt: new Date("2026-12-03T02:00:00Z"),
      endsAt: new Date("2026-12-03T05:00:00Z"),
      allDay: false,
      url: "https://calendar.google.com/x",
      updated: "2026-11-01T00:00:00.000Z",
    });
  });

  it("maps all-day events to Bangkok midnight", () => {
    const n = normalizeGoogleEvent({
      id: "g2",
      start: { date: "2026-12-07" },
      end: { date: "2026-12-08" },
    });
    expect(n?.allDay).toBe(true);
    expect(n?.startsAt.toISOString()).toBe("2026-12-06T17:00:00.000Z");
    expect(n?.endsAt.toISOString()).toBe("2026-12-07T17:00:00.000Z");
  });

  it("recognises hub copies and cancelled events", () => {
    const n = normalizeGoogleEvent({
      id: "g3",
      status: "cancelled",
      extendedProperties: { private: { [HUB_ID_PROPERTY]: "hub-9" } },
    });
    expect(n).toMatchObject({ remoteId: "g3", cancelled: true, hubId: "hub-9" });
  });

  it("fills a missing title and repairs a missing or inverted end", () => {
    const n = normalizeGoogleEvent({
      id: "g4",
      start: { dateTime: "2026-12-03T09:00:00Z" },
      end: { dateTime: "2026-12-03T08:00:00Z" },
    });
    expect(n?.title).toBe("(No title)");
    expect(n?.endsAt.toISOString()).toBe("2026-12-03T10:00:00.000Z");
  });

  it("drops events without an id or a start", () => {
    expect(normalizeGoogleEvent({ id: "" })).toBeNull();
    expect(normalizeGoogleEvent({ id: "g5", status: "confirmed" })).toBeNull();
  });
});

describe("Google API calls", () => {
  it("pages through events and sends the right query", async () => {
    const urls: URL[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      return Response.json(
        url.searchParams.get("pageToken")
          ? { items: [{ id: "b" }] }
          : { items: [{ id: "a" }], nextPageToken: "p2" },
      );
    }) as unknown as typeof fetch;
    const items = await listGoogleEvents(
      "tok",
      new Date("2026-12-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
      fetchImpl,
    );
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(urls[0]?.host).toBe("www.googleapis.com");
    expect(urls[0]?.searchParams.get("singleEvents")).toBe("true");
    expect(urls[0]?.searchParams.get("showDeleted")).toBe("true");
    expect(urls[1]?.searchParams.get("pageToken")).toBe("p2");
  });

  it("uses GOOGLE_BASE_URL for the mock", async () => {
    process.env.GOOGLE_BASE_URL = "http://localhost:4020/";
    const fetchImpl = vi.fn(async () => Response.json({ items: [] })) as unknown as typeof fetch;
    await listGoogleEvents("tok", new Date(), new Date(), fetchImpl);
    expect(
      String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]),
    ).toMatch(/^http:\/\/localhost:4020\/calendar\/v3\/calendars\/primary\/events\?/);
  });

  it("treats deleting an already-deleted event as success", async () => {
    const gone = vi.fn(async () => new Response("", { status: 410 })) as unknown as typeof fetch;
    await expect(deleteGoogleEvent("tok", "x", gone)).resolves.toBeUndefined();
    const broken = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(deleteGoogleEvent("tok", "x", broken)).rejects.toMatchObject({ status: 500 });
  });
});
