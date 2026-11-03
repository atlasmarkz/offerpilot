import { describe, expect, it } from "vitest";
import { billingEnabled, PRO_QUOTA, summarizeUsage, UNIT_COST } from "./billing/billing";
import { normalizeResume, resumeToText, withinSize } from "./resumeData";
import { draftToResume, isBlankResume } from "./resumeLocal";
import { normalizeSuggestions } from "./suggest";

describe("normalizeResume", () => {
  it("keeps good sections and drops bad ones", () => {
    const r = normalizeResume({
      contact: { name: "张三", phone: "138", links: ["a", "b"] },
      summary: "x".repeat(900),
      education: [{ school: "浙大", highlights: ["奖学金"] }, "bad", { school: 5 }],
      experiences: [{ kind: "internship", title: "后端", bullets: ["做了X"] }, { kind: "nope" }],
      skills: ["Go", 3, "Redis"],
    });
    expect(r.contact.name).toBe("张三");
    expect(r.summary).toHaveLength(500);
    expect(r.education.map((e) => e.school)).toEqual(["浙大"]);
    expect(r.experiences).toHaveLength(1);
    expect(r.skills).toEqual(["Go", "Redis"]);
  });
  it("survives garbage and bounds the size", () => {
    expect(isBlankResume(normalizeResume(null))).toBe(true);
    expect(isBlankResume(normalizeResume("x"))).toBe(true);
    const big = normalizeResume({ experiences: Array.from({ length: 50 }, () => ({ kind: "project", title: "t", bullets: ["b".repeat(5000)] })) });
    expect(big.experiences.length).toBeLessThanOrEqual(20);
    expect(typeof withinSize(big)).toBe("boolean");
  });
});

describe("resumeToText", () => {
  it("never includes contact details", () => {
    const r = normalizeResume({
      contact: { name: "张三", phone: "13800000000", email: "z@x.com", city: "上海", links: ["github.com/z"] },
      education: [{ school: "浙江大学", major: "计算机" }],
      experiences: [{ kind: "internship", title: "后端实习", org: "某公司", bullets: ["做了缓存"] }],
    });
    const t = resumeToText(r);
    expect(t).toContain("浙江大学");
    expect(t).toContain("做了缓存");
    for (const secret of ["张三", "13800000000", "z@x.com", "github.com/z", "上海"]) expect(t).not.toContain(secret);
  });
});

describe("draftToResume", () => {
  it("builds an education row from the basic fields when the model gave none", () => {
    const r = draftToResume({
      school: "浙大",
      major: "软工",
      degree: "master",
      schoolTags: [],
      cities: [],
      targetRoles: [],
      experiences: [],
      education: [],
      skills: ["Go"],
      summary: "",
    });
    expect(r.education[0]).toMatchObject({ school: "浙大", major: "软工", degree: "硕士" });
    expect(r.skills).toEqual(["Go"]);
  });
});

describe("normalizeSuggestions", () => {
  it("drops incomplete items and clamps fields", () => {
    const s = normalizeSuggestions({
      overall: "不错",
      items: [
        { section: "实习", level: "high", problem: "没有数字", suggestion: "补充结果", rewrite: "把延迟降低了【请补充：xx%】" },
        { problem: "只有问题" },
        { section: "技能", level: "weird", problem: "太散", suggestion: "分组" },
      ],
    });
    expect(s.items).toHaveLength(2);
    expect(s.items[1]!.level).toBe("medium");
    expect(normalizeSuggestions("oops").items).toEqual([]);
  });
});

describe("billing helpers", () => {
  it("only enables billing when explicitly turned on and fully configured", () => {
    expect(billingEnabled({ BILLING_ENABLED: "1", SUPABASE_URL: "u", SUPABASE_SERVICE_KEY: "k" })).toBe(true);
    expect(billingEnabled({ SUPABASE_URL: "u", SUPABASE_SERVICE_KEY: "k" })).toBe(false);
    expect(billingEnabled({ BILLING_ENABLED: "1", SUPABASE_URL: "u" })).toBe(false);
  });
  it("treats an expired subscription as free and never returns negative numbers", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(summarizeUsage({ plan: "pro", quota: PRO_QUOTA, used: 30, period_end: "2026-12-01T00:00:00Z" }, 5, now)).toMatchObject({
      plan: "pro",
      remaining: 70,
      credits: 5,
    });
    expect(summarizeUsage({ plan: "pro", quota: 100, used: 30, period_end: "2026-11-01T00:00:00Z" }, 2, now)).toMatchObject({
      plan: "free",
      quota: 3,
      remaining: 3,
      credits: 2,
    });
    expect(summarizeUsage({ plan: "pro", quota: 10, used: 99, period_end: "2027-01-01T00:00:00Z" }, -4, now)).toMatchObject({ remaining: 0, credits: 0 });
    expect(summarizeUsage(undefined, undefined, now)).toMatchObject({ plan: "free", credits: 0 });
  });
  it("has a positive cost for every feature", () => {
    for (const c of Object.values(UNIT_COST)) expect(c).toBeGreaterThan(0);
  });
});
