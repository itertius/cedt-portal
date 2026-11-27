import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const SECRET = "test-secret-test-secret-test-secret";

describe("connector credential encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = encryptSecret("eyJhbGciOiJIUzI1NiJ9.payload.sig", SECRET);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("payload");
    expect(decryptSecret(sealed, SECRET)).toBe("eyJhbGciOiJIUzI1NiJ9.payload.sig");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("same", SECRET)).not.toBe(encryptSecret("same", SECRET));
  });

  it("rejects tampering, another key, and junk", () => {
    const sealed = encryptSecret("cookie=abc", SECRET);
    const parts = sealed.split(".");
    const flipped = [parts[0], parts[1], parts[2], `${parts[3]?.slice(0, -2)}AA`].join(".");
    expect(decryptSecret(flipped, SECRET)).toBeNull();
    expect(decryptSecret(sealed, "another-secret-another-secret-xx")).toBeNull();
    expect(decryptSecret("not-a-sealed-value", SECRET)).toBeNull();
  });

  it("refuses to run without a real secret", () => {
    expect(() => encryptSecret("x", "short")).toThrow("BETTER_AUTH_SECRET");
  });
});
