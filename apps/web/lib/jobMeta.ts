import { jobDate, type Job } from "@offerpilot/shared";
import { companyName } from "./companies";

const DAY = 86_400_000;

/** 北京时间的“今天”YYYY-MM-DD。 */
export function todayCN(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 两个 YYYY-MM-DD 相差几天（a - b）。 */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
}

/** 岗位的日期多少天前：发布日期优先，没有就用收录日期。没有日期返回 undefined。 */
export function ageDays(job: Pick<Job, "postedAt" | "firstSeenAt">, now = new Date()): number | undefined {
  const d = jobDate(job).date;
  return d ? Math.max(0, daysBetween(todayCN(now), d)) : undefined;
}

/** 列表里显示的日期：“今天发布”“3 天前发布”“11-02 发布”；没有发布日期时写“收录”。 */
export function dateLabel(job: Pick<Job, "postedAt" | "firstSeenAt">, now = new Date()): string | undefined {
  const { date, kind } = jobDate(job);
  if (!date) return undefined;
  const verb = kind === "posted" ? "发布" : "收录";
  const n = Math.max(0, daysBetween(todayCN(now), date));
  if (n === 0) return `今天${verb}`;
  if (n === 1) return `昨天${verb}`;
  if (n < 7) return `${n} 天前${verb}`;
  const sameYear = date.slice(0, 4) === todayCN(now).slice(0, 4);
  return `${sameYear ? date.slice(5) : date} ${verb}`;
}

/** 来源：哪家公司的官网，网址是什么。 */
export function sourceLabel(job: Pick<Job, "companyId" | "sourceUrl">): { name: string; host: string } {
  let host = "";
  try {
    host = new URL(job.sourceUrl).hostname;
  } catch {
    /* 保持空 */
  }
  return { name: `${companyName(job.companyId)}招聘官网`, host };
}
