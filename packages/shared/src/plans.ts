/**
 * 会员等级与权益：网页端、管理员命令、数据库触发器里的数字都以这里为准（数据库里的附件上限要同步改 0005 迁移）。
 * 价格不在这里写死：定价由运营决定，页面上显示“价格待定 / 联系开通”，支付接入后再填。
 */
export type PlanId = "free" | "basic" | "plus" | "pro";

export interface PlanFeature {
  text: string;
  /** 还没做完的功能，页面上标“即将推出” */
  soon?: boolean;
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  /** 每个周期的 AI 次数（简历解析、修改建议等共用）。免费版是每个自然月 3 次（数据库 0006 里同样写了 3，要一起改），用完可买次数包或自带模型 */
  monthlyQuota: number;
  /** 附件简历个数上限 */
  attachments: number;
  /** 投递看板里最多放多少条 */
  boardItems: number;
  features: PlanFeature[];
}

export const PLAN_ORDER: PlanId[] = ["free", "basic", "plus", "pro"];

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "免费版",
    tagline: "先把岗位筛清楚",
    monthlyQuota: 3,
    attachments: 1,
    boardItems: 20,
    features: [
      { text: "全网校招 / 实习岗位检索与硬条件筛选" },
      { text: "画像与已选岗位云端同步" },
      { text: "浏览器扩展基础填表" },
      { text: "简历在线编辑与导出 PDF" },
      { text: "1 份附件简历" },
      { text: "投递看板（最多 20 条）" },
      { text: "每月 3 次 AI（简历解析、修改建议）" },
      { text: "自带大模型 Key 使用 AI 功能，不限次数" },
    ],
  },
  basic: {
    id: "basic",
    name: "基础版",
    tagline: "开始用 AI 打磨简历",
    monthlyQuota: 30,
    attachments: 3,
    boardItems: 100,
    features: [
      { text: "每月 30 次 AI（简历解析 + 修改建议）" },
      { text: "最多 3 份附件简历" },
      { text: "投递看板（最多 100 条）" },
      { text: "岗位提醒（最多 5 条订阅）", soon: true },
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "针对每个岗位定制投递",
    monthlyQuota: 100,
    attachments: 3,
    boardItems: 300,
    features: [
      { text: "包含基础版全部权益" },
      { text: "每月 100 次 AI" },
      { text: "针对岗位定制简历（先出草稿再自检，不编造）", soon: true },
      { text: "简答题 / 自我介绍草稿", soon: true },
      { text: "岗位提醒（最多 20 条订阅）", soon: true },
      { text: "投递看板（最多 300 条）" },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "求职季的全套工具",
    monthlyQuota: 300,
    attachments: 3,
    boardItems: 1000,
    features: [
      { text: "包含 Plus 全部权益" },
      { text: "每月 300 次 AI" },
      { text: "面试准备：按岗位生成高频问题和思路", soon: true },
      { text: "岗位匹配深度分析与差距建议", soon: true },
      { text: "岗位提醒不限条数", soon: true },
      { text: "优先客服与新功能抢先用" },
    ],
  },
};

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;

/** 把数据库里的 plan 字符串变成合法等级；认不出的当免费。 */
export const planOf = (v: unknown): PlanId => (isPlanId(v) ? v : "free");
