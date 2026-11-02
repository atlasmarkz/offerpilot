import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { runPipeline, type RawPosting, type SourceAdapter } from "./pipeline";
import { JobStore } from "./store";

const job = (over: object = {}) =>
  Job.parse({
    id: "abc12345",
    companyId: "c",
    companyType: "internet",
    title: "后端开发",
    kind: "fulltime",
    applyUrl: "https://example.com/1",
    sourceUrl: "https://example.com/list",
    ...over,
  });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "offerpilot-store-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("JobStore", () => {
  it("persists and reloads", () => {
    const path = join(dir, "jobs.json");
    const a = new JobStore(path);
    expect(a.upsert([job()])).toBe(1);
    a.save();
    expect(new JobStore(path).list()).toHaveLength(1);
  });

  it("keeps the review status when a job is re-crawled", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([job()]);
    store.setStatus("abc1", "approved");
    // 重新抓到同一个岗位（内容有更新），审核状态不能被重置回 pending
    expect(store.upsert([job({ description: "更新后的描述" })])).toBe(0);
    const [j] = store.list();
    expect(j!.reviewStatus).toBe("approved");
    expect(j!.description).toBe("更新后的描述");
  });

  it("rejects ambiguous id prefixes", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([job({ id: "abc111" }), job({ id: "abc222", applyUrl: "https://example.com/2" })]);
    expect(() => store.setStatus("abc", "approved")).toThrow(/2 条/);
  });
});

describe("JobStore.setStatusWhere", () => {
  it("only changes pending jobs that match", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([
      job({ id: "a1", companyId: "x" }),
      job({ id: "a2", companyId: "x", applyUrl: "https://example.com/2" }),
      job({ id: "b1", companyId: "y", applyUrl: "https://example.com/3" }),
    ]);
    store.setStatus("a2", "rejected");
    expect(store.setStatusWhere((j) => j.companyId === "x", "pending", "approved")).toBe(1);
    const status = Object.fromEntries(store.list().map((j) => [j.id, j.reviewStatus]));
    expect(status).toEqual({ a1: "approved", a2: "rejected", b1: "pending" });
  });
});

describe("runPipeline with structured sources", () => {
  const raw = (over: Partial<RawPosting> = {}): RawPosting => ({
    sourceUrl: "https://corp.example/list",
    applyUrl: "https://corp.example/list",
    text: "",
    fetchedAt: "2026-11-01T00:00:00Z",
    companyId: "corp",
    companyType: "internet",
    ...over,
  });

  it("skips the LLM when candidates are already structured", async () => {
    const source: SourceAdapter = {
      id: "s",
      fetchPostings: async () => [
        raw({ candidates: [{ title: "算法", kind: "intern", applyUrl: "https://corp.example/p/1" }] }),
      ],
    };
    let called = false;
    const result = await runPipeline([source], async () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]!.reviewStatus).toBe("pending");
  });

  it("isolates a failing source", async () => {
    const bad: SourceAdapter = {
      id: "bad",
      fetchPostings: async () => {
        throw new Error("net::ERR_TIMED_OUT\n  at stack");
      },
    };
    const good: SourceAdapter = {
      id: "good",
      fetchPostings: async () => [raw({ candidates: [{ title: "前端", kind: "fulltime" }] })],
    };
    const result = await runPipeline([bad, good], async () => []);
    expect(result.sourceErrors).toEqual([{ source: "bad", error: "net::ERR_TIMED_OUT" }]);
    expect(result.accepted).toHaveLength(1);
  });
});

import { authHeaders, chunk, toRow } from "./sync";

describe("sync helpers", () => {
  it("maps a Job to a job_listing row and trims the description", () => {
    const row = toRow(job({ description: "x".repeat(1000), city: ["上海"], deadline: "2026-12-01" }), 600);
    expect(row).toMatchObject({ id: "abc12345", company_id: "c", cities: ["上海"], review_status: "pending" });
    expect(row.description).toHaveLength(600);
    expect(row.deadline).toBe("2026-12-01");
  });

  it("leaves review_status out when asked to keep the database's review state", () => {
    const row = toRow(job(), 600, true);
    expect("review_status" in row).toBe(false);
    expect("review_status" in toRow(job(), 600, false)).toBe(true);
  });

  it("sends new-style keys only in the apikey header", () => {
    expect(authHeaders("sb_secret_x")).toEqual({ apikey: "sb_secret_x" });
    expect(authHeaders("eyJ.a.b")).toEqual({ apikey: "eyJ.a.b", Authorization: "Bearer eyJ.a.b" });
  });

  it("chunks lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

import { decide, pickSample, titleKey } from "./verifyLinks";

describe("link verification helpers", () => {
  it("builds a title key without leading tags", () => {
    expect(titleKey("【2027校招】全域推荐算法工程师")).toBe("全域推荐算法");
    expect(titleKey("后端开发工程师")).toBe("后端开发工程");
    expect(titleKey("(MJ01) 前端  开发")).toBe("前端开发");
  });
  it("samples evenly and stably", () => {
    expect(pickSample([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(pickSample(Array.from({ length: 100 }, (_, i) => i), 5)).toEqual([0, 20, 40, 60, 80]);
  });
  it("needs 80% of the sample to pass", () => {
    expect(decide(4, 5)).toBe(true);
    expect(decide(3, 5)).toBe(false);
    expect(decide(0, 0)).toBe(false);
  });
});
