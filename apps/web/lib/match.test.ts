import { describe, expect, it } from "vitest";
import { Job, Profile } from "@offerpilot/shared";
import { matchJobs } from "./match";

const profile = Profile.parse({
  name: "测试",
  school: "某大学",
  major: "计算机科学与技术",
  degree: "master",
  graduationYear: 2027,
  cities: ["上海"],
  targetRoles: ["后端"],
  targetCompanyTypes: ["internet"],
});

const job = (over: object = {}) =>
  Job.parse({
    id: "1",
    companyId: "c",
    companyType: "internet",
    title: "后端开发工程师",
    kind: "fulltime",
    city: ["上海"],
    applyUrl: "https://example.com/1",
    sourceUrl: "https://example.com/list",
    ...over,
  });

describe("matchJobs", () => {
  const opts = { kind: "fulltime" as const, includeUnreviewed: true, today: new Date("2026-11-01") };

  it("filters by hard requirements and counts the reasons", () => {
    const jobs = [
      job({ id: "ok" }),
      job({ id: "year", requirements: { graduationYears: [2026] } }),
      job({ id: "deg", requirements: { minDegree: "phd" } }),
      job({ id: "intern", kind: "intern" }),
    ];
    const r = matchJobs(profile, jobs, opts);
    expect(r.matches.map((m) => m.job.id)).toEqual(["ok"]);
    expect(r.rejected).toEqual({ 毕业届别不符: 1, 学历不满足: 1 });
  });

  it("hides unreviewed jobs unless asked to include them", () => {
    expect(matchJobs(profile, [job()], { ...opts, includeUnreviewed: false }).matches).toHaveLength(0);
    expect(matchJobs(profile, [job()], opts).matches).toHaveLength(1);
  });

  it("ranks target roles first and reports unrecognised conditions", () => {
    const r = matchJobs(profile, [job({ id: "a", title: "前端开发" }), job({ id: "b" })], opts);
    expect(r.matches.map((m) => m.job.id)).toEqual(["b", "a"]);
    expect(r.matches[0]!.unknown).toEqual(["学历", "届别", "专业"]);
  });
});
