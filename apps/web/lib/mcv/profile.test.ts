import { describe, expect, it, vi } from "vitest";
import { fetchMcvProfile, MCV_URLS, mapMcvProfile } from "./profile";

describe("mapMcvProfile", () => {
  it("maps the users/me shape", () => {
    expect(
      mapMcvProfile({ user: { id: 12345, firstname_en: "Somchai", lastname_en: "Jaidee" } }),
    ).toEqual({
      id: "12345",
      name: "Somchai Jaidee",
      email: "mcv-12345@mcv.invalid",
      emailVerified: false,
    });
  });

  it("maps the legacy get/user/info shape", () => {
    const info = mapMcvProfile({
      data: { student: { id: "6530000021", firstname_th: "สมชาย", lastname_th: "ใจดี" } },
    });
    expect(info?.id).toBe("6530000021");
    expect(info?.name).toBe("สมชาย ใจดี");
  });

  it("keeps a real email but never marks it verified", () => {
    const info = mapMcvProfile({ user: { id: "1", email: " A@Student.Chula.ac.th " } });
    expect(info?.email).toBe("a@student.chula.ac.th");
    expect(info?.emailVerified).toBe(false);
  });

  it("falls back to a generic name", () => {
    expect(mapMcvProfile({ user: { id: "7" } })?.name).toBe("MCV user 7");
  });

  it("rejects profiles without an id", () => {
    expect(mapMcvProfile({})).toBeNull();
    expect(mapMcvProfile({ user: { firstname_en: "No Id" } })).toBeNull();
    expect(mapMcvProfile({ user: { id: "  " } })).toBeNull();
  });
});

describe("fetchMcvProfile", () => {
  it("sends the bearer token and maps the body", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ user: { id: 9, firstname_en: "A", lastname_en: "B" } }),
    );
    const info = await fetchMcvProfile("tok", fetchImpl as unknown as typeof fetch);
    expect(info?.name).toBe("A B");
    expect(fetchImpl).toHaveBeenCalledWith(
      MCV_URLS.me,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("returns null when MCV rejects the token", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(await fetchMcvProfile("bad", fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
