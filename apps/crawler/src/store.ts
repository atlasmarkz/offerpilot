import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Job, planFreshness, type RunSource } from "@offerpilot/shared";

type ReviewStatus = Job["reviewStatus"];

/**
 * 本地 JSON 审核队列。后续换成 Supabase 时只需替换这个类，
 * 管道和审核流程不变。
 */
export class JobStore {
  private jobs = new Map<string, Job>();

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      const list = JSON.parse(readFileSync(path, "utf8")) as unknown[];
      for (const item of list) {
        const job = Job.parse(item);
        this.jobs.set(job.id, job);
      }
    }
  }

  /**
   * 这次采集到的岗位入库：
   * - 已有的保留审核状态和首次收录时间，刷新内容，记为“刚确认在招”；
   * - 新的：如果这个数据源之前已经有岗位审核通过（说明整个数据源抽查过、可信），直接通过，每天的新岗位就能及时出现；
   *   否则以 pending 入库，等人工审核。
   * 返回新增数量。
   */
  upsert(incoming: Job[], at = new Date().toISOString()): number {
    const trusted = new Set([...this.jobs.values()].filter((j) => j.reviewStatus === "approved" && j.source).map((j) => j.source!));
    let added = 0;
    for (const job of incoming) {
      const existing = this.jobs.get(job.id);
      const seen = { lastSeenAt: at, status: "open" as const, closedAt: undefined, missCount: 0 };
      if (existing) {
        this.jobs.set(job.id, {
          ...job,
          ...seen,
          reviewStatus: existing.reviewStatus,
          firstSeenAt: existing.firstSeenAt ?? at,
          // 发布日期以这次采集到的为准（识别规则改了时，旧的错误日期能被纠正）
          postedAt: job.postedAt,
        });
      } else {
        const reviewStatus = job.source && trusted.has(job.source) ? "approved" : "pending";
        this.jobs.set(job.id, { ...job, ...seen, reviewStatus, firstSeenAt: at });
        added++;
      }
    }
    return added;
  }

  /** 按这次采集结果判断下架 / 恢复（规则见 @offerpilot/shared 的 planFreshness）。 */
  applyRun(run: RunSource[], at = new Date().toISOString()): { missed: number; closed: number; reopened: number } {
    const rows = [...this.jobs.values()].map((j) => ({ id: j.id, source: j.source, status: j.status, missCount: j.missCount, lastSeenAt: j.lastSeenAt }));
    const plan = planFreshness(rows, run, undefined, new Date(at));
    for (const m of plan.miss) this.patch(m.id, { missCount: m.missCount });
    for (const c of plan.close) this.patch(c.id, { missCount: c.missCount, status: "closed", closedAt: at });
    for (const id of plan.reopen) this.patch(id, { status: "open", closedAt: undefined, missCount: 0 });
    return { missed: plan.miss.length, closed: plan.close.length, reopened: plan.reopen.length };
  }

  /** 旧数据没有 source：按 sourceUrl 对应回 sources.json 的数据源 id。 */
  backfillSource(urlToSource: Map<string, string>): number {
    let n = 0;
    for (const j of this.jobs.values()) {
      const s = !j.source ? urlToSource.get(j.sourceUrl) : undefined;
      if (s) {
        this.jobs.set(j.id, { ...j, source: s });
        n++;
      }
    }
    return n;
  }

  private patch(id: string, p: Partial<Job>) {
    const j = this.jobs.get(id);
    if (j) this.jobs.set(id, { ...j, ...p });
  }

  list(status?: ReviewStatus): Job[] {
    const all = [...this.jobs.values()];
    return status ? all.filter((j) => j.reviewStatus === status) : all;
  }

  setStatus(idPrefix: string, status: ReviewStatus): Job {
    const matches = [...this.jobs.values()].filter((j) => j.id.startsWith(idPrefix));
    if (matches.length !== 1) throw new Error(`id 前缀 "${idPrefix}" 匹配到 ${matches.length} 条`);
    const job = { ...matches[0]!, reviewStatus: status };
    this.jobs.set(job.id, job);
    return job;
  }

  /** 批量改状态（如抽查过某家公司后整家通过）。只动当前处于 from 状态的岗位，返回改动数量。 */
  setStatusWhere(match: (job: Job) => boolean, from: ReviewStatus, to: ReviewStatus): number {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.reviewStatus === from && match(job)) {
        this.jobs.set(job.id, { ...job, reviewStatus: to });
        n++;
      }
    }
    return n;
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify([...this.jobs.values()], null, 2), "utf8");
  }
}
