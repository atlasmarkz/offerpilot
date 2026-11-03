import { contentDisposition } from "../../../../../lib/attachments";
import { jsonWith, resolveSession, sameOrigin } from "../../../../../lib/auth/session";
import { AuthError, authConfig, userRest, userStorage } from "../../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findRow(id: string, accessToken: string): Promise<{ name: string; path: string } | undefined> {
  // 行级安全保证只能查到自己的记录；id 先校验格式，避免拼进查询的内容被利用
  const res = await userRest(`/attachment?id=eq.${id}&select=name,path&limit=1`, accessToken);
  if (!res.ok) throw new AuthError("读取失败", 502);
  return ((await res.json()) as { name: string; path: string }[])[0];
}

/** 下载我的附件。 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const row = await findRow(ctx.params.id, s.accessToken);
    if (!row) return jsonWith({ error: "没有找到" }, { status: 404, cookies: s.setCookies });
    const f = await userStorage(`/object/authenticated/resumes/${row.path}`, s.accessToken);
    if (!f.ok || !f.body) return jsonWith({ error: "文件读取失败" }, { status: 502, cookies: s.setCookies });
    const headers = new Headers({
      "Content-Type": f.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(row.name),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    for (const c of s.setCookies) headers.append("Set-Cookie", c);
    return new Response(f.body, { headers });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "下载失败" }, { status: 502 });
  }
}

/** 删除我的附件（文件和记录一起删）。 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  if (!authConfig() || !UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到" }, { status: 404 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const row = await findRow(ctx.params.id, s.accessToken);
    if (!row) return jsonWith({ error: "没有找到" }, { status: 404, cookies: s.setCookies });
    const del = await userStorage(`/object/resumes/${row.path}`, s.accessToken, { method: "DELETE" });
    if (!del.ok && del.status !== 404) return jsonWith({ error: "删除文件失败" }, { status: 502, cookies: s.setCookies });
    const r = await userRest(`/attachment?id=eq.${ctx.params.id}`, s.accessToken, { method: "DELETE" });
    if (!r.ok) return jsonWith({ error: "删除记录失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "删除失败" }, { status: 502 });
  }
}
