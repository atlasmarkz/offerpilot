import { jsonWith, resolveSession } from "../../../../lib/auth/session";
import { authConfig } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 当前登录状态；没配账号功能时 enabled 为 false，页面就不显示登录入口。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ enabled: false, user: null });
  try {
    const s = await resolveSession(req);
    return jsonWith({ enabled: true, user: s?.user ?? null }, { cookies: s?.setCookies });
  } catch {
    return jsonWith({ enabled: true, user: null });
  }
}
