import { describe, expect, it } from "vitest";
import { EMPTY_FORM, isBlankForm, sanitizeForm } from "./profileForm";

describe("sanitizeForm", () => {
  it("keeps good fields and defaults bad ones", () => {
    const f = sanitizeForm({
      school: "浙大",
      schoolTags: ["985", "C9", 5],
      degree: "master",
      graduationYear: "2026",
      cities: ["上海"],
      targetCompanyTypes: ["internet", "bogus"],
      experiences: [{ kind: "award", title: "奖", bullets: [] }, { kind: "x" }],
    });
    expect(f).toMatchObject({ school: "浙大", schoolTags: ["985"], degree: "master", graduationYear: 2026, cities: "", targetCompanyTypes: ["internet"] });
    expect(f.experiences).toHaveLength(1);
  });
  it("survives garbage", () => {
    expect(sanitizeForm(null)).toEqual(EMPTY_FORM);
    expect(sanitizeForm("x")).toEqual(EMPTY_FORM);
    expect(sanitizeForm({ graduationYear: 1900, degree: "高中" })).toEqual(EMPTY_FORM);
  });
});

describe("isBlankForm", () => {
  it("is true only for an untouched form", () => {
    expect(isBlankForm(EMPTY_FORM)).toBe(true);
    expect(isBlankForm({ ...EMPTY_FORM, school: "x" })).toBe(false);
    expect(isBlankForm({ ...EMPTY_FORM, graduationYear: 2026 })).toBe(false);
  });
});
