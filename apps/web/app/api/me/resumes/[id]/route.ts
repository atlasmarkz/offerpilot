import { jsonWith, resolveSession, sameOrigin } from "../../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../../lib/auth/supabaseAuth";
import { cleanName, parseResumeBody, RESUME_DOC_COLUMNS, toDoc } from "../../../../../lib/resumeDocs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 改名或保存内容（整份覆盖这一份）。 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { name?: unknown; resume?: unknown };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return jsonWith({ error: "名称不能为空" }, { status: 400 });
    patch.name = name;
  }
  if (body.resume !== undefined) {
    const parsed = parseResumeBody(body.resume);
    if ("error" in parsed) return jsonWith({ error: parsed.error }, { status: parsed.status });
    patch.data = parsed.data;
  }
  if (Object.keys(patch).length === 1) return jsonWith({ error: "没有要修改的内容" }, { status: 400 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/resume_doc?id=eq.${ctx.params.id}&select=${RESUME_DOC_COLUMNS}`, s.accessToken, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return jsonWith({ error: "保存失败" }, { status: 502, cookies: s.setCookies });
    const [row] = (await res.json()) as { id: string; name: string; data: unknown; updated_at: string }[];
    if (!row) return jsonWith({ error: "没有找到" }, { status: 404, cookies: s.setCookies });
    return jsonWith({ item: toDoc(row) }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "保存失败" }, { status: 502 });
  }
}

/** 删除一份简历。 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/resume_doc?id=eq.${ctx.params.id}`, s.accessToken, { method: "DELETE" });
    if (!res.ok) return jsonWith({ error: "删除失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "删除失败" }, { status: 502 });
  }
}
