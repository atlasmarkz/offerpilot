import { describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { applyFilter, EMPTY_FILTER, facets } from "./filter";
import type { Match } from "./match";

const m = (id: string, over: object = {}): Match => ({
  job: Job.parse({
    id,
    companyId: "bytedance",
    companyType: "internet",
    title: "后端开发工程师",
    kind: "fulltime",
    city: ["上海"],
    description: "负责推荐系统",
    applyUrl: "https://example.com/" + id,
    sourceUrl: "https://example.com/list",
    ...over,
  }),
  score: 0,
  unknown: [],
});

const data = [
  m("a"),
  m("b", { companyId: "tencent", title: "算法工程师", city: ["深圳", "北京"] }),
  m("c", { companyId: "meituan", title: "前端开发", city: ["北京"], description: "React 体系" }),
];
const none = new Set<string>();

describe("applyFilter", () => {
  it("returns everything for an empty filter", () => {
    expect(applyFilter(data, EMPTY_FILTER, none)).toHaveLength(3);
  });

  it("requires every keyword and searches company display names", () => {
    expect(applyFilter(data, { ...EMPTY_FILTER, query: "工程师 腾讯" }, none).map((x) => x.job.id)).toEqual(["b"]);
    expect(applyFilter(data, { ...EMPTY_FILTER, query: "react" }, none).map((x) => x.job.id)).toEqual(["c"]);
  });

  it("ORs within a group and ANDs across groups", () => {
    const byCity = applyFilter(data, { ...EMPTY_FILTER, cities: ["北京", "上海"] }, none);
    expect(byCity.map((x) => x.job.id)).toEqual(["a", "b", "c"]);
    const both = applyFilter(data, { ...EMPTY_FILTER, cities: ["北京"], companies: ["meituan", "bytedance"] }, none);
    expect(both.map((x) => x.job.id)).toEqual(["c"]);
  });

  it("can show only selected jobs", () => {
    expect(applyFilter(data, { ...EMPTY_FILTER, onlySelected: true }, new Set(["b"])).map((x) => x.job.id)).toEqual(["b"]);
  });
});

describe("facets", () => {
  it("counts values, most frequent first", () => {
    expect(facets(data, (x) => x.job.city)).toEqual([
      { value: "北京", count: 2 },
      { value: "上海", count: 1 },
      { value: "深圳", count: 1 },
    ]);
  });
});
