import { describe, expect, it } from "vitest";
import { parseDisallow } from "./fetch";
import { htmlToText } from "./html";
import { runPipeline, type RawPosting, type SourceAdapter } from "./pipeline";

const raw: RawPosting = {
  sourceUrl: "https://corp.example/campus",
  applyUrl: "https://corp.example/apply",
  text: "...",
  fetchedAt: "2026-11-01T00:00:00Z",
  companyId: "corp",
  companyType: "internet",
};
const source: SourceAdapter = { id: "s", fetchPostings: async () => [raw] };

describe("runPipeline", () => {
  it("fills identity fields, forces pending, dedupes, and reports invalid", async () => {
    const result = await runPipeline([source], async () => [
      { title: "后端开发", kind: "fulltime", city: ["北京"], reviewStatus: "approved", companyId: "evil" },
      { title: "后端开发", kind: "fulltime", city: ["北京"] }, // 重复
      { title: "前端开发", kind: "intern", applyUrl: "/jobs/2" },
      { title: "缺少类型" }, // 无效：没有 kind
    ]);

    expect(result.accepted).toHaveLength(2);
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toHaveLength(1);

    const [first, second] = result.accepted;
    expect(first!.reviewStatus).toBe("pending"); // 模型想自批也无效
    expect(first!.companyId).toBe("corp"); // 模型想改公司也无效
    expect(second!.applyUrl).toBe("https://corp.example/jobs/2"); // 相对链接被解析
  });

  it("records extractor failures instead of throwing", async () => {
    const result = await runPipeline([source], async () => {
      throw new Error("boom");
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.invalid[0]!.error).toContain("boom");
  });
});

describe("htmlToText", () => {
  it("strips scripts and collects absolute links", () => {
    const page = htmlToText(
      `<html><title>T</title><body><script>x()</script><p>岗位A</p><a href="/d/1">详情</a></body></html>`,
      "https://corp.example/list",
    );
    expect(page.title).toBe("T");
    expect(page.text).toContain("岗位A");
    expect(page.text).not.toContain("x()");
    expect(page.links).toEqual([{ text: "详情", href: "https://corp.example/d/1" }]);
  });
});

describe("parseDisallow", () => {
  it("reads only the wildcard group", () => {
    const rules = parseDisallow("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private # c\n");
    expect(rules).toEqual(["/private"]);
  });
});
