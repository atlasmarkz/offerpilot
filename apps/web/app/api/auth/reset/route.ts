import { preflight, failure } from "../../../../lib/auth/routeKit";
import { setPassword, validatePassword, verifyCode } from "../../../../lib/auth/passwordAuth";
import { jsonWith, sessionCookies } from "../../../../lib/auth/session";
import { authVerifyLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 重设密码：邮箱 + 验证码 + 新密码。成功后用新密码直接登录。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authVerifyLimiter());
  if (ctx instanceof Response) return ctx;
  const code = typeof ctx.body.code === "string" ? ctx.body.code.trim() : "";
  if (!/^\d{4,10}$/.test(code)) return jsonWith({ error: "请输入邮件里的数字验证码" }, { status: 400 });
  const bad = validatePassword(ctx.body.password);
  if (bad) return jsonWith({ error: bad }, { status: 400 });
  try {
    const t = await verifyCode("recovery", ctx.email, code);
    await setPassword(t.accessToken, ctx.body.password as string);
    return jsonWith({ user: t.user }, { cookies: sessionCookies(t) });
  } catch (e) {
    return failure(e);
  }
}
