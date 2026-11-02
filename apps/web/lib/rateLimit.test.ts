import { describe, expect, it } from "vitest";
import { createLimiter } from "./rateLimit";

describe("createLimiter", () => {
  const day1 = new Date("2026-11-02T10:00:00Z");
  const day2 = new Date("2026-11-03T10:00:00Z");

  it("limits per IP", () => {
    const l = createLimiter(2, 100);
    expect(l.check("a", day1)).toBeUndefined();
    expect(l.check("a", day1)).toBeUndefined();
    expect(l.check("a", day1)).toMatch(/上限/);
    expect(l.check("b", day1)).toBeUndefined();
  });

  it("limits the whole site per day", () => {
    const l = createLimiter(10, 2);
    l.check("a", day1);
    l.check("b", day1);
    expect(l.check("c", day1)).toMatch(/额度/);
  });

  it("resets on a new day", () => {
    const l = createLimiter(1, 1);
    l.check("a", day1);
    expect(l.check("a", day1)).toBeDefined();
    expect(l.check("a", day2)).toBeUndefined();
  });
});
