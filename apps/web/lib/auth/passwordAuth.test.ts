import { describe, expect, it } from "vitest";
import { validatePassword } from "./passwordAuth";

describe("validatePassword", () => {
  it("accepts 8+ chars with letters and digits", () => {
    expect(validatePassword("abcd1234")).toBeUndefined();
  });
  it("rejects short, letters-only, digits-only, too long and non-strings", () => {
    expect(validatePassword("ab12")).toMatch(/8/);
    expect(validatePassword("abcdefgh")).toMatch(/字母和数字/);
    expect(validatePassword("12345678")).toMatch(/字母和数字/);
    expect(validatePassword("a1".repeat(40))).toMatch(/72/);
    expect(validatePassword(undefined)).toBeDefined();
  });
});
