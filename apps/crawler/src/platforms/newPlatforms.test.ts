import { describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { graduationYearsOf, mapAlibabaPosition } from "./alibaba";
import { mapOppoPosition } from "./oppo";
import { mapPddPosition } from "./pdd";

const common = { id: "j", companyId: "c", companyType: "internet" as const, sourceUrl: "https://example.com/list", reviewStatus: "pending" as const };

describe("mapAlibabaPosition", () => {
  const p = {
    id: 199907740040,
    name: "AI应用算法工程师",
    status: "recruit",
    requirement: "计算机、数学等相关专业硕士/博士优先，优秀本科生不受限制",
    description: "将大模型能力做成可上线的产品",
    workLocations: ["北京", "杭州"],
    graduationTime: { from: 1793491200000, to: 1824940800000 }, // 2026-11 ~ 2027-10
  };
  it("maps fields, detail url and graduation year from the time range", () => {
    const j = mapAlibabaPosition(p);
    expect(j).toMatchObject({ title: "AI应用算法工程师", kind: "fulltime", city: ["北京", "杭州"], applyUrl: "https://campus-talent.alibaba.com/campus/position/199907740040" });
    expect(j.requirements.graduationYears).toEqual([2027]);
    expect(Job.safeParse({ ...common, ...j }).success).toBe(true);
  });
  it("ignores missing or absurd graduation ranges", () => {
    expect(graduationYearsOf(null)).toEqual([]);
    expect(graduationYearsOf({ to: 0 })).toEqual([]);
  });
});

describe("mapPddPosition", () => {
  const p = { id: "f45d-1", name: "物流运营管培生（广东肇庆）", workLocationName: "广东肇庆", releaseTime: 1794212574000, jobDuty: "负责仓库管理", recruitTypeName: "仓储类管培生", graduationYear: "2027" };
  it("builds the detail url under the same prefix, strips the province, and uses the graduation year", () => {
    const j = mapPddPosition(p, { url: "https://careers.pddglobalhr.com/campus/grad", defaultKind: "fulltime" });
    expect(j).toMatchObject({ kind: "fulltime", city: ["肇庆"], applyUrl: "https://careers.pddglobalhr.com/campus/grad/detail?positionId=f45d-1" });
    expect(j.requirements.graduationYears).toEqual([2027]);
    expect(Job.safeParse({ ...common, ...j }).success).toBe(true);
  });
  it("marks the intern source as intern", () => {
    expect(mapPddPosition(p, { url: "https://careers.pddglobalhr.com/campus/intern", defaultKind: "intern" }).kind).toBe("intern");
  });
});

describe("mapOppoPosition", () => {
  it("reads the class year from the project name and splits cities", () => {
    const j = mapOppoPosition({
      idRecruitPosition: 1902,
      positionName: "高级射频工程师-博士",
      projectName: "2027届博士生招聘",
      positionDesc: "研究射频演进方向",
      knowledgeSkill: "通信、电子信息等相关专业",
      workCityName: "东莞市,深圳市",
      releaseTime: "2026-10-19",
    });
    expect(j).toMatchObject({ kind: "fulltime", city: ["东莞", "深圳"], applyUrl: "https://careers.oppo.com/university/oppo/campus/post/1902" });
    expect(j.requirements.graduationYears).toEqual([2027]);
    expect(Job.safeParse({ ...common, ...j }).success).toBe(true);
  });
});

describe("beisen", () => {
  it("keeps only campus / intern categories", async () => {
    const { isCampusCategory } = await import("./beisen");
    expect(["校园招聘", "实习生招聘", "青苗计划招聘", "项目实习", "【飞星计划】"].map(isCampusCategory)).toEqual([true, true, true, true, true]);
    expect(["社会招聘", "社会招聘(热招岗位）", "内部招聘", "校园大使", null].map(isCampusCategory)).toEqual([false, false, false, false, false]);
  });
  it("maps a job ad: strips the internal code, normalises cities, picks the intern detail page", async () => {
    const { mapBeisenJobAd } = await import("./beisen");
    const j = mapBeisenJobAd(
      { Id: "e8fe-1", JobAdName: "工艺工程(J14649)", Category: "实习生招聘", LocNames: ["四川省·成都市", "上海市"], Duty: "负责工艺", Require: "本科及以上学历，微电子相关专业", PostDate: "0001-01-01T00:00:00" },
      "https://ymtc.zhiye.com",
    );
    expect(j).toMatchObject({ title: "工艺工程", kind: "intern", city: ["成都", "上海"], applyUrl: "https://ymtc.zhiye.com/intern/detail?jobAdId=e8fe-1", postedAt: undefined });
    expect(j.requirements.minDegree).toBe("bachelor");
    expect(Job.safeParse({ ...common, ...j }).success).toBe(true);
  });
});
