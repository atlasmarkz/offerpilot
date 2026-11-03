import { preflight, failure } from "../../../../lib/auth/routeKit";
import { verifyCode } from "../../../../lib/auth/passwordAuth";
import { jsonWith, sessionCookies } from "../../../../lib/auth/session";
import { authVerifyLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 注册验证：输入邮件里的验证码，通过后账号生效并直接登录（令牌写进 httpOnly Cookie）。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authVerifyLimiter());
  if (ctx instanceof Response) return ctx;
  const code = typeof ctx.body.code === "string" ? ctx.body.code.trim() : "";
  // 位数由 Supabase 项目设置决定（可能是 6 位也可能是 8 位），这里只要求是 4~10 位数字
  if (!/^\d{4,10}$/.test(code)) return jsonWith({ error: "请输入邮件里的数字验证码" }, { status: 400 });
  try {
    const t = await verifyCode("signup", ctx.email, code);
    return jsonWith({ user: t.user }, { cookies: sessionCookies(t) });
  } catch (e) {
    return failure(e);
  }
}
