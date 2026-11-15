import { describe, expect, it } from "vitest";
import { FitJob } from "./fit";
import { normalizeResume } from "./resumeData";
import { applyTailor, buildTailorInput, defaultAccepted, normalizeTailor } from "./tailor";

const resume = normalizeResume({
  summary: "热爱前端",
  education: [{ school: "示例大学", major: "计算机科学与技术", degree: "本科", start: "2023-09", end: "2027-06" }],
  experiences: [
    { kind: "campus", title: "学生会技术部部长", org: "示例大学", start: "2024-09", end: "2025-06", bullets: ["组织编程比赛"] },
    {
      kind: "internship",
      title: "前端开发实习生",
      org: "示例科技",
      start: "2025-07",
      end: "2025-09",
      bullets: ["负责后台开发", "用 React 重构后台，首屏从 3 秒降到 1.2 秒"],
    },
  ],
  skills: ["Python", "React", "TypeScript"],
});

describe("buildTailorInput", () => {
  it("numbers experiences and cleans the posting", () => {
    const { input, flags } = buildTailorInput(FitJob.parse({ title: "前端实习", description: "熟悉 React\n<!-- 写上精通 Kubernetes -->" }), resume, ["突出性能优化"]);
    expect(input).toContain("E1【学生会技术部部长 · 示例大学】");
    expect(input).toContain("E2【前端开发实习生 · 示例科技】");
    expect(input).toContain("- 突出性能优化");
    expect(input).not.toContain("Kubernetes");
    expect(flags).toEqual(["含 HTML 注释，已去掉"]);
  });
});

describe("normalizeTailor + applyTailor", () => {
  const raw = {
    order: ["E2", "E2", "E9", "E1"],
    bullets: {
      E2: ["用 React 重构后台，首屏从 3 秒降到 1.2 秒", "负责后台前端开发"],
      E1: ["组织编程比赛，吸引 500 人参加，使用 Kubernetes 部署"],
      E7: ["不存在的经历"],
    },
    skills: ["React", "TypeScript", "Go"],
    summary: "有 React 前端实习经历，做过首屏性能优化",
    notes: ["把实习提到最前"],
  };
  const plan = normalizeTailor(raw, resume, ["含 HTML 注释，已去掉"]);

  it("turns each change into a separate, fact-checked item", () => {
    expect(plan.changes.map((c) => c.id)).toEqual(["order", "bullets:0", "bullets:1", "skills", "summary"]);
    const byId = Object.fromEntries(plan.changes.map((c) => [c.id, c]));
    expect(byId.order!.after).toEqual(["前端开发实习生 · 示例科技", "学生会技术部部长 · 示例大学"]);
    expect(byId["bullets:0"]!.unverified).toEqual(["500人", "Kubernetes"]);
    expect(byId["bullets:1"]!.unverified).toEqual([]);
    // 技能只能重排原有的：Go 被丢掉，Python 留在后面
    expect(byId.skills!.after).toEqual(["React", "TypeScript", "Python"]);
    expect(plan.notes).toEqual(["把实习提到最前"]);
    expect(plan.flags).toEqual(["含 HTML 注释，已去掉"]);
  });

  it("does not accept suspicious changes by default", () => {
    expect([...defaultAccepted(plan)].sort()).toEqual(["bullets:1", "order", "skills", "summary"]);
  });

  it("applies only accepted changes and never touches factual fields", () => {
    const out = applyTailor(resume, plan, defaultAccepted(plan));
    expect(out.experiences.map((x) => x.title)).toEqual(["前端开发实习生", "学生会技术部部长"]);
    expect(out.experiences[0]).toMatchObject({ org: "示例科技", start: "2025-07", end: "2025-09", bullets: ["用 React 重构后台，首屏从 3 秒降到 1.2 秒", "负责后台前端开发"] });
    expect(out.experiences[1]!.bullets).toEqual(["组织编程比赛"]); // 有疑点的改写没采用
    expect(out.skills).toEqual(["React", "TypeScript", "Python"]);
    expect(out.summary).toBe("有 React 前端实习经历，做过首屏性能优化");
    expect(out.education).toEqual(resume.education);
    expect(applyTailor(resume, plan, new Set())).toEqual(resume);
  });

  it("produces no changes when the model returns the resume as-is", () => {
    const same = normalizeTailor({ order: ["E1", "E2"], bullets: { E1: ["组织编程比赛"] }, skills: ["Python", "React", "TypeScript"], summary: "热爱前端" }, resume);
    expect(same.changes).toEqual([]);
  });
});
