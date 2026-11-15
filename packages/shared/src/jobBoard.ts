import { z } from "zod";

/** 招聘平台（官网投递不在这里，官网走投递看板 board_item）。 */
export const CHANNELS = ["boss", "liepin"] as const;
export const Channel = z.enum(CHANNELS);
export type Channel = z.infer<typeof Channel>;
export const CHANNEL_LABEL: Record<Channel | "official", string> = { official: "官网", boss: "Boss直聘", liepin: "猎聘" };

/** 平台投递记录的状态：从打招呼开始，到 Offer / 未通过结束。 */
export const APPLY_STATUSES = ["greeted", "replied", "resume_sent", "interview", "offer", "rejected"] as const;
export const ApplyStatus = z.enum(APPLY_STATUSES);
export type ApplyStatus = z.infer<typeof ApplyStatus>;
export const APPLY_STATUS_LABEL: Record<ApplyStatus, string> = {
  greeted: "已投递",
  replied: "HR 已回复",
  resume_sent: "已发简历",
  interview: "面试",
  offer: "Offer",
  rejected: "未通过",
};

/** 平台上读到的一个职位（适配器从页面里读出来的统一结构）。 */
export interface BoardJob {
  channel: Channel;
  /** 平台职位 id，用于去重 */
  externalId: string;
  title: string;
  company: string;
  city?: string;
  /** 页面上的原始薪资文字，如“15-25K·14薪”“200-300元/天” */
  salary?: string;
  /** 公司规模、行业等标签 */
  tags?: string[];
  /** 职位描述（详情页才有） */
  description?: string;
  /** HR 活跃度文字，如“刚刚活跃”“3日内活跃”“半年前活跃” */
  hrActive?: string;
  /** 招聘者的职位，如“人事经理”“猎头顾问”（详情页才有） */
  recruiter?: string;
  url: string;
}

/** 一条平台投递记录：扩展本机保存，网页端打开看板时同步到云端。 */
export const ApplyRecord = z.object({
  channel: Channel,
  external_id: z.string().trim().min(1).max(80),
  company: z.string().trim().max(80).default(""),
  title: z.string().trim().min(1).max(200),
  city: z.string().trim().max(40).default(""),
  salary: z.string().trim().max(40).default(""),
  url: z
    .string()
    .max(500)
    .refine((u) => u === "" || /^https:\/\//i.test(u), "链接要以 https:// 开头")
    .default(""),
  status: ApplyStatus.default("greeted"),
  applied_at: z.string().datetime({ offset: true }),
});
export type ApplyRecord = z.infer<typeof ApplyRecord>;

/** 自动投递的筛选条件（用户在扩展里设置）。 */
export const ScreenRules = z.object({
  /** 岗位名至少包含其一（空表示不限） */
  titleInclude: z.array(z.string()).default([]),
  /** 岗位名 / 描述包含其一就跳过，如“销售”“外包”“驻场” */
  exclude: z.array(z.string()).default([]),
  /** 公司黑名单：公司名包含其一就跳过 */
  companyBlacklist: z.array(z.string()).default([]),
  /** 招聘者黑名单：招聘者职位包含其一就跳过，如“猎头”（借鉴 get_jobs） */
  recruiterBlacklist: z.array(z.string()).default([]),
  /** 意向城市（空表示不限） */
  cities: z.array(z.string()).default([]),
  /** 月薪下限（K）；实习按天薪时用 dailyMin。0 表示不限 */
  monthlyMinK: z.number().min(0).max(500).default(0),
  /** 实习日薪下限（元）。0 表示不限 */
  dailyMin: z.number().min(0).max(5000).default(0),
  /** 跳过 HR 很久没活跃的职位 */
  skipInactiveHr: z.boolean().default(true),
  /** 跳过疑似外包 / 人力派遣 */
  skipOutsourcing: z.boolean().default(true),
});
export type ScreenRules = z.infer<typeof ScreenRules>;

export interface ScreenResult {
  pass: boolean;
  /** 不通过的原因（给用户看的中文） */
  reasons: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const hits = (text: string, words: string[]) => words.map((w) => w.trim()).filter((w) => w && norm(text).includes(norm(w)));

export interface Salary {
  /** 月薪区间（K）；日薪时为空 */
  monthlyK?: [number, number];
  /** 日薪区间（元） */
  daily?: [number, number];
}

/** 解析平台薪资文字：15-25K·14薪、8千-1.2万、200-300元/天、面议。读不懂返回 {}，视为不限。 */
export function parseSalary(text: string | undefined): Salary {
  if (!text) return {};
  const t = text.replace(/\s+/g, "");
  const day = t.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?元\/(?:天|日)/);
  if (day) {
    const lo = Number(day[1]);
    return { daily: [lo, Number(day[2] ?? lo)] };
  }
  const k = t.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?[kK]/);
  if (k) {
    const lo = Number(k[1]);
    return { monthlyK: [lo, Number(k[2] ?? lo)] };
  }
  // 猎聘常见“8千-1.2万”“1-1.5万”
  const toK = (n: string, unit: string | undefined) => Number(n) * (unit === "万" ? 10 : 1);
  const cn = t.match(/(\d+(?:\.\d+)?)(千|万)?-(\d+(?:\.\d+)?)(千|万)/);
  if (cn) return { monthlyK: [toK(cn[1]!, cn[2] ?? cn[4]), toK(cn[3]!, cn[4])] };
  return {};
}

/** 外包 / 派遣的常见说法：出现一次只提示，出现两次或命中强词才认定（借鉴“黑名单 + 关键词计数”的思路）。 */
const OUTSOURCING_STRONG = ["外包", "人力外派", "劳务派遣", "驻场开发"];
const OUTSOURCING_WEAK = ["驻场", "派遣", "外派", "项目制", "甲方", "人力资源服务", "人力资源有限公司", "软件外包", "服务外包"];

export function looksOutsourced(job: Pick<BoardJob, "title" | "company" | "description" | "tags">): boolean {
  const text = [job.title, job.company, job.description ?? "", ...(job.tags ?? [])].join(" ");
  if (hits(text, OUTSOURCING_STRONG).length) return true;
  return hits(text, OUTSOURCING_WEAK).length >= 2;
}

/**
 * HR 活跃度：只认“刚刚 / 今日 / 3 日内 / 本周”这类；“本月”“半年前”以及任何带“年”的（如“2年前活跃”“今年活跃”，
 * get_jobs 的经验）算不活跃。读不到算活跃（不因为缺信息误杀）。
 */
export function hrInactive(text: string | undefined): boolean {
  if (!text) return false;
  if (/年/.test(text)) return true;
  if (/刚刚|在线|今日|今天|昨日|[1-3]日内|本周|7日内/.test(text)) return false;
  return /本月|[2-9]周内|月内|月前|周前/.test(text);
}

/**
 * 自动投递的筛选流水线：按顺序检查，收集所有不通过的原因（方便用户调规则）。
 * `applied` 是已经投过的 externalId，用来去重。
 */
export function screenJob(job: BoardJob, rules: ScreenRules, applied: ReadonlySet<string> = new Set()): ScreenResult {
  const reasons: string[] = [];
  if (applied.has(`${job.channel}:${job.externalId}`)) reasons.push("已经投过");

  if (rules.titleInclude.length && !hits(job.title, rules.titleInclude).length) reasons.push("岗位名不含关键词");
  const ex = hits([job.title, job.description ?? ""].join(" "), rules.exclude);
  if (ex.length) reasons.push(`含排除词：${ex.join("、")}`);

  const black = hits(job.company, rules.companyBlacklist);
  if (black.length) reasons.push("公司在黑名单里");
  if (job.recruiter && hits(job.recruiter, rules.recruiterBlacklist).length) reasons.push(`招聘者是${job.recruiter}`);
  if (rules.skipOutsourcing && looksOutsourced(job)) reasons.push("疑似外包 / 派遣");

  if (rules.cities.length && job.city && !rules.cities.some((c) => job.city!.includes(c))) reasons.push("城市不符");

  const sal = parseSalary(job.salary);
  if (rules.monthlyMinK > 0 && sal.monthlyK && sal.monthlyK[1] < rules.monthlyMinK) reasons.push("薪资低于下限");
  if (rules.dailyMin > 0 && sal.daily && sal.daily[1] < rules.dailyMin) reasons.push("日薪低于下限");

  if (rules.skipInactiveHr && hrInactive(job.hrActive)) reasons.push("HR 很久没活跃");

  return { pass: reasons.length === 0, reasons };
}

/**
 * 招呼语模板：只替换 {公司} {岗位} {学校} {专业} {届别} {技能} 这些变量，变量没有值就去掉所在的那一句，
 * 不会凭空编内容。长度截到平台限制以内。
 */
export function renderGreeting(template: string, vars: Partial<Record<"公司" | "岗位" | "学校" | "专业" | "届别" | "技能", string>>, max = 200): string {
  const sentences = template.split(/(?<=[。！？!?\n])/);
  const out = sentences
    .map((s) => {
      let missing = false;
      const filled = s.replace(/\{(公司|岗位|学校|专业|届别|技能)\}/g, (_, k: keyof typeof vars) => {
        const v = vars[k]?.trim();
        if (!v) missing = true;
        return v ?? "";
      });
      return missing ? "" : filled;
    })
    .join("")
    .trim();
  return out.length > max ? out.slice(0, max) : out;
}

export const DEFAULT_GREETING =
  "您好，我是{学校}{专业}专业的{届别}届学生。看到贵司的{岗位}岗位很感兴趣。我熟悉{技能}，可以尽快到岗，希望有机会进一步沟通，谢谢！";
