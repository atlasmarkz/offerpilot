import { clearCookies, jsonWith, sameOrigin } from "../../../../lib/auth/session";

export const dynamic = "force-dynamic";

/** 退出登录：清掉 Cookie。 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  return jsonWith({ ok: true }, { cookies: clearCookies() });
}
