import { describe, expect, it } from "vitest";
import { normalizeDraft } from "./resume";

describe("normalizeDraft", () => {
  it("accepts a well-formed answer", () => {
    const d = normalizeDraft({
      school: " 某大学 ",
      schoolTags: ["985", "C9"],
      major: "计算机科学与技术",
      degree: "硕士",
      graduationYear: "2027",
      cities: ["上海市", "杭州"],
      targetRoles: ["后端"],
      experiences: [{ kind: "internship", title: "后端实习", bullets: ["做了X"] }],
    });
    expect(d).toMatchObject({
      school: "某大学",
      schoolTags: ["985"], // 不在白名单里的标签丢掉
      degree: "master",
      graduationYear: 2027,
      cities: ["上海", "杭州"],
    });
    expect(d.experiences).toHaveLength(1);
  });

  it("drops bad fields instead of failing", () => {
    const d = normalizeDraft({
      degree: "高中",
      graduationYear: 1999,
      cities: "上海",
      experiences: [{ kind: "nonsense" }, "x", { kind: "award", title: "奖", bullets: [] }],
    });
    expect(d.degree).toBeUndefined();
    expect(d.graduationYear).toBeUndefined();
    expect(d.cities).toEqual([]);
    expect(d.experiences.map((e) => e.title)).toEqual(["奖"]);
  });

  it("tolerates garbage input", () => {
    expect(normalizeDraft(null).schoolTags).toEqual([]);
    expect(normalizeDraft("oops").experiences).toEqual([]);
  });
});
