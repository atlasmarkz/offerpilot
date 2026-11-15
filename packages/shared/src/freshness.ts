/**
 * 岗位的新旧与下架判断（采集器本地存储、同步到数据库两处共用，纯函数）。
 *
 * 规则：
 * - 一个数据源这次“完整”采集（翻到了最后一页，没被条数上限截断、没中途出错）时，
 *   库里这个数据源下、这次没出现的在招岗位，记一次“没找到”；连续 CLOSE_AFTER 次没找到就标记下架。
 *   只差一次不下架：防止官网临时故障、接口偶发漏数据把岗位误判下架。
 * - 不完整的采集（如字节只取前 300 条）不能说明没出现的岗位已下架，这部分交给“复查”：打开详情页确认。
 * - 下架后又出现（官网重新开放），自动恢复为在招。
 */
export const CLOSE_AFTER = 2;

export interface RunSource {
  id: string;
  /** 是否完整采集：翻到最后一页、没被截断、没出错 */
  complete: boolean;
  /** 这次采集到的岗位 id */
  ids: string[];
}

export interface FreshnessRow {
  id: string;
  source?: string | null;
  status: "open" | "closed";
  missCount: number;
  /** 最近一次确认在招；下架前要求至少隔了 MIN_GAP_HOURS，防止同一天手动重跑两次就误判下架 */
  lastSeenAt?: string | null;
}

/** 最近一次确认在招后至少过了多久，才允许判下架（小时）。 */
export const MIN_GAP_HOURS = 20;

export interface FreshnessPlan {
  /** 没找到、但还没到下架门槛：新的 missCount */
  miss: { id: string; missCount: number }[];
  /** 这次标记下架 */
  close: { id: string; missCount: number }[];
  /** 之前下架、这次又出现：恢复在招 */
  reopen: string[];
}

export function planFreshness(rows: FreshnessRow[], run: RunSource[], closeAfter = CLOSE_AFTER, now = new Date()): FreshnessPlan {
  const plan: FreshnessPlan = { miss: [], close: [], reopen: [] };
  const seenAll = new Set(run.flatMap((s) => s.ids));
  const complete = new Map(run.filter((s) => s.complete).map((s) => [s.id, new Set(s.ids)]));
  for (const r of rows) {
    if (seenAll.has(r.id)) {
      if (r.status === "closed") plan.reopen.push(r.id);
      continue;
    }
    const ids = r.source ? complete.get(r.source) : undefined;
    // 这个数据源这次没有完整采集（或失败了）：什么也不能断定
    if (!ids || r.status !== "open") continue;
    const missCount = r.missCount + 1;
    const seenAgo = r.lastSeenAt ? (now.getTime() - Date.parse(r.lastSeenAt)) / 3600_000 : Infinity;
    (missCount >= closeAfter && !(seenAgo < MIN_GAP_HOURS) ? plan.close : plan.miss).push({ id: r.id, missCount });
  }
  return plan;
}

/** 岗位的“日期”：优先官网发布日期，没有就用首次收录日期（YYYY-MM-DD）。 */
export function jobDate(job: { postedAt?: string; firstSeenAt?: string }): { date?: string; kind: "posted" | "seen" | "none" } {
  if (job.postedAt) return { date: job.postedAt, kind: "posted" };
  if (job.firstSeenAt) {
    // 收录时间是 UTC 的 ISO 时间（定时任务在北京时间凌晨 3 点跑），按北京时间取日期
    const t = Date.parse(job.firstSeenAt);
    if (!Number.isNaN(t)) return { date: new Date(t + 8 * 3600_000).toISOString().slice(0, 10), kind: "seen" };
  }
  return { kind: "none" };
}

/** 把各种时间写法转成 YYYY-MM-DD：毫秒 / 秒时间戳、ISO、“2026-11-12 10:00”、“2026/11/12”。认不出、或明显不合理（2015 年前、未来）返回 undefined。 */
export function toDay(v: unknown, now = new Date()): string | undefined {
  let t: number | undefined;
  if (typeof v === "number" && Number.isFinite(v)) t = v > 1e12 ? v : v > 1e9 ? v * 1000 : undefined;
  else if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{10,13}$/.test(s)) return toDay(Number(s), now);
    const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (m) t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  if (t === undefined || Number.isNaN(t)) return undefined;
  const d = new Date(t + 8 * 3600_000); // 按北京时间取日期
  if (d.getUTCFullYear() < 2015 || t > now.getTime() + 2 * 86400_000) return undefined;
  return d.toISOString().slice(0, 10);
}

/** 平台接口里常见的发布时间字段，按可信度从高到低。 */
const DATE_KEYS = [
  "publish_time",
  "publishTime",
  "publishDate",
  "publish_date",
  "releaseTime",
  "releaseDate",
  "firstPublishTime",
  "pubTime",
  "postTime",
  "postDate",
  "createTime",
  "create_time",
  "createdAt",
];
// 不认 refreshTime / updateTime 一类：那是“最近刷新”，很多官网每天都刷，当成发布日期会误导（实测小红书全是近几天）

/** 从接口原始数据里找发布日期（没有专门映射的平台用）。返回 YYYY-MM-DD 或 undefined。 */
export function guessPostedAt(item: unknown, now = new Date()): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as Record<string, unknown>;
  for (const k of DATE_KEYS) {
    const d = toDay(o[k], now);
    if (d) return d;
  }
  return undefined;
}
