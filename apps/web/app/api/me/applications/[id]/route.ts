import { APPLICATION_COLUMNS, ApplicationPatch, type Application } from "../../../../../lib/applications";
import { jsonWith, resolveSession, sameOrigin } from "../../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 修改一条平台投递记录的状态（HR 回复了、约面试了……）。 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const parsed = ApplicationPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonWith({ error: "数据格式不对" }, { status: 400 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/application?id=eq.${ctx.params.id}&select=${APPLICATION_COLUMNS}`, s.accessToken, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: parsed.data.status, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return jsonWith({ error: "修改失败" }, { status: 502, cookies: s.setCookies });
    const [item] = (await res.json()) as Application[];
    if (!item) return jsonWith({ error: "没有找到" }, { status: 404, cookies: s.setCookies });
    return jsonWith({ item }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "修改失败" }, { status: 502 });
  }
}

/** 删除一条平台投递记录。 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/application?id=eq.${ctx.params.id}`, s.accessToken, { method: "DELETE" });
    if (!res.ok) return jsonWith({ error: "删除失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "删除失败" }, { status: 502 });
  }
}
