import { billingEnabled, summarizeUsage } from "../../../../lib/billing/billing";
import { jsonWith, resolveSession } from "../../../../lib/auth/session";
import { authConfig, userRest } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

interface SubRow {
  plan: string;
  quota: number;
  used: number;
  period_end: string | null;
}

/** 我的额度：订阅剩余 + 次数包。用我自己的令牌读，行级安全保证只能读到自己的。 */
export async function GET(req: Request) {
  if (!authConfig() || !billingEnabled()) return jsonWith({ billing: false });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const [sub, wallet] = await Promise.all([
      userRest("/subscription?select=plan,quota,used,period_end&limit=1", s.accessToken),
      userRest("/wallet?select=credits&limit=1", s.accessToken),
    ]);
    const subRow = sub.ok ? ((await sub.json()) as SubRow[])[0] : undefined;
    const credits = wallet.ok ? ((await wallet.json()) as { credits: number }[])[0]?.credits : 0;
    return jsonWith(summarizeUsage(subRow, credits), { cookies: s.setCookies });
  } catch {
    return jsonWith({ error: "读取额度失败" }, { status: 502 });
  }
}
