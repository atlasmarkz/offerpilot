import { CloudDataIn, stripSecrets } from "../../../../lib/auth/cloudData";
import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

const unauthorized = () => jsonWith({ error: "请先登录" }, { status: 401 });

/** 读取我的云端数据（没有则 data 为 null）。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return unauthorized();
    // 行级安全保证这里只会查到本人的那一行
    const res = await userRest("/user_data?select=profile,selected,updated_at&limit=1", s.accessToken);
    if (!res.ok) return jsonWith({ error: "读取云端数据失败" }, { status: 502, cookies: s.setCookies });
    const rows = (await res.json()) as { profile: unknown; selected: string[]; updated_at: string }[];
    const r = rows[0];
    return jsonWith(
      { data: r ? { profile: stripSecrets((r.profile ?? {}) as Record<string, unknown>), selected: r.selected, updatedAt: r.updated_at } : null },
      { cookies: s.setCookies },
    );
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/** 保存我的云端数据（整体覆盖）。 */
export async function PUT(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const parsed = CloudDataIn.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonWith({ error: "数据格式不对" }, { status: 400 });

  try {
    const s = await resolveSession(req);
    if (!s) return unauthorized();
    const updatedAt = new Date().toISOString();
    const res = await userRest("/user_data?on_conflict=user_id", s.accessToken, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: s.user.id,
        profile: stripSecrets(parsed.data.profile),
        selected: parsed.data.selected,
        updated_at: updatedAt,
      }),
    });
    if (!res.ok) return jsonWith({ error: "保存到云端失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true, updatedAt }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "保存失败" }, { status: 502 });
  }
}
