import { describe, expect, it } from "vitest";
import { mcvLinks } from "./mcv/api";
import { PLATFORMS } from "./platforms";

describe("PLATFORMS", () => {
  it("has unique ids and https URLs", () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLATFORMS) expect(new URL(p.url).protocol).toBe("https:");
  });

  it("lists every CEDT platform from the plan", () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual([
      "mcv",
      "grader",
      "talent",
      "intern",
      "nisitez",
      "ices",
    ]);
  });

  it("uses the same MCV link as the connector", () => {
    expect(PLATFORMS.find((p) => p.id === "mcv")?.url).toBe(mcvLinks.courses);
  });
});
