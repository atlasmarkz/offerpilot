import { describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { mapFeishuPost, type FeishuPost } from "./feishu";
import { mapBilibiliPosition } from "./bilibili";
import { mapMihoyoJob } from "./mihoyo";
import { mapNeteaseJob } from "./netease";
import { mapXiaohongshuPosition } from "./xiaohongshu";
import { mapTencentPosition, type TencentPosition } from "./tencent";

const common = {
  id: "j",
  companyId: "c",
  companyType: "internet" as const,
  sourceUrl: "https://example.com/list",
  reviewStatus: "pending" as const,
};

describe("mapFeishuPost", () => {
  const post: FeishuPost = {
    id: "123",
    title: " 客户端开发实习生 ",
    description: "ByteIntern：面向2027届毕业生（2026年9月-2027年8月期间毕业）",
    requirement: "1、本科及以上学历在读，计算机、软件工程、数学等相关专业优先；",
    city_list: [{ name: "深圳" }, { name: "北京" }, { name: "深圳" }],
    recruit_type: { name: "实习" },
  };

  it("maps structured fields and extracts hard requirements", () => {
    const m = mapFeishuPost(post, "https://jobs.example.com/campus/position/123/detail");
    expect(m).toMatchObject({
      title: "客户端开发实习生",
      kind: "intern",
      city: ["深圳", "北京"],
      applyUrl: "https://jobs.example.com/campus/position/123/detail",
    });
    expect(m.requirements).toMatchObject({
      minDegree: "bachelor",
      graduationYears: [2027],
      majors: ["计算机", "软件工程", "数学"],
    });
  });

  it("produces a schema-valid Job", () => {
    const m = mapFeishuPost(post, "https://jobs.example.com/campus/position/123/detail");
    expect(Job.safeParse({ ...m, ...common }).success).toBe(true);
  });

  it("falls back to city_info and fulltime", () => {
    const m = mapFeishuPost(
      { id: "1", title: "算法工程师", city_info: { name: "上海" }, recruit_type: { name: "正式" } },
      "https://x.example.com/1",
    );
    expect(m).toMatchObject({ kind: "fulltime", city: ["上海"] });
  });
});

describe("mapTencentPosition", () => {
  const p: TencentPosition = {
    id: 22444,
    postId: "1282707398326592512",
    positionTitle: "AI全栈工程师",
    workCities: "深圳总部 北京 上海 ",
    projectName: "应届毕业生",
    recruitLabelName: "应届毕业生",
  };

  it("builds detail url, cities and default graduation year", () => {
    const m = mapTencentPosition(p, { defaultGraduationYears: [2027] });
    expect(m).toMatchObject({
      kind: "fulltime",
      city: ["深圳", "北京", "上海"],
      applyUrl: "https://join.qq.com/post_detail.html?postid=1282707398326592512",
      requirements: { graduationYears: [2027] },
    });
    expect(Job.safeParse({ ...m, ...common }).success).toBe(true);
  });

  it("detects interns", () => {
    expect(mapTencentPosition({ ...p, recruitLabelName: "日常实习" }, { defaultGraduationYears: [] }).kind).toBe("intern");
  });
});

describe("bilibili / netease / xiaohongshu / mihoyo mappers", () => {
  const valid = (m: Record<string, unknown>) => Job.safeParse({ ...m, ...common }).success;

  it("bilibili: reads requirements after 工作要求 and marks interns", () => {
    const m = mapBilibiliPosition(
      {
        id: 31131,
        positionName: "数据分析实习生",
        positionTypeName: "实习",
        workLocation: "上海",
        positionDescription: "工作职责:\n1.做分析\n工作要求:\n1.本科及以上学历在读，计算机、统计学等相关专业",
      },
      { defaultGraduationYears: [] },
    );
    expect(m).toMatchObject({ kind: "intern", city: ["上海"], applyUrl: "https://jobs.bilibili.com/campus/positions/31131" });
    expect((m.requirements as { minDegree?: string }).minDegree).toBe("bachelor");
    expect(valid(m)).toBe(true);
  });

  it("netease: splits cities, gives each job a unique link, falls back to default year", () => {
    const cfg = { url: "https://campus.163.com/app/job/position?id=103", defaultKind: "fulltime" as const, defaultGraduationYears: [2027] };
    const m = mapNeteaseJob({ id: 4839, positionName: "后端开发", workPlaceName: "杭州,上海" }, cfg);
    expect(m).toMatchObject({ kind: "fulltime", city: ["杭州", "上海"], applyUrl: `${cfg.url}#job-4839` });
    expect((m.requirements as { graduationYears: number[] }).graduationYears).toEqual([2027]);
    expect(valid(m)).toBe(true);
  });

  it("xiaohongshu: strips 市 from cities and builds the detail link", () => {
    const m = mapXiaohongshuPosition(
      { positionId: 22002, positionName: "【2027校招】算法工程师", workplace: "上海市，杭州市", qualification: "1、硕士及以上学历" },
      { defaultGraduationYears: [2027] },
    );
    expect(m).toMatchObject({ city: ["上海", "杭州"], applyUrl: "https://job.xiaohongshu.com/campus/position/22002" });
    expect((m.requirements as { graduationYears: number[] }).graduationYears).toEqual([2027]);
    expect(valid(m)).toBe(true);
  });

  it("mihoyo: open-ended graduation ranges are not treated as a single year", () => {
    const cfg = { defaultGraduationYears: [] };
    const fixed = mapMihoyoJob({ id: "1", title: "模型师", jobNature: "全职", objectName: "2027届（2026.9-2027.8之间毕业）" }, cfg);
    const open = mapMihoyoJob({ id: "2", title: "运营实习", jobNature: "实习", objectName: "2027届及之后毕业的在校生" }, cfg);
    expect((fixed.requirements as { graduationYears: number[] }).graduationYears).toEqual([2027]);
    expect((open.requirements as { graduationYears: number[] }).graduationYears).toEqual([]);
    expect(open.kind).toBe("intern");
    expect(valid(fixed)).toBe(true);
  });
});
