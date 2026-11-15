import { CHANNELS, DEFAULT_GREETING, ScreenRules, type Channel } from "@offerpilot/shared";
import { z } from "zod";

/** 硬上限：用户怎么调都不能超过（Boss 自身每天约 150 次沟通上限）。 */
export const HARD_DAILY_CAP = 150;
export const MIN_INTERVAL_SEC = 15;

export const AutoApplySettings = z
  .object({
    /** 用户已经勾选“知道自动投递可能违反平台协议、可能被限流或封号” */
    consent: z.boolean().default(false),
    /** 试运行：只筛选不投递。默认开着，第一次先看看会投哪些，确认没问题再关掉 */
    dryRun: z.boolean().default(true),
    /** 开启了哪些平台（开启时才申请该平台的网站权限） */
    channels: z.object(Object.fromEntries(CHANNELS.map((c) => [c, z.boolean().default(false)])) as Record<Channel, z.ZodDefault<z.ZodBoolean>>).default({}),
    /** 每个平台每天最多投多少个 */
    dailyCap: z.number().int().min(1).max(HARD_DAILY_CAP).default(60),
    /** 两次投递之间随机等待的区间（秒） */
    minIntervalSec: z.number().min(MIN_INTERVAL_SEC).max(600).default(30),
    maxIntervalSec: z.number().min(MIN_INTERVAL_SEC).max(900).default(90),
    /** 招呼语模板；留空用平台自己设置的招呼语 */
    greeting: z.string().max(300).default(DEFAULT_GREETING),
    /** 开始时打开的搜索页（用户在平台上搜好、筛好条件后复制过来） */
    searchUrls: z.object(Object.fromEntries(CHANNELS.map((c) => [c, z.string().max(1000).default("")])) as Record<Channel, z.ZodDefault<z.ZodString>>).default({}),
    rules: ScreenRules.default({}),
  })
  .transform((s) => ({ ...s, maxIntervalSec: Math.max(s.maxIntervalSec, s.minIntervalSec) }));
export type AutoApplySettings = z.output<typeof AutoApplySettings>;

/** 读设置：坏数据不报错，退回默认值（并把超出范围的数字夹回范围内）。 */
export function readSettings(raw: unknown): AutoApplySettings {
  const r = AutoApplySettings.safeParse(raw);
  if (r.success) return r.data;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const clamp = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const fixed = {
    ...o,
    dailyCap: clamp(o.dailyCap, 1, HARD_DAILY_CAP),
    minIntervalSec: clamp(o.minIntervalSec, MIN_INTERVAL_SEC, 600),
    maxIntervalSec: clamp(o.maxIntervalSec, MIN_INTERVAL_SEC, 900),
  };
  const again = AutoApplySettings.safeParse(fixed);
  return again.success ? again.data : AutoApplySettings.parse({});
}

/** 运行状态：控制页写 running，页面里的 runner 读它、写回进度。 */
export interface RunState {
  running: boolean;
  channel?: Channel;
  /** 停止原因（给用户看） */
  stopped?: string;
  /** 最近一条动态 */
  last?: string;
  updatedAt?: string;
  /** 正在执行的标签页（防止同一平台开多个标签页时重复投递） */
  owner?: string;
}

/** 今天的本地日期 YYYY-MM-DD（每日上限按本地日期算）。 */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export interface DailyCount {
  date: string;
  counts: Partial<Record<Channel, number>>;
}

export function countToday(raw: unknown, channel: Channel, now = new Date()): number {
  const d = raw as DailyCount | undefined;
  return d && d.date === today(now) ? (d.counts?.[channel] ?? 0) : 0;
}

export function bumpToday(raw: unknown, channel: Channel, now = new Date()): DailyCount {
  const d = raw as DailyCount | undefined;
  const base: DailyCount = d && d.date === today(now) ? { date: d.date, counts: { ...d.counts } } : { date: today(now), counts: {} };
  base.counts[channel] = (base.counts[channel] ?? 0) + 1;
  return base;
}

/** 随机等待时长（毫秒）。 */
export function pickDelay(s: Pick<AutoApplySettings, "minIntervalSec" | "maxIntervalSec">, random = Math.random): number {
  const lo = s.minIntervalSec * 1000;
  const hi = Math.max(lo, s.maxIntervalSec * 1000);
  return Math.round(lo + (hi - lo) * random());
}
