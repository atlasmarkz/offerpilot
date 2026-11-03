import { clearCookies, jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, userRest, userStorage } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 删除我的账号和云端数据（调用数据库里的 delete_my_account，只能删自己）。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    // 先删存储里的附件文件（直接删数据库行不会清掉文件本身），再删账号
    const att = await userRest("/attachment?select=path", s.accessToken);
    if (att.ok) {
      for (const { path } of (await att.json()) as { path: string }[])
        await userStorage(`/object/resumes/${path}`, s.accessToken, { method: "DELETE" }).catch(() => {});
    }
    const res = await userRest("/rpc/delete_my_account", s.accessToken, { method: "POST", body: "{}" });
    if (!res.ok) return jsonWith({ error: "删除失败，请稍后重试" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true }, { cookies: clearCookies() });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "删除失败" }, { status: 502 });
  }
}
