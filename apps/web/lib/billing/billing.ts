import { randomUUID } from "node:crypto";
import { PLANS, planOf, type PlanId } from "@offerpilot/shared";
import { authHeaders, supabaseOrigin } from "../jobsSource";

/** 会消耗额度的功能。每次调用扣多少次，集中放在这里，调价只改这一处。 */
export type Feature = "resume_parse" | "resume_suggest" | "resume_tailor";
export const UNIT_COST: Record<Feature, number> = { resume_parse: 1, resume_suggest: 1, resume_tailor: 1 };

/** 默认订阅额度取 Plus（每月 100 次）；各等级的额度见 packages/shared 的 PLANS。 */
export const PRO_QUOTA = PLANS.plus.monthlyQuota;

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = "billing",
  ) {
    super(message);
  }
}

/** 托管版计费是否开启：需要 BILLING_ENABLED=1 且配置了服务端密钥。自托管/本地不开，所有功能不计费。 */
export function billingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BILLING_ENABLED === "1" && !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_KEY;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<Response> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new BillingError("计费服务未配置", 503);
  try {
    return await fetch(`${supabaseOrigin(SUPABASE_URL)}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(SUPABASE_SERVICE_KEY.trim()) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BillingError("连接计费服务失败，请稍后重试", 502);
  }
}

export interface Charge {
  requestId: string;
  source: "subscription" | "free" | "credits";
}

/** 扣额度：先用订阅额度，再用次数包。额度不足抛 402。每次调用用新的 requestId，退还时凭它找回。 */
export async function consume(userId: string, feature: Feature): Promise<Charge> {
  const requestId = randomUUID();
  const res = await rpc("consume_units", {
    p_user: userId,
    p_feature: feature,
    p_units: UNIT_COST[feature],
    p_request: requestId,
  });
  if (res.ok) {
    const source = (await res.json()) as Charge["source"];
    return { requestId, source };
  }
  const text = await res.text().catch(() => "");
  if (text.includes("insufficient_quota")) throw new BillingError("本月免费额度已用完，请购买次数包或订阅，也可以在“模型设置”里用自己的模型", 402, "quota");
  throw new BillingError("扣减额度失败，请稍后重试", 502);
}

/** 退还刚扣的额度（大模型调用失败时）。尽力而为：退还失败不影响给用户的错误提示，但会留日志。 */
export async function refund(requestId: string): Promise<void> {
  try {
    const res = await rpc("refund_units", { p_request: requestId });
    if (!res.ok) console.error("[billing] refund failed", requestId, res.status);
  } catch (e) {
    console.error("[billing] refund error", requestId, (e as Error).message);
  }
}

export interface Usage {
  billing: boolean;
  plan: PlanId;
  quota: number;
  used: number;
  remaining: number;
  periodEnd: string | null;
  credits: number;
  /** 该等级的附件简历、看板条数上限 */
  limits: { attachments: number; boardItems: number };
}

interface SubRow {
  plan?: string;
  quota?: number;
  used?: number;
  period_end?: string | null;
}

/** 把订阅行和钱包行整理成前端要显示的用量；订阅过期当作没订阅。 */
export function summarizeUsage(sub: SubRow | undefined, credits: number | undefined, now = new Date(), freeUsed = 0): Usage {
  const active = !!sub && sub.plan !== "free" && !!sub.period_end && new Date(sub.period_end) > now;
  const plan = active ? planOf(sub?.plan) : "free";
  // 订阅有效：用订阅额度；否则是免费版的每月小额度（freeUsed 是本月已用）
  const quota = active ? Number(sub?.quota ?? 0) : PLANS.free.monthlyQuota;
  const used = active ? Number(sub?.used ?? 0) : freeUsed;
  return {
    billing: true,
    plan,
    limits: { attachments: PLANS[plan].attachments, boardItems: PLANS[plan].boardItems },
    quota,
    used,
    remaining: Math.max(quota - used, 0),
    periodEnd: active ? (sub?.period_end ?? null) : null,
    credits: Math.max(Number(credits ?? 0), 0),
  };
}
