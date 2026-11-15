import { describe, expect, it } from "vitest";
import { ApplyRecord, ScreenRules, hrInactive, looksOutsourced, parseSalary, renderGreeting, screenJob, type BoardJob } from "./jobBoard";

const job = (o: Partial<BoardJob> = {}): BoardJob => ({
  channel: "boss",
  externalId: "j1",
  title: "前端开发实习生",
  company: "某某科技",
  city: "北京",
  salary: "200-300元/天",
  url: "https://www.zhipin.com/job_detail/j1.html",
  ...o,
});
const rules = (o: Partial<ScreenRules> = {}) => ScreenRules.parse(o);

describe("parseSalary", () => {
  it("reads K ranges, daily pay, and Chinese units", () => {
    expect(parseSalary("15-25K·14薪")).toEqual({ monthlyK: [15, 25] });
    expect(parseSalary("200-300元/天")).toEqual({ daily: [200, 300] });
    expect(parseSalary("8千-1.2万")).toEqual({ monthlyK: [8, 12] });
    expect(parseSalary("1-1.5万")).toEqual({ monthlyK: [10, 15] });
    expect(parseSalary("面议")).toEqual({});
    expect(parseSalary(undefined)).toEqual({});
  });
});

describe("screenJob", () => {
  it("passes a job that meets every rule", () => {
    expect(screenJob(job(), rules({ titleInclude: ["前端"], cities: ["北京"], dailyMin: 150 }))).toEqual({ pass: true, reasons: [] });
  });

  it("collects every failing reason", () => {
    const r = screenJob(
      job({ title: "销售代表", company: "黑心外包公司", city: "上海", salary: "100-120元/天", hrActive: "半年前活跃" }),
      rules({ titleInclude: ["前端"], exclude: ["销售"], companyBlacklist: ["黑心"], cities: ["北京"], dailyMin: 150 }),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual(["岗位名不含关键词", "含排除词：销售", "公司在黑名单里", "疑似外包 / 派遣", "城市不符", "日薪低于下限", "HR 很久没活跃"]);
  });

  it("skips blacklisted recruiters such as headhunters", () => {
    expect(screenJob(job({ recruiter: "资深猎头顾问" }), rules({ recruiterBlacklist: ["猎头"] })).reasons).toEqual(["招聘者是资深猎头顾问"]);
    expect(screenJob(job({ recruiter: "HR" }), rules({ recruiterBlacklist: ["猎头"] })).pass).toBe(true);
  });

  it("dedupes by channel + external id", () => {
    expect(screenJob(job(), rules(), new Set(["boss:j1"])).reasons).toEqual(["已经投过"]);
    expect(screenJob(job(), rules(), new Set(["liepin:j1"])).pass).toBe(true);
  });

  it("treats unreadable salary as no limit", () => {
    expect(screenJob(job({ salary: "面议" }), rules({ monthlyMinK: 20, dailyMin: 300 })).pass).toBe(true);
  });
});

describe("looksOutsourced", () => {
  it("needs a strong word or two weak ones", () => {
    expect(looksOutsourced(job({ description: "本岗位为外包岗位" }))).toBe(true);
    expect(looksOutsourced(job({ description: "需要驻场" }))).toBe(false);
    expect(looksOutsourced(job({ description: "需要驻场，甲方为大型银行" }))).toBe(true);
  });
});

describe("hrInactive", () => {
  it("only flags clearly stale HRs", () => {
    expect(hrInactive("刚刚活跃")).toBe(false);
    expect(hrInactive("3日内活跃")).toBe(false);
    expect(hrInactive("本月活跃")).toBe(true);
    expect(hrInactive("半年前活跃")).toBe(true);
    expect(hrInactive("2年前活跃")).toBe(true);
    expect(hrInactive("今年活跃")).toBe(true);
    expect(hrInactive(undefined)).toBe(false);
  });
});

describe("renderGreeting", () => {
  it("fills variables and drops sentences whose variables are missing", () => {
    const t = "您好，我是{学校}的学生。我熟悉{技能}。希望有机会沟通！";
    expect(renderGreeting(t, { 学校: "示例大学", 技能: "React" })).toBe("您好，我是示例大学的学生。我熟悉React。希望有机会沟通！");
    expect(renderGreeting(t, { 学校: "示例大学" })).toBe("您好，我是示例大学的学生。希望有机会沟通！");
  });
  it("truncates to the limit", () => {
    expect(renderGreeting("{岗位}", { 岗位: "x".repeat(300) }, 10)).toHaveLength(10);
  });
});

describe("ApplyRecord", () => {
  it("rejects non-https links and fills defaults", () => {
    const base = { channel: "boss", external_id: "a", title: "前端", applied_at: "2026-11-15T08:00:00.000Z" };
    expect(ApplyRecord.parse(base).status).toBe("greeted");
    expect(ApplyRecord.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
  });
});
