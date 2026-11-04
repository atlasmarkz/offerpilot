import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER, planOf } from "@offerpilot/shared";
import { AttachError, checkAttachment, contentDisposition } from "./attachments";
import { BoardCreate, BoardPatch } from "./board";
import { summarizeUsage } from "./billing/billing";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);

describe("plans", () => {
  it("has increasing quotas, three attachments for every paid tier and one for free", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].monthlyQuota)).toEqual([3, 30, 100, 300]);
    expect(PLANS.free.attachments).toBe(1);
    for (const p of ["basic", "plus", "pro"] as const) expect(PLANS[p].attachments).toBe(3);
    expect(planOf("weird")).toBe("free");
    expect(planOf("plus")).toBe("plus");
  });
  it("reports tier limits in the usage summary", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const u = summarizeUsage({ plan: "plus", quota: 100, used: 1, period_end: "2027-01-01T00:00:00Z" }, 0, now);
    expect(u).toMatchObject({ plan: "plus", limits: { attachments: 3, boardItems: 300, resumes: 3 } });
    expect(summarizeUsage(undefined, 0, now).limits).toEqual({ attachments: 1, boardItems: 20, resumes: 1 });
    // 免费版：每月 3 次，已用的从本月流水算
    expect(summarizeUsage(undefined, 0, now, 2)).toMatchObject({ plan: "free", quota: 3, used: 2, remaining: 1 });
    expect(summarizeUsage(undefined, 0, now, 5).remaining).toBe(0);
  });
});

describe("checkAttachment", () => {
  it("accepts real PDF and docx headers", () => {
    expect(checkAttachment("简历.pdf", PDF)).toMatchObject({ ext: "pdf", contentType: "application/pdf", name: "简历.pdf" });
    expect(checkAttachment("cv.DOCX", ZIP).ext).toBe("docx");
  });
  it("rejects wrong types, mismatched content, empty and oversized files", () => {
    expect(() => checkAttachment("a.exe", PDF)).toThrow(AttachError);
    expect(() => checkAttachment("a.pdf", ZIP)).toThrow(/对不上/);
    expect(() => checkAttachment("a.docx", PDF)).toThrow(/对不上/);
    expect(() => checkAttachment("a.pdf", new Uint8Array())).toThrow(/空/);
    expect(() => checkAttachment("a.pdf", new Uint8Array(5 * 1024 * 1024 + 1))).toThrow(/5MB/);
  });
  it("strips path parts and control characters from names", () => {
    expect(checkAttachment("../../etc/x<y>.pdf", PDF).name).toBe("xy.pdf");
  });
  it("encodes download names safely", () => {
    const h = contentDisposition('张三 "简历".pdf');
    expect(h).toContain("filename*=UTF-8''");
    expect(h).not.toContain('"简历"');
  });
});

describe("board schemas", () => {
  it("defaults and validates a new item", () => {
    expect(BoardCreate.parse({ title: " 后端 " })).toMatchObject({ title: "后端", status: "todo", company: "", url: "" });
    expect(BoardCreate.safeParse({ title: "" }).success).toBe(false);
    expect(BoardCreate.safeParse({ title: "x", url: "javascript:alert(1)" }).success).toBe(false);
    expect(BoardCreate.safeParse({ title: "x", status: "weird" }).success).toBe(false);
  });
  it("only allows whitelisted patch fields", () => {
    const p = BoardPatch.parse({ status: "interview", user_id: "someone-else", id: "x" });
    expect(p).toEqual({ status: "interview" });
    expect(BoardPatch.safeParse({ applied_at: "2026-13" }).success).toBe(false);
  });
});
