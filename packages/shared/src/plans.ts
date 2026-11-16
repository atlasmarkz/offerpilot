/**
 * 会员等级、权益和价格：网页端、支付、管理员命令、数据库触发器里的数字都以这里为准
 * （数据库里的附件上限要同步改 0005 迁移）。价格单位是“分”，避免小数误差。
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
  /** 在线简历份数上限（扩展里可选择用哪一份填表；数据库 0007 里同样写了，要一起改） */
  resumes: number;
  /** 投递看板里最多放多少条 */
  boardItems: number;
  /** 价格（分）：月付 30 天；季卡 90 天、额度是三个月合计，可以集中在求职高峰用。免费版没有 */
  price?: { monthFen: number; seasonFen: number };
  features: PlanFeature[];
}

export const PLAN_ORDER: PlanId[] = ["free", "basic", "plus", "pro"];

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "免费版",
    tagline: "先把投递管起来",
    monthlyQuota: 3,
    attachments: 1,
    resumes: 1,
    boardItems: 20,
    features: [
      { text: "34 家公司校招 / 实习岗位，按硬条件筛选，每天更新" },
      { text: "浏览器扩展：官网投递一键填表（只填不提交）" },
      { text: "投递进度看板（最多 20 条）+ 投递总览" },
      { text: "Boss直聘自动投递（每日上限、随机间隔、遇验证码即停）", soon: true },
      { text: "1 份在线简历，每月 3 次 AI" },
      { text: "自带大模型 Key 使用 AI 功能，不限次数" },
    ],
  },
  basic: {
    id: "basic",
    name: "基础版",
    tagline: "投递多了，看板放得下",
    monthlyQuota: 30,
    attachments: 3,
    resumes: 3,
    boardItems: 100,
    price: { monthFen: 990, seasonFen: 2490 },
    features: [
      { text: "投递进度看板（最多 100 条）" },
      { text: "最多 3 份在线简历，扩展里按岗位选用哪份填表" },
      { text: "最多 3 份附件简历" },
      { text: "每月 30 次 AI（匹配度评估、简历建议等）" },
      { text: "新岗位提醒（最多 5 条订阅）", soon: true },
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "求职季主力投递",
    monthlyQuota: 100,
    attachments: 3,
    resumes: 3,
    boardItems: 300,
    price: { monthFen: 1990, seasonFen: 4900 },
    features: [
      { text: "包含基础版全部权益" },
      { text: "投递进度看板（最多 300 条）" },
      { text: "每月 100 次 AI" },
      { text: "按岗位定制简历（只重排改写，不编造）" },
      { text: "新岗位提醒（最多 20 条订阅）", soon: true },
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "海投也能管得清",
    monthlyQuota: 300,
    attachments: 3,
    resumes: 3,
    boardItems: 1000,
    price: { monthFen: 3900, seasonFen: 9900 },
    features: [
      { text: "包含 Plus 全部权益" },
      { text: "投递进度看板（最多 1000 条）" },
      { text: "每月 300 次 AI" },
      { text: "面试准备：按岗位生成高频问题", soon: true },
      { text: "新岗位提醒不限条数", soon: true },
    ],
  },
};

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;

/** 把数据库里的 plan 字符串变成合法等级；认不出的当免费。 */
export const planOf = (v: unknown): PlanId => (isPlanId(v) ? v : "free");

/** 可购买的商品：各等级的月付 / 季卡，以及次数包。下单时金额只认这里，不认前端传来的。 */
export type ProductId = "basic-month" | "basic-season" | "plus-month" | "plus-season" | "pro-month" | "pro-season" | "credits-20";

export interface Product {
  id: ProductId;
  name: string;
  priceFen: number;
  /** subscription：开通 / 续期会员；credits：次数包（不过期） */
  kind: "subscription" | "credits";
  plan?: Exclude<PlanId, "free">;
  /** 会员天数 */
  days?: number;
  /** 这一单带来的 AI 次数（会员：本期额度；次数包：次数） */
  units: number;
}

export const CREDIT_PACK = { units: 20, priceFen: 490 } as const;

function planProducts(plan: Exclude<PlanId, "free">): Product[] {
  const p = PLANS[plan];
  return [
    { id: `${plan}-month` as ProductId, name: `${p.name} 月付`, priceFen: p.price!.monthFen, kind: "subscription", plan, days: 30, units: p.monthlyQuota },
    { id: `${plan}-season` as ProductId, name: `${p.name} 求职季卡（3 个月）`, priceFen: p.price!.seasonFen, kind: "subscription", plan, days: 90, units: p.monthlyQuota * 3 },
  ];
}

export const PRODUCTS: Product[] = [
  ...planProducts("basic"),
  ...planProducts("plus"),
  ...planProducts("pro"),
  { id: "credits-20", name: `次数包 ${CREDIT_PACK.units} 次`, priceFen: CREDIT_PACK.priceFen, kind: "credits", units: CREDIT_PACK.units },
];

export const productOf = (id: unknown): Product | undefined => PRODUCTS.find((p) => p.id === id);

/** 分 → “9.9”“19.9”“49”（展示用，去掉多余的 0）。 */
export function yuan(fen: number): string {
  return (fen / 100).toFixed(2).replace(/\.?0+$/, "");
}
