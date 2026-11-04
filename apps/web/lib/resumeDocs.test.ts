import { describe, expect, it } from "vitest";
import { parseResumeBody, toDoc } from "./resumeDocs";

describe("resume docs never carry contact info to or from the cloud", () => {
  const withContact = { contact: { name: "张三", phone: "13800000000", email: "a@b.c", city: "杭州", links: ["https://x.y"] }, education: [{ school: "某大学" }] };
  it("drops contact on the way in", () => {
    const r = parseResumeBody(withContact);
    expect("data" in r && r.data.contact).toEqual({ name: "", phone: "", email: "", city: "", links: [] });
    expect("data" in r && r.data.education[0]!.school).toBe("某大学");
  });
  it("blanks contact on the way out, even for rows saved before this rule", () => {
    const d = toDoc({ id: "1", name: "我的简历", data: withContact, updated_at: "2026-11-04T00:00:00Z" });
    expect(d.data.contact.phone).toBe("");
    expect(JSON.stringify(d)).not.toContain("13800000000");
  });
});
