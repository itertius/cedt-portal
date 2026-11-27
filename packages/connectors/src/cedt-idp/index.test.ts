import { afterEach, describe, expect, it, vi } from "vitest";
import { cedtIdpUrls, fetchCedtProfile, mapCedtProfile } from "./index";

afterEach(() => {
  delete process.env.CEDT_IDP_BASE_URL;
});

describe("CEDT IDP", () => {
  it("uses the real IdP endpoints, or the mock host", () => {
    expect(cedtIdpUrls()).toEqual({
      authorize: "https://cedtintern.cp.eng.chula.ac.th/oauth/authorize",
      token: "https://cedtintern.cp.eng.chula.ac.th/api/oauth/token",
      profile: "https://cedtintern.cp.eng.chula.ac.th/api/oauth/v1/profile",
    });
    process.env.CEDT_IDP_BASE_URL = "http://localhost:4360/";
    expect(cedtIdpUrls().token).toBe("http://localhost:4360/api/oauth/token");
  });

  it("maps a student profile (English name, Chula student mail, photo)", () => {
    expect(
      mapCedtProfile({
        userId: "s7sewar56a",
        userType: "CEDT_STUDENT",
        studentId: "6630000021",
        firstNameEn: "Somchai",
        lastNameEn: "Jaidee",
        firstNameTh: "สมชาย",
        lastNameTh: "ใจดี",
        profileImageUrl: "https://cedtintern.cp.eng.chula.ac.th/api/public/files/x",
      }),
    ).toEqual({
      id: "s7sewar56a",
      name: "Somchai Jaidee",
      email: "6630000021@student.chula.ac.th",
      image: "https://cedtintern.cp.eng.chula.ac.th/api/public/files/x",
      emailVerified: false,
    });
  });

  it("falls back to the Thai name and a placeholder email; rejects profiles without an id", () => {
    const p = mapCedtProfile({
      userId: "u1",
      firstNameTh: "สมหญิง",
      lastNameTh: "ใจดี",
      studentId: null,
    });
    expect(p).toMatchObject({ name: "สมหญิง ใจดี", email: "cedt-u1@cedt-idp.invalid" });
    expect(mapCedtProfile({ userId: "  " })).toBeNull();
  });

  it("fetches the profile with the bearer token", async () => {
    const ok = vi.fn(async () =>
      Response.json({ userId: "u2", firstNameEn: "A", lastNameEn: "B" }),
    ) as unknown as typeof fetch;
    expect((await fetchCedtProfile("tok", ok))?.name).toBe("A B");
    const [, init] =
      (ok as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0] ?? [];
    expect(JSON.stringify(init?.headers)).toContain("Bearer tok");
    const denied = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    expect(await fetchCedtProfile("bad", denied)).toBeNull();
  });
});
