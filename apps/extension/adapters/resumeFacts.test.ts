import { describe, expect, it } from "vitest";
import { ResumeData } from "@offerpilot/shared";
import { resumeExtras } from "./resumeFacts";

describe("resumeExtras", () => {
  it("maps contact info to field values and skips blanks", () => {
    const r = ResumeData.parse({ contact: { name: " 张三 ", phone: "13800000000", email: "", city: "杭州" } });
    expect(resumeExtras(r)).toEqual({ 姓名: "张三", 手机: "13800000000", 现居城市: "杭州" });
  });
  it("returns nothing without a resume", () => {
    expect(resumeExtras(undefined)).toEqual({});
  });
});
