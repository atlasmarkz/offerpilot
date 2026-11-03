import { billingEnabled } from "../../../../lib/billing/billing";
import { loadUsage } from "../../../../lib/billing/plan";
import { jsonWith, resolveSession } from "../../../../lib/auth/session";
import { authConfig } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 我的额度和等级。用我自己的令牌读，行级安全保证只能读到自己的。 */
export async function GET(req: Request) {
  if (!authConfig() || !billingEnabled()) return jsonWith({ billing: false });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    return jsonWith(await loadUsage(s.accessToken), { cookies: s.setCookies });
  } catch {
    return jsonWith({ error: "读取额度失败" }, { status: 502 });
  }
}
