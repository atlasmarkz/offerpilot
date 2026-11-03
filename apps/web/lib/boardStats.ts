import { BOARD_LABEL, BOARD_STATUSES, type BoardItem, type BoardStatus } from "./board";

const DAY = 86_400_000;

/** 状态在求职流程里的先后：用来算“走到了哪一步”。未通过不在流程里，单独统计。 */
const STAGE: Record<Exclude<BoardStatus, "rejected">, number> = { todo: 0, applied: 1, written_test: 2, interview: 3, offer: 4 };

export interface FunnelStep {
  status: BoardStatus;
  label: string;
  /** 当前停在这一步的数量 */
  count: number;
  /** 至少走到过这一步的数量（含更靠后的） */
  reached: number;
}

export interface WeekBucket {
  /** 这一周周一的日期 YYYY-MM-DD */
  start: string;
  label: string;
  count: number;
}

export interface Reminder {
  item: BoardItem;
  kind: "stale" | "todo-old";
  text: string;
}

export interface BoardStats {
  total: number;
  /** 已投出（不含待投递） */
  submitted: number;
  /** 还在流程里：已投递、笔试、面试 */
  active: number;
  offers: number;
  rejected: number;
  /** 投出的里面进入笔试/面试/Offer 的比例；样本不足时为 undefined */
  responseRate?: number;
  /** 面试 → Offer；样本不足时为 undefined */
  offerRate?: number;
  funnel: FunnelStep[];
  weeks: WeekBucket[];
  topCompanies: { company: string; count: number }[];
  reminders: Reminder[];
}

const parseDay = (s: string | null | undefined): number | undefined => {
  if (!s) return undefined;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(t) ? undefined : t;
};

const mondayOf = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 求职看板的统计：漏斗、转化率、近 8 周投递节奏、需要跟进的提醒。纯函数，方便测试。 */
export function boardStats(items: BoardItem[], now = new Date(), weekCount = 8): BoardStats {
  const t0 = now.getTime();
  const rank = (s: BoardStatus) => (s === "rejected" ? -1 : STAGE[s]);

  const funnel: FunnelStep[] = BOARD_STATUSES.filter((s): s is Exclude<BoardStatus, "rejected"> => s !== "rejected").map((s) => ({
    status: s,
    label: BOARD_LABEL[s],
    count: items.filter((i) => i.status === s).length,
    reached: items.filter((i) => rank(i.status) >= STAGE[s]).length,
  }));

  const rejected = items.filter((i) => i.status === "rejected").length;
  const offers = items.filter((i) => i.status === "offer").length;
  const reachedTest = items.filter((i) => rank(i.status) >= STAGE.written_test).length;
  const reachedInterview = items.filter((i) => rank(i.status) >= STAGE.interview).length;
  // 未通过的看不出走到了哪一步，按“投出了但没进笔试”处理；样本太少（<3）不给数
  const submitted = items.filter((i) => i.status !== "todo").length;
  const responseRate = submitted >= 3 ? reachedTest / submitted : undefined;
  const offerRate = reachedInterview >= 2 ? offers / reachedInterview : undefined;

  const firstWeek = mondayOf(t0) - (weekCount - 1) * 7 * DAY;
  const weeks: WeekBucket[] = Array.from({ length: weekCount }, (_, i) => {
    const start = firstWeek + i * 7 * DAY;
    const d = new Date(start);
    return { start: ymd(start), label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 };
  });
  for (const it of items) {
    const t = parseDay(it.applied_at);
    if (t === undefined) continue;
    const idx = Math.round((mondayOf(t) - firstWeek) / (7 * DAY));
    const w = weeks[idx];
    if (w) w.count++;
  }

  const byCompany = new Map<string, number>();
  for (const it of items) if (it.company) byCompany.set(it.company, (byCompany.get(it.company) ?? 0) + 1);
  const topCompanies = [...byCompany]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, 5);

  const reminders: Reminder[] = [];
  for (const it of items) {
    const updated = parseDay(it.updated_at);
    const days = updated === undefined ? 0 : Math.floor((t0 - updated) / DAY);
    if (it.status === "applied" && days >= 14) reminders.push({ item: it, kind: "stale", text: `已投递，${days} 天没有更新：去官网查进度，或更新状态` });
    if (it.status === "todo" && days >= 7) reminders.push({ item: it, kind: "todo-old", text: `放在待投递 ${days} 天了：要投趁早，不投就删掉` });
  }
  reminders.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "stale" ? -1 : 1));

  return {
    total: items.length,
    submitted,
    active: items.filter((i) => i.status === "applied" || i.status === "written_test" || i.status === "interview").length,
    offers,
    rejected,
    responseRate,
    offerRate,
    funnel,
    weeks,
    topCompanies,
    reminders: reminders.slice(0, 6),
  };
}
