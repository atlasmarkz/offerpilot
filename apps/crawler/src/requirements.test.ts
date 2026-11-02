import { describe, expect, it } from "vitest";
import { extractGraduationYears, extractMajors, extractMinDegree, extractRequirements } from "./requirements";

describe("extractGraduationYears", () => {
  it("reads 届 and graduation ranges", () => {
    expect(extractGraduationYears("面向2027届毕业生")).toEqual([2027]);
    expect(extractGraduationYears("2026年9月-2027年8月期间毕业的同学")).toEqual([2027]);
    expect(extractGraduationYears("2026届、2027届均可")).toEqual([2026, 2027]);
    expect(extractGraduationYears("2026年10月1日至2027年9月30日期间毕业，统招大专及以上")).toEqual([2027]);
  });
  it("ignores unrelated years", () => {
    expect(extractGraduationYears("公司成立于2010年，2099届")).toEqual([]);
  });
});

describe("extractMinDegree", () => {
  it("takes the lowest stated degree", () => {
    expect(extractMinDegree("本科及以上学历")).toBe("bachelor");
    expect(extractMinDegree("硕士及以上，博士优先")).toBe("master");
    expect(extractMinDegree("2027届本科及以上；硕士以上优先")).toBe("bachelor");
  });
  it("returns undefined when not stated", () => {
    expect(extractMinDegree("热爱编程，学习能力强")).toBeUndefined();
  });
});

describe("extractMajors", () => {
  it("splits a real major list", () => {
    expect(extractMajors("计算机、软件工程、数学等相关专业")).toEqual(["计算机", "软件工程", "数学"]);
    expect(extractMajors("2027届本科，电子信息、自动化相关专业优先")).toEqual(["电子信息", "自动化"]);
  });
  it("keeps 及其 names intact", () => {
    expect(extractMajors("电气工程及其自动化、计算机等相关专业")).toEqual(["电气工程及其自动化", "计算机"]);
  });
  it("returns nothing for noise sentences", () => {
    expect(extractMajors("具有积极的工作态度，高度的诚信，等相关能力")).toEqual([]);
    expect(extractMajors("成为家庭用户购车的顾问，向用户介绍产品并提供购车的专业建议")).toEqual([]);
  });
  it("respects 专业不限", () => {
    expect(extractMajors("计算机相关专业优先，专业不限")).toEqual([]);
  });
});

describe("extractRequirements", () => {
  it("combines all fields", () => {
    const r = extractRequirements("2027届硕士及以上，计算机、人工智能等相关专业，985/211优先");
    expect(r.graduationYears).toEqual([2027]);
    expect(r.minDegree).toBe("master");
    expect(r.schoolTags).toEqual(["985", "211"]);
    expect(r.majors).toContain("计算机");
  });
});
