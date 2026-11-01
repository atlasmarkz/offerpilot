import { describe, expect, it } from "vitest";
import { hardFilter } from "./hardFilter";
import { Job, Profile } from "./schema";

const profile = Profile.parse({
  name: "测试",
  school: "某大学",
  schoolTags: ["985"],
  major: "计算机科学与技术",
  degree: "master",
  graduationYear: 2027,
  cities: ["北京", "上海"],
});

const baseJob = (over: object = {}) =>
  Job.parse({
    id: "j1",
    companyId: "c1",
    companyType: "soe",
    title: "软件开发",
    kind: "fulltime",
    city: ["北京"],
    applyUrl: "https://example.com/apply",
    sourceUrl: "https://example.com/post",
    reviewStatus: "approved",
    ...over,
  });

describe("hardFilter", () => {
  const today = new Date("2026-11-01");

  it("passes a matching job", () => {
    expect(hardFilter(profile, baseJob(), today).pass).toBe(true);
  });

  it("rejects unapproved jobs", () => {
    const r = hardFilter(profile, baseJob({ reviewStatus: "pending" }), today);
    expect(r.pass).toBe(false);
  });

  it("rejects wrong graduation year and expired deadline", () => {
    const r = hardFilter(
      profile,
      baseJob({ requirements: { graduationYears: [2026] }, deadline: "2026-10-01" }),
      today,
    );
    expect(r.reasons).toEqual(["已过截止日期", "毕业届别不符"]);
  });

  it("requires political status when the job restricts it", () => {
    const r = hardFilter(profile, baseJob({ requirements: { politicalStatus: ["中共党员"] } }), today);
    expect(r.pass).toBe(false);
  });
});
