import { clientIp, authVerifyLimiter } from "../../../../lib/rateLimit";
import { jsonWith, sameOrigin, sessionCookies } from "../../../../lib/auth/session";
import { AuthError, authConfig, normalizeEmail, verifyOtp } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 用邮箱 + 验证码登录：成功后把令牌写进 httpOnly Cookie，页面脚本拿不到令牌。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email) return jsonWith({ error: "请输入正确的邮箱地址" }, { status: 400 });
  if (!/^\d{6,8}$/.test(code)) return jsonWith({ error: "请输入邮件里的 6 位数字验证码" }, { status: 400 });

  const limited = authVerifyLimiter().check(clientIp(req));
  if (limited) return jsonWith({ error: limited }, { status: 429 });

  try {
    const t = await verifyOtp(email, code);
    return jsonWith({ user: t.user }, { cookies: sessionCookies(t) });
  } catch (e) {
    const err = e instanceof AuthError ? e : new AuthError("登录失败，请重试", 502);
    return jsonWith({ error: err.message }, { status: err.status });
  }
}
