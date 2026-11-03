import { preflight, failure, timed } from "../../../../lib/auth/routeKit";
import { recover, resendSignup } from "../../../../lib/auth/passwordAuth";
import { jsonWith } from "../../../../lib/auth/session";
import { authSendLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

/** 重发验证码：注册确认（signup）或找回密码（recovery）。 */
export async function POST(req: Request) {
  const ctx = await preflight(req, authSendLimiter());
  if (ctx instanceof Response) return ctx;
  const kind = ctx.body.kind === "recovery" ? "recovery" : "signup";
  try {
    const [, headers] = await timed(() => (kind === "recovery" ? recover(ctx.email) : resendSignup(ctx.email)));
    return jsonWith({ ok: true }, { headers });
  } catch (e) {
    return failure(e);
  }
}
