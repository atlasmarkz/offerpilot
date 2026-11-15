import { describe, expect, it } from "vitest";
import { ageDays, dateLabel, sourceLabel } from "./jobMeta";

const now = new Date("2026-11-15T04:00:00Z"); // 北京时间 11-15 中午

describe("dateLabel", () => {
  it("says posted vs first seen, relative for the last week", () => {
    expect(dateLabel({ postedAt: "2026-11-15" }, now)).toBe("今天发布");
    expect(dateLabel({ postedAt: "2026-11-14" }, now)).toBe("昨天发布");
    expect(dateLabel({ postedAt: "2026-11-12" }, now)).toBe("3 天前发布");
    expect(dateLabel({ postedAt: "2026-10-02" }, now)).toBe("10-02 发布");
    expect(dateLabel({ postedAt: "2025-12-30" }, now)).toBe("2025-12-30 发布");
    expect(dateLabel({ firstSeenAt: "2026-11-01T02:00:00Z" }, now)).toBe("11-01 收录");
    expect(dateLabel({}, now)).toBeUndefined();
  });
  it("computes age in Beijing days", () => {
    expect(ageDays({ firstSeenAt: "2026-11-14T19:00:00Z" }, now)).toBe(0); // UTC 14 日晚 = 北京 15 日
    expect(ageDays({}, now)).toBeUndefined();
  });
});

describe("sourceLabel", () => {
  it("names the company site and its host", () => {
    expect(sourceLabel({ companyId: "meituan", sourceUrl: "https://zhaopin.meituan.com/web/position?hiringType=1" })).toEqual({
      name: "美团招聘官网",
      host: "zhaopin.meituan.com",
    });
  });
});
