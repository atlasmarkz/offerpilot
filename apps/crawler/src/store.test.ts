import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Job } from "@offerpilot/shared";
import { runPipeline, type RawPosting, type SourceAdapter } from "./pipeline";
import { JobStore } from "./store";
import { planRecheck } from "./recheck";

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

import { authHeaders, chunk, planSync, toRow, type DbRow } from "./sync";

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

describe("JobStore freshness", () => {
  const at1 = "2026-11-14T19:00:00.000Z";
  const at2 = "2026-11-15T19:00:00.000Z";
  const at3 = "2026-11-16T19:00:00.000Z";

  it("keeps first-seen, refreshes last-seen, and auto-approves new jobs from an approved source", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([job({ source: "s", postedAt: "2026-11-01" })], at1);
    expect(store.list()[0]).toMatchObject({ reviewStatus: "pending", firstSeenAt: at1, lastSeenAt: at1, status: "open" });
    store.setStatus("abc1", "approved");

    store.upsert([job({ source: "s", postedAt: "2026-11-01" }), job({ id: "def67890", source: "s", applyUrl: "https://example.com/2" }), job({ id: "ghi", source: "t" })], at2);
    const byId = Object.fromEntries(store.list().map((j) => [j.id, j]));
    expect(byId.abc12345).toMatchObject({ firstSeenAt: at1, lastSeenAt: at2, postedAt: "2026-11-01", reviewStatus: "approved" });
    expect(byId.def67890!.reviewStatus).toBe("approved"); // 同一数据源之前审核过：直接通过
    expect(byId.ghi!.reviewStatus).toBe("pending"); // 新数据源：等人工审核
  });

  it("closes a job after two complete runs without it, and reopens it when it comes back", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([job({ source: "s" }), job({ id: "b", source: "s" })], at1);

    expect(store.applyRun([{ id: "s", complete: true, ids: ["b"] }], at2)).toEqual({ missed: 1, closed: 0, reopened: 0 });
    expect(store.applyRun([{ id: "s", complete: false, ids: ["b"] }], at2)).toEqual({ missed: 0, closed: 0, reopened: 0 });
    expect(store.applyRun([{ id: "s", complete: true, ids: ["b"] }], at3)).toEqual({ missed: 0, closed: 1, reopened: 0 });
    expect(store.list().find((j) => j.id === "abc12345")).toMatchObject({ status: "closed", closedAt: at3, missCount: 2 });

    store.upsert([job({ source: "s" })], at3);
    expect(store.list().find((j) => j.id === "abc12345")).toMatchObject({ status: "open", missCount: 0, closedAt: undefined });
  });

  it("backfills the source of old jobs from their listing url", () => {
    const store = new JobStore(join(dir, "jobs.json"));
    store.upsert([job()], at1);
    expect(store.backfillSource(new Map([["https://example.com/list", "s"]]))).toBe(1);
    expect(store.list()[0]!.source).toBe("s");
  });
});

describe("runPipeline completeness", () => {
  const base: RawPosting = { sourceUrl: "https://x.example/l", applyUrl: "https://x.example/a", text: "", fetchedAt: "", companyId: "x", companyType: "internet" };
  const src = (id: string, postings: RawPosting[]): SourceAdapter => ({ id, fetchPostings: async () => postings });

  it("reports seen ids per source and only marks fully fetched, fully parsed sources complete", async () => {
    const r = await runPipeline(
      [
        src("full", [{ ...base, complete: true, candidates: [{ title: "A", kind: "fulltime", applyUrl: "/1", postedAt: "2026-11-02", status: "closed" }] }]),
        src("cut", [{ ...base, complete: false, candidates: [{ title: "B", kind: "intern", applyUrl: "/2" }] }]),
        src("bad", [{ ...base, complete: true, candidates: [{ title: "C", kind: "intern", applyUrl: "/3" }, { title: "无效" }] }]),
      ],
      async () => [],
    );
    expect(r.sources.map((s) => [s.id, s.complete, s.ids.length])).toEqual([
      ["full", true, 1],
      ["cut", false, 1],
      ["bad", false, 1],
    ]);
    expect(r.accepted[0]).toMatchObject({ source: "full", postedAt: "2026-11-02", status: "open" });
  });
});

describe("planSync", () => {
  const urlToSource = new Map([["https://example.com/list", "s"]]);
  const db = (o: Partial<DbRow> & { id: string }): DbRow => ({ source: "s", source_url: "https://example.com/list", status: "open", miss_count: 0, review_status: "approved", ...o });
  const run = { at: "2026-11-15T19:00:00.000Z", sources: [{ id: "s", complete: true, ids: ["abc12345", "new1", "dated"] }] };

  it("inserts new jobs (auto-approved from a trusted source), refreshes seen ones, and counts misses", () => {
    const plan = planSync({
      db: [db({ id: "abc12345" }), db({ id: "dated" }), db({ id: "gone", miss_count: 1 }), db({ id: "away" }), db({ id: "legacy", source: null, review_status: "pending" })],
      local: [job({ source: "s" }), job({ id: "new1", source: "s" }), job({ id: "dated", source: "s", postedAt: "2026-11-10" })],
      run,
      keepReview: true,
      urlToSource,
    });
    expect(plan.inserts.map((r) => [r.id, r.review_status, r.first_seen_at, r.status])).toEqual([["new1", "approved", run.at, "open"]]);
    expect(plan.seen.map((r) => [r.id, r.posted_at])).toEqual([
      ["abc12345", null],
      ["dated", "2026-11-10"],
    ]);
    expect("review_status" in plan.seen[0]!).toBe(false); // CI 不碰审核状态
    expect(plan.seen[0]).toMatchObject({ last_seen_at: run.at, status: "open", miss_count: 0, closed_at: null });
    expect(plan.close).toEqual([{ id: "gone", missCount: 2 }]);
    expect(plan.miss).toEqual([
      { id: "away", missCount: 1 },
      { id: "legacy", missCount: 1 }, // 没有 source 的旧数据，按 source_url 对应回数据源
    ]);
    expect(plan.backfill).toEqual([{ id: "legacy", source: "s" }]);
  });

  it("keeps new jobs from an unreviewed source pending, and pushes local review status in local mode", () => {
    const fresh = planSync({ db: [], local: [job({ source: "s" })], run, keepReview: true, urlToSource });
    expect(fresh.inserts[0]!.review_status).toBe("pending");

    const local = planSync({ db: [db({ id: "old", review_status: "pending" })], local: [job({ id: "old", source: "s", reviewStatus: "rejected" })], run: { at: run.at, sources: [] }, keepReview: false, urlToSource });
    expect(local.reviewOnly.map((r) => [r.id, r.review_status])).toEqual([["old", "rejected"]]);
    expect(local.miss).toEqual([]); // 没有采集结果：不判断下架
  });
});

describe("planRecheck", () => {
  it("confirms live jobs and closes only after repeated failures", () => {
    expect(
      planRecheck([
        { row: { id: "a", miss_count: 1 }, ok: true },
        { row: { id: "b", miss_count: 0 }, ok: false },
        { row: { id: "c", miss_count: 1 }, ok: false },
      ]),
    ).toEqual({ ok: [{ id: "a" }], miss: [{ id: "b", missCount: 1 }], close: [{ id: "c", missCount: 2 }] });
  });
});
