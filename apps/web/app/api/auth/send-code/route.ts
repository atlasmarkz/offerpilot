import { clientIp, authSendLimiter } from "../../../../lib/rateLimit";
import { jsonWith, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, normalizeEmail, sendOtp } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 给邮箱发登录验证码。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return jsonWith({ error: "请输入正确的邮箱地址" }, { status: 400 });

  const limited = authSendLimiter().check(clientIp(req));
  if (limited) return jsonWith({ error: limited }, { status: 429 });

  try {
    await sendOtp(email);
    return jsonWith({ ok: true });
  } catch (e) {
    const err = e instanceof AuthError ? e : new AuthError("发送失败，请稍后重试", 502);
    return jsonWith({ error: err.message }, { status: err.status });
  }
}
