import { describe, expect, it } from "vitest";
import { CloudDataIn, stripSecrets } from "./cloudData";
import { clearCookies, parseCookies, sameOrigin, sessionCookies } from "./session";
import { normalizeEmail } from "./supabaseAuth";

const req = (headers: Record<string, string>) => new Request("https://app.example.com/api/x", { method: "POST", headers });

describe("normalizeEmail", () => {
  it("lowercases and trims valid addresses", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("rejects malformed or oversized input", () => {
    for (const bad of ["", "a", "a@b", "a b@c.com", "@c.com", 5, null, undefined, `${"a".repeat(250)}@x.com`])
      expect(normalizeEmail(bad)).toBeUndefined();
  });
});

describe("cookies", () => {
  it("parses a Cookie header and survives garbage", () => {
    expect(parseCookies("a=1; op_at=x%20y; bad; =z; q=%E0%A4%A")).toMatchObject({ a: "1", op_at: "x y" });
    expect(parseCookies(null)).toEqual({});
  });
  it("sets HttpOnly + SameSite cookies, and clears them", () => {
    const [at, rt] = sessionCookies({ accessToken: "A", refreshToken: "R", expiresIn: 3600 });
    expect(at).toMatch(/^op_at=A;.*HttpOnly; SameSite=Lax/);
    expect(at).toContain("Max-Age=3600");
    expect(rt).toMatch(/^op_rt=R;.*HttpOnly/);
    for (const c of clearCookies()) expect(c).toContain("Max-Age=0");
  });
});

describe("sameOrigin", () => {
  it("accepts requests from the same host only", () => {
    expect(sameOrigin(req({ origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(sameOrigin(req({ host: "app.example.com" }))).toBe(false); // 没有 Origin：浏览器不会这样发改数据的请求
    expect(sameOrigin(req({ origin: "https://app.example.com", "x-forwarded-host": "app.example.com", host: "internal" }))).toBe(true);
    expect(sameOrigin(req({ origin: "not a url", host: "app.example.com" }))).toBe(false);
  });
});

describe("cloud data", () => {
  it("accepts a profile and a bounded selection", () => {
    expect(CloudDataIn.safeParse({ profile: { school: "x" }, selected: ["a"] }).success).toBe(true);
  });
  it("rejects oversized or malformed payloads", () => {
    expect(CloudDataIn.safeParse({ profile: { x: "y".repeat(100_001) }, selected: [] }).success).toBe(false);
    expect(CloudDataIn.safeParse({ profile: {}, selected: Array(1001).fill("a") }).success).toBe(false);
    expect(CloudDataIn.safeParse({ profile: {}, selected: [1] }).success).toBe(false);
    expect(CloudDataIn.safeParse({ selected: [] }).success).toBe(false);
  });
  it("strips secrets before storing", () => {
    expect(stripSecrets({ school: "x", llm: { apiKey: "k" }, apiKey: "k", llmApiKey: "k" })).toEqual({ school: "x" });
    // 姓名等身份信息只存本机
    expect(stripSecrets({ school: "x", name: "张三", phone: "1", email: "a@b.c", idNumber: "1", birthDate: "2000" })).toEqual({ school: "x" });
  });
});
