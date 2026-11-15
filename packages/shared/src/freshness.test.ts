import { describe, expect, it } from "vitest";
import { guessPostedAt, jobDate, planFreshness, toDay, type FreshnessRow } from "./freshness";

const row = (id: string, o: Partial<FreshnessRow> = {}): FreshnessRow => ({ id, source: "s", status: "open", missCount: 0, ...o });

describe("planFreshness", () => {
  it("counts a miss once, closes on the second consecutive miss", () => {
    const rows = [row("a"), row("b"), row("c", { missCount: 1 })];
    expect(planFreshness(rows, [{ id: "s", complete: true, ids: ["a"] }])).toEqual({
      miss: [{ id: "b", missCount: 1 }],
      close: [{ id: "c", missCount: 2 }],
      reopen: [],
    });
  });

  it("does not close a job seen less than a day ago, even after two misses (manual reruns)", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const rows = [row("a", { missCount: 1, lastSeenAt: "2026-11-15T03:00:00Z" }), row("b", { missCount: 1, lastSeenAt: "2026-11-14T03:00:00Z" })];
    expect(planFreshness(rows, [{ id: "s", complete: true, ids: [] }], 2, now)).toEqual({
      miss: [{ id: "a", missCount: 2 }],
      close: [{ id: "b", missCount: 2 }],
      reopen: [],
    });
  });

  it("never closes jobs of a source that was cut off, failed, or is unknown", () => {
    const rows = [row("a"), row("b", { source: "other" }), row("c", { source: null })];
    expect(planFreshness(rows, [{ id: "s", complete: false, ids: [] }])).toEqual({ miss: [], close: [], reopen: [] });
  });

  it("reopens a closed job that shows up again, and leaves closed ones alone otherwise", () => {
    const rows = [row("a", { status: "closed", missCount: 2 }), row("b", { status: "closed", missCount: 2 })];
    expect(planFreshness(rows, [{ id: "s", complete: true, ids: ["a"] }])).toEqual({ miss: [], close: [], reopen: ["a"] });
  });

  it("treats a job seen under any source as seen", () => {
    expect(planFreshness([row("a")], [{ id: "s", complete: true, ids: [] }, { id: "t", complete: false, ids: ["a"] }]).miss).toEqual([]);
  });
});

describe("toDay / guessPostedAt", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  it("reads timestamps and date strings in Beijing time", () => {
    expect(toDay(1794700000000, now)).toBe("2026-11-15"); // UTC 11-14 23:46 = 北京 11-15
    expect(toDay(1794700000, now)).toBe("2026-11-15");
    expect(toDay("1794700000000", now)).toBe("2026-11-15");
    expect(toDay("2026-11-12 10:00:00", now)).toBe("2026-11-12");
    expect(toDay("2026/9/1", now)).toBe("2026-09-01");
    expect(toDay("2026年11月3日", now)).toBe("2026-11-03");
  });
  it("rejects nonsense and future dates", () => {
    expect(toDay("面议", now)).toBeUndefined();
    expect(toDay(0, now)).toBeUndefined();
    expect(toDay("2010-01-01", now)).toBeUndefined();
    expect(toDay("2027-06-01", now)).toBeUndefined();
  });
  it("prefers publish time over update time", () => {
    expect(guessPostedAt({ updateTime: "2026-11-14", publishTime: "2026-10-01" }, now)).toBe("2026-10-01");
    expect(guessPostedAt({ updateTime: "2026-11-14", refreshTime: "2026-11-15" }, now)).toBeUndefined(); // 刷新时间不是发布日期
    expect(guessPostedAt({ name: "x" }, now)).toBeUndefined();
  });
});

describe("jobDate", () => {
  it("uses the posted date, else the first-seen date", () => {
    expect(jobDate({ postedAt: "2026-11-01", firstSeenAt: "2026-11-10T00:00:00Z" })).toEqual({ date: "2026-11-01", kind: "posted" });
    expect(jobDate({ firstSeenAt: "2026-11-10T03:00:00Z" })).toEqual({ date: "2026-11-10", kind: "seen" });
    expect(jobDate({ firstSeenAt: "2026-11-09T19:00:00Z" })).toEqual({ date: "2026-11-10", kind: "seen" }); // 北京时间凌晨 3 点
    expect(jobDate({})).toEqual({ kind: "none" });
  });
});
