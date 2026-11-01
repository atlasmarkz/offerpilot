import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Job } from "@offerpilot/shared";

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

  /** 新岗位以 pending 入库；已存在的保留原审核状态，只刷新内容。返回新增数量。 */
  upsert(incoming: Job[]): number {
    let added = 0;
    for (const job of incoming) {
      const existing = this.jobs.get(job.id);
      if (existing) this.jobs.set(job.id, { ...job, reviewStatus: existing.reviewStatus });
      else {
        this.jobs.set(job.id, job);
        added++;
      }
    }
    return added;
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

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify([...this.jobs.values()], null, 2), "utf8");
  }
}
