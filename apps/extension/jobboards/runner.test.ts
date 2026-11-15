import { ScreenRules, type BoardJob } from "@offerpilot/shared";
import { describe, expect, it } from "vitest";
import { runAutoApply, type RunnerDeps, type RunnerEvent } from "./runner";
import type { ApplyResult, JobBoardAdapter } from "./types";

const job = (id: string, o: Partial<BoardJob> = {}): BoardJob => ({
  channel: "boss",
  externalId: id,
  title: "前端实习",
  company: `公司${id}`,
  url: `https://www.zhipin.com/job_detail/${id}.html`,
  ...o,
});

function fakeAdapter(pages: BoardJob[][], results: Record<string, ApplyResult> = {}, blocker: () => string | null = () => null) {
  let page = 0;
  const applied: string[] = [];
  const adapter: JobBoardAdapter = {
    channel: "boss",
    matches: [],
    detectBlocker: blocker,
    listJobs: () => pages.slice(0, page + 1).flat(),
    openJob: async (_d, j) => j,
    apply: async (_d, j) => {
      applied.push(j.externalId);
      return results[j.externalId] ?? { kind: "sent" };
    },
    nextPage: async () => (page + 1 < pages.length ? (page++, true) : false),
  };
  return { adapter, applied };
}

function deps(adapter: JobBoardAdapter, o: Partial<RunnerDeps> = {}) {
  let count = 0;
  const events: RunnerEvent[] = [];
  const sleeps: number[] = [];
  const d: RunnerDeps = {
    adapter,
    doc: document,
    rules: ScreenRules.parse({}),
    dailyCap: 100,
    applied: new Set(),
    todayCount: async () => count,
    record: async () => void count++,
    greeting: () => "你好",
    delay: () => 30_000,
    sleep: async (ms) => void sleeps.push(ms),
    shouldStop: () => false,
    report: (e) => events.push(e),
    ...o,
  };
  return { d, events, sleeps, count: () => count };
}

describe("runAutoApply", () => {
  it("applies to every passing job across pages, waiting between sends, then stops when exhausted", async () => {
    const { adapter, applied } = fakeAdapter([[job("1"), job("2")], [job("3")]]);
    const { d, sleeps } = deps(adapter);
    expect(await runAutoApply(d)).toEqual({ kind: "exhausted" });
    expect(applied).toEqual(["1", "2", "3"]);
    expect(sleeps).toEqual([30_000, 30_000, 30_000]);
  });

  it("skips screened-out and already-applied jobs without applying", async () => {
    const { adapter, applied } = fakeAdapter([[job("1", { title: "销售" }), job("2"), job("3")]]);
    const { d, events } = deps(adapter, { rules: ScreenRules.parse({ exclude: ["销售"] }), applied: new Set(["boss:3"]) });
    await runAutoApply(d);
    expect(applied).toEqual(["2"]);
    expect(events.filter((e) => e.kind === "skip").map((e) => (e as { reasons: string[] }).reasons)).toEqual([["含排除词：销售"], ["已经投过"]]);
  });

  it("dry run screens and opens jobs but never applies", async () => {
    const { adapter, applied } = fakeAdapter([[job("1"), job("2", { title: "销售" })]]);
    const { d, events, count } = deps(adapter, { dryRun: true, dryDelay: () => 4000, rules: ScreenRules.parse({ exclude: ["销售"] }) });
    expect(await runAutoApply(d)).toEqual({ kind: "exhausted" });
    expect(applied).toEqual([]);
    expect(count()).toBe(0);
    expect(events.map((e) => e.kind)).toEqual(["would", "skip"]);
  });

  it("stops at the daily cap", async () => {
    const { adapter, applied } = fakeAdapter([[job("1"), job("2"), job("3")]]);
    const { d } = deps(adapter, { dailyCap: 2 });
    expect(await runAutoApply(d)).toEqual({ kind: "cap", count: 2 });
    expect(applied).toEqual(["1", "2"]);
  });

  it("stops immediately on a platform limit or a captcha", async () => {
    const a = fakeAdapter([[job("1"), job("2")]], { "1": { kind: "limit", text: "今日沟通人数已达上限" } });
    expect(await runAutoApply(deps(a.adapter).d)).toEqual({ kind: "platform-limit", text: "今日沟通人数已达上限" });
    expect(a.applied).toEqual(["1"]);

    const b = fakeAdapter([[job("1")]], {}, () => "请完成安全验证");
    expect(await runAutoApply(deps(b.adapter).d)).toEqual({ kind: "blocked", text: "请完成安全验证" });
    expect(b.applied).toEqual([]);
  });

  it("trips the breaker after consecutive failures, but a success resets it", async () => {
    const fail: ApplyResult = { kind: "failed", text: "没找到沟通按钮" };
    const a = fakeAdapter([[job("1"), job("2"), job("3"), job("4"), job("5")]], { "1": fail, "2": fail, "4": fail, "5": fail });
    expect(await runAutoApply(deps(a.adapter, { maxFailures: 2 }).d)).toEqual({ kind: "failures", text: "没找到沟通按钮" });
    expect(a.applied).toEqual(["1", "2"]);

    const b = fakeAdapter([[job("1"), job("2"), job("3"), job("4")]], { "1": fail, "3": fail });
    expect(await runAutoApply(deps(b.adapter, { maxFailures: 2 }).d)).toEqual({ kind: "exhausted" });
  });

  it("does not count 'already contacted' jobs and stops when the user asks", async () => {
    const a = fakeAdapter([[job("1"), job("2")]], { "1": { kind: "already" } });
    const { d, count } = deps(a.adapter);
    await runAutoApply(d);
    expect(count()).toBe(1);

    let stop = false;
    const b = fakeAdapter([[job("1"), job("2")]]);
    const r = deps(b.adapter, { shouldStop: () => stop, sleep: async () => void (stop = true) });
    expect(await runAutoApply(r.d)).toEqual({ kind: "user" });
    expect(b.applied).toEqual(["1"]);
  });
});
