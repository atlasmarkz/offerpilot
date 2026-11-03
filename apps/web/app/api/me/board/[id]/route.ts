import { BOARD_COLUMNS, BoardPatch, type BoardItem } from "../../../../../lib/board";
import { jsonWith, resolveSession, sameOrigin } from "../../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 修改一条记录（状态、备注等）。 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const parsed = BoardPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return jsonWith({ error: parsed.success ? "没有要修改的内容" : (parsed.error.issues[0]?.message ?? "数据格式不对") }, { status: 400 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/board_item?id=eq.${ctx.params.id}&select=${BOARD_COLUMNS}`, s.accessToken, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...parsed.data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return jsonWith({ error: "修改失败" }, { status: 502, cookies: s.setCookies });
    const [item] = (await res.json()) as BoardItem[];
    if (!item) return jsonWith({ error: "没有找到" }, { status: 404, cookies: s.setCookies });
    return jsonWith({ item }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "修改失败" }, { status: 502 });
  }
}

/** 删除一条记录。 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/board_item?id=eq.${ctx.params.id}`, s.accessToken, { method: "DELETE" });
    if (!res.ok) return jsonWith({ error: "删除失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "删除失败" }, { status: 502 });
  }
}
