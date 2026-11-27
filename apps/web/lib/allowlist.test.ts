import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowlist } from "./allowlist";

describe("Google sign-up allowlist", () => {
  const list = parseAllowlist(" Me@Gmail.com, friend@example.com\n@student.chula.ac.th  junk ");

  it("parses emails and @domains, ignoring junk", () => {
    expect(list).toEqual(["me@gmail.com", "friend@example.com", "@student.chula.ac.th"]);
  });

  it("matches exact emails case-insensitively", () => {
    expect(isEmailAllowed("ME@gmail.COM", list)).toBe(true);
    expect(isEmailAllowed("other@gmail.com", list)).toBe(false);
  });

  it("matches whole domains, but not look-alike domains", () => {
    expect(isEmailAllowed("6630000021@student.chula.ac.th", list)).toBe(true);
    expect(isEmailAllowed("x@evil-student.chula.ac.th", list)).toBe(false);
    expect(isEmailAllowed("x@student.chula.ac.th.evil.com", list)).toBe(false);
  });

  it("rejects empty input and an empty list", () => {
    expect(isEmailAllowed(null, list)).toBe(false);
    expect(isEmailAllowed("not-an-email", list)).toBe(false);
    expect(isEmailAllowed("me@gmail.com", [])).toBe(false);
  });
});
