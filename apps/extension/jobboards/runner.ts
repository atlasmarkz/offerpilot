import { screenJob, type BoardJob, type ScreenRules } from "@offerpilot/shared";
import type { JobBoardAdapter } from "./types";

/** 停止原因：都会显示给用户。 */
export type StopReason =
  | { kind: "user" }
  | { kind: "cap"; count: number }
  | { kind: "platform-limit"; text: string }
  | { kind: "blocked"; text: string }
  | { kind: "failures"; text: string }
  | { kind: "exhausted" };

export function describeStop(r: StopReason): string {
  switch (r.kind) {
    case "user":
      return "你已手动停止";
    case "cap":
      return `今天已投 ${r.count} 个，达到你设的每日上限`;
    case "platform-limit":
      return `平台提示今天的次数已用完：${r.text}`;
    case "blocked":
      return `需要你处理：${r.text}。处理完再点“开始”`;
    case "failures":
      return `连续失败，已自动停止（${r.text}）。可能是页面改版，请点“复制页面结构”反馈`;
    case "exhausted":
      return "这个搜索结果里的职位都看完了。换个关键词或城市再开始";
  }
}

export type RunnerEvent =
  | { kind: "skip"; job: BoardJob; reasons: string[] }
  | { kind: "sent"; job: BoardJob; count: number }
  /** 试运行：这个职位会被投递，但没有真的投 */
  | { kind: "would"; job: BoardJob }
  | { kind: "already"; job: BoardJob }
  | { kind: "failed"; job: BoardJob; text: string }
  | { kind: "wait"; ms: number }
  | { kind: "page" };

export interface RunnerDeps {
  adapter: JobBoardAdapter;
  doc: Document;
  rules: ScreenRules;
  dailyCap: number;
  /** 已投过的 channel:externalId（本机记录） */
  applied: Set<string>;
  /** 今天这个平台已投了多少（含之前几次运行） */
  todayCount: () => Promise<number>;
  /** 记一条投递（写本机记录、今日计数 +1） */
  record: (job: BoardJob) => Promise<void>;
  greeting: (job: BoardJob) => string;
  /** 下一次投递前等多久 */
  delay: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  report: (e: RunnerEvent) => void;
  /** 试运行：只筛选、只点开详情看，不打招呼，不计入每日上限（借鉴 get_jobs 的调试模式） */
  dryRun?: boolean;
  /** 试运行时每看一个职位等多久（点卡片也会请求平台接口，不能太快） */
  dryDelay?: () => number;
  /** 连续失败多少次就停 */
  maxFailures?: number;
  /** 一次运行最多看多少个职位（防止无限滚动） */
  maxScan?: number;
}

/**
 * 全自动投递主循环：读列表 → 筛选 → 点开详情再筛一次 → 投递 → 随机等待；
 * 遇到用户停止、每日上限、平台限额、验证码、连续失败、没有更多职位就停下，返回原因。
 */
export async function runAutoApply(d: RunnerDeps): Promise<StopReason> {
  const maxFailures = d.maxFailures ?? 3;
  const maxScan = d.maxScan ?? 600;
  const seen = new Set<string>();
  let failures = 0;
  let scanned = 0;

  const check = async (): Promise<StopReason | null> => {
    if (d.shouldStop()) return { kind: "user" };
    const blocker = d.adapter.detectBlocker(d.doc);
    if (blocker) return { kind: "blocked", text: blocker };
    if (!d.dryRun) {
      const count = await d.todayCount();
      if (count >= d.dailyCap) return { kind: "cap", count };
    }
    return null;
  };

  for (;;) {
    const stop = await check();
    if (stop) return stop;

    const fresh = d.adapter.listJobs(d.doc).filter((j) => !seen.has(j.externalId));
    for (const card of fresh) {
      seen.add(card.externalId);
      if (++scanned > maxScan) return { kind: "exhausted" };

      const first = screenJob(card, d.rules, d.applied);
      if (!first.pass) {
        d.report({ kind: "skip", job: card, reasons: first.reasons });
        continue;
      }

      const job = await d.adapter.openJob(d.doc, card);
      const stop2 = await check();
      if (stop2) return stop2;
      const second = screenJob(job, d.rules, d.applied);
      if (!second.pass) {
        d.report({ kind: "skip", job, reasons: second.reasons });
        continue;
      }

      if (d.dryRun) {
        d.report({ kind: "would", job });
        await d.sleep(d.dryDelay?.() ?? 3000);
        const s = await check();
        if (s) return s;
        continue;
      }

      const res = await d.adapter.apply(d.doc, job, d.greeting(job));
      const key = `${job.channel}:${job.externalId}`;
      if (res.kind === "sent") {
        failures = 0;
        d.applied.add(key);
        await d.record(job);
        d.report({ kind: "sent", job, count: await d.todayCount() });
        const after = await check();
        if (after) return after;
        const ms = d.delay();
        d.report({ kind: "wait", ms });
        await d.sleep(ms);
      } else if (res.kind === "already") {
        failures = 0;
        d.applied.add(key);
        d.report({ kind: "already", job });
      } else if (res.kind === "limit") {
        return { kind: "platform-limit", text: res.text };
      } else if (res.kind === "blocked") {
        return { kind: "blocked", text: res.text };
      } else {
        failures++;
        d.report({ kind: "failed", job, text: res.text });
        if (failures >= maxFailures) return { kind: "failures", text: res.text };
      }

      const between = await check();
      if (between) return between;
    }

    const more = await d.adapter.nextPage(d.doc);
    if (!more) return { kind: "exhausted" };
    d.report({ kind: "page" });
  }
}
