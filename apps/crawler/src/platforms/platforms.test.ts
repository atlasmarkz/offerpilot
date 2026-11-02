import { describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { mapFeishuPost, type FeishuPost } from "./feishu";
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
