import { preflight, failure } from "../../../../lib/auth/routeKit";
import { passwordLogin } from "../../../../lib/auth/passwordAuth";
import { jsonWith, sessionCookies } from "../../../../lib/auth/session";
import { authLoginLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 邮箱 + 密码登录。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authLoginLimiter());
  if (ctx instanceof Response) return ctx;
  const password = ctx.body.password;
  if (typeof password !== "string" || !password || password.length > 200) return jsonWith({ error: "请输入密码" }, { status: 400 });
  try {
    const t = await passwordLogin(ctx.email, password);
    return jsonWith({ user: t.user }, { cookies: sessionCookies(t) });
  } catch (e) {
    return failure(e);
  }
}
