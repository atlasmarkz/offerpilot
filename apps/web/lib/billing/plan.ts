import { PLANS, type PlanId } from "@offerpilot/shared";
import { summarizeUsage, type Usage } from "./billing";
import { userRest } from "../auth/supabaseAuth";

/** 用用户自己的令牌读订阅和次数包，得到当前等级和各项上限。 */
export async function loadUsage(accessToken: string): Promise<Usage> {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [sub, wallet, freeLog] = await Promise.all([
    userRest("/subscription?select=plan,quota,used,period_end&limit=1", accessToken),
    userRest("/wallet?select=credits&limit=1", accessToken),
    userRest(`/usage_log?select=units&source=eq.free&status=eq.ok&created_at=gte.${encodeURIComponent(monthStart)}&limit=100`, accessToken),
  ]);
  const subRow = sub.ok
    ? ((await sub.json()) as { plan: string; quota: number; used: number; period_end: string | null }[])[0]
    : undefined;
  const credits = wallet.ok ? ((await wallet.json()) as { credits: number }[])[0]?.credits : 0;
  const freeUsed = freeLog.ok ? ((await freeLog.json()) as { units: number }[]).reduce((n, r) => n + Number(r.units), 0) : 0;
  return summarizeUsage(subRow, credits, new Date(), freeUsed);
}

export async function loadPlan(accessToken: string): Promise<{ plan: PlanId; attachments: number; boardItems: number }> {
  const u = await loadUsage(accessToken);
  return { plan: u.plan, attachments: PLANS[u.plan].attachments, boardItems: PLANS[u.plan].boardItems };
}
