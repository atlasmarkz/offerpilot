import { APPLICATION_COLUMNS, ApplicationUpload, type Application } from "../../../../lib/applications";
import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, pgReason, userRest } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 我在各招聘平台的投递记录（最近 2000 条）。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/application?select=${APPLICATION_COLUMNS}&order=applied_at.desc&limit=2000`, s.accessToken);
    if (!res.ok) {
      const why = await pgReason(res);
      return jsonWith({ error: `读取投递记录失败${why ? `：${why}` : ""}` }, { status: 502, cookies: s.setCookies });
    }
    return jsonWith({ items: (await res.json()) as Application[] }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/**
 * 上传扩展本机的投递记录。已存在的（同平台同职位）忽略，不会覆盖你在网页上改过的状态，所以重复上传是安全的。
 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const parsed = ApplicationUpload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonWith({ error: parsed.error.issues[0]?.message ?? "数据格式不对" }, { status: 400 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const rows = parsed.data.items.map((r) => ({ ...r, user_id: s.user.id }));
    const res = await userRest("/application?on_conflict=user_id,channel,external_id", s.accessToken, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const limit = (await res.text().catch(() => "")).includes("application_limit");
      return jsonWith(
        { error: limit ? "投递记录已达 5000 条上限，请先删除一些旧记录" : "同步投递记录失败", code: limit ? "limit" : undefined },
        { status: limit ? 403 : 502, cookies: s.setCookies },
      );
    }
    return jsonWith({ ok: true, received: rows.length }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "同步失败" }, { status: 502 });
  }
}
