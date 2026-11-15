import { CHANNEL_LABEL, CHANNELS, type ApplyStatus, type Channel } from "@offerpilot/shared";
import type { Application } from "./applications";
import type { BoardItem, BoardStatus } from "./board";

export type Source = Channel | "official";
export const SOURCES: Source[] = ["official", ...CHANNELS];

/** 统一后的一条投递：官网看板里“已投出”的卡片 + 各平台的投递记录。 */
export interface UnifiedApply {
  source: Source;
  company: string;
  title: string;
  /** 投递时间（毫秒） */
  at: number;
  /** 有回应：笔试、面试、HR 回复、已发简历、Offer */
  responded: boolean;
  interview: boolean;
  offer: boolean;
  rejected: boolean;
}

export interface SourceStat {
  source: Source;
  label: string;
  total: number;
  today: number;
  week: number;
  responded: number;
  interview: number;
  offer: number;
  /** 有回应的比例；样本不足（<5）时为 undefined */
  responseRate?: number;
}

export interface DayBucket {
  day: string;
  label: string;
  bySource: Record<Source, number>;
  total: number;
}

export interface Overview {
  total: number;
  today: number;
  week: number;
  responded: number;
  interview: number;
  offer: number;
  responseRate?: number;
  sources: SourceStat[];
  days: DayBucket[];
}

const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parse = (s: string | null | undefined) => {
  if (!s) return undefined;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(t) ? undefined : t;
};

const BOARD_RESPONDED: BoardStatus[] = ["written_test", "interview", "offer"];
const APPLY_RESPONDED: ApplyStatus[] = ["replied", "resume_sent", "interview", "offer"];

/** 把官网看板和平台记录合成一张表。官网只算“已投出”的卡片，没有投递日期的用最后更新时间。 */
export function unify(board: BoardItem[], apps: Application[]): UnifiedApply[] {
  const out: UnifiedApply[] = [];
  for (const b of board) {
    if (b.status === "todo") continue;
    const at = parse(b.applied_at) ?? parse(b.updated_at);
    if (at === undefined) continue;
    out.push({
      source: "official",
      company: b.company,
      title: b.title,
      at,
      responded: BOARD_RESPONDED.includes(b.status),
      interview: b.status === "interview" || b.status === "offer",
      offer: b.status === "offer",
      rejected: b.status === "rejected",
    });
  }
  for (const a of apps) {
    const at = parse(a.applied_at);
    if (at === undefined) continue;
    out.push({
      source: a.channel,
      company: a.company,
      title: a.title,
      at,
      responded: APPLY_RESPONDED.includes(a.status),
      interview: a.status === "interview" || a.status === "offer",
      offer: a.status === "offer",
      rejected: a.status === "rejected",
    });
  }
  return out;
}

const rate = (n: number, total: number) => (total >= 5 ? n / total : undefined);

/** 投递总览：各渠道的数量、今日 / 近 7 天、回应率，以及近 N 天按渠道的每日投递数。纯函数。 */
export function overview(rows: UnifiedApply[], now = new Date(), dayCount = 14): Overview {
  const today0 = startOfDay(now.getTime());
  const week0 = today0 - 6 * DAY;
  const first = today0 - (dayCount - 1) * DAY;

  const stat = (list: UnifiedApply[]) => {
    const responded = list.filter((r) => r.responded).length;
    return {
      total: list.length,
      today: list.filter((r) => r.at >= today0).length,
      week: list.filter((r) => r.at >= week0).length,
      responded,
      interview: list.filter((r) => r.interview).length,
      offer: list.filter((r) => r.offer).length,
      responseRate: rate(responded, list.length),
    };
  };

  const zero = () => Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<Source, number>;
  const days: DayBucket[] = Array.from({ length: dayCount }, (_, i) => {
    const t = first + i * DAY;
    const d = new Date(t);
    return { day: ymd(t), label: `${d.getMonth() + 1}/${d.getDate()}`, bySource: zero(), total: 0 };
  });
  for (const r of rows) {
    // 用日历日比较，避免夏令时之类的偏差
    const idx = days.findIndex((d) => d.day === ymd(r.at));
    const b = days[idx];
    if (!b) continue;
    b.bySource[r.source]++;
    b.total++;
  }

  return {
    ...stat(rows),
    sources: SOURCES.map((source) => ({ source, label: CHANNEL_LABEL[source], ...stat(rows.filter((r) => r.source === source)) })),
    days,
  };
}
