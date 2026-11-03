import { preflight, failure, timed } from "../../../../lib/auth/routeKit";
import { recover } from "../../../../lib/auth/passwordAuth";
import { jsonWith } from "../../../../lib/auth/session";
import { authSendLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 忘记密码：给邮箱发验证码。不管邮箱是否注册过都返回成功，避免被用来探测账号。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authSendLimiter());
  if (ctx instanceof Response) return ctx;
  try {
    const [, headers] = await timed(() => recover(ctx.email));
    return jsonWith({ ok: true }, { headers });
  } catch (e) {
    return failure(e);
  }
}
