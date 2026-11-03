import { preflight, failure, timed } from "../../../../lib/auth/routeKit";
import { signUp, validatePassword } from "../../../../lib/auth/passwordAuth";
import { jsonWith } from "../../../../lib/auth/session";
import { authSendLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 注册：邮箱 + 密码，并给邮箱发验证码做验证（验证通过才算注册完成）。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authSendLimiter());
  if (ctx instanceof Response) return ctx;
  const bad = validatePassword(ctx.body.password);
  if (bad) return jsonWith({ error: bad }, { status: 400 });
  try {
    const [, headers] = await timed(() => signUp(ctx.email, ctx.body.password as string));
    return jsonWith({ ok: true }, { headers });
  } catch (e) {
    return failure(e);
  }
}
