import { ApplyRecord, type BoardJob } from "@offerpilot/shared";

/** 本机最多保留多少条（超出丢最旧的；云端另有一份）。 */
export const LOG_MAX = 5000;

export function toRecord(job: BoardJob, at = new Date()): ApplyRecord | null {
  const r = ApplyRecord.safeParse({
    channel: job.channel,
    external_id: job.externalId.slice(0, 80),
    company: job.company.slice(0, 80),
    title: job.title.slice(0, 200),
    city: (job.city ?? "").slice(0, 40),
    salary: (job.salary ?? "").slice(0, 40),
    url: /^https:\/\//i.test(job.url) ? job.url.slice(0, 500) : "",
    status: "greeted",
    applied_at: at.toISOString(),
  });
  return r.success ? r.data : null;
}

/** 读本机记录：逐条校验，丢掉坏数据。 */
export function readLog(raw: unknown): ApplyRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = ApplyRecord.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

/** 追加一条（同平台同职位只留一条），超出上限丢最旧的。 */
export function appendLog(log: ApplyRecord[], rec: ApplyRecord): ApplyRecord[] {
  const next = log.filter((x) => !(x.channel === rec.channel && x.external_id === rec.external_id));
  next.push(rec);
  return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
}

/** 已投过的 key 集合（channel:externalId），筛选时去重用。 */
export function appliedKeys(log: ApplyRecord[]): Set<string> {
  return new Set(log.map((x) => `${x.channel}:${x.external_id}`));
}

/** 某个网页账号上次同步之后的新记录。 */
export function since(log: ApplyRecord[], watermark: string | undefined): ApplyRecord[] {
  if (!watermark) return log;
  return log.filter((x) => x.applied_at > watermark);
}
