import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../lib/auth/supabaseAuth";
import { normalizeResume, withinSize } from "../../../../lib/resumeData";

export const dynamic = "force-dynamic";

/** 读取我云端保存的那一份最新简历。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest("/resume?select=data,updated_at&limit=1", s.accessToken);
    if (!res.ok) return jsonWith({ error: "读取失败" }, { status: 502, cookies: s.setCookies });
    const rows = (await res.json()) as { data: unknown; updated_at: string }[];
    const r = rows[0];
    return jsonWith({ resume: r ? normalizeResume(r.data) : null, updatedAt: r?.updated_at ?? null }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/** 保存：整份覆盖，云端永远只有最新一份。 */
export async function PUT(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { resume?: unknown } | null;
  if (!body?.resume) return jsonWith({ error: "数据格式不对" }, { status: 400 });
  const resume = normalizeResume(body.resume);
  if (!withinSize(resume)) return jsonWith({ error: "简历内容过大" }, { status: 413 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const updatedAt = new Date().toISOString();
    const res = await userRest("/resume?on_conflict=user_id", s.accessToken, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: s.user.id, data: resume, updated_at: updatedAt }),
    });
    if (!res.ok) return jsonWith({ error: "保存失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ ok: true, updatedAt }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "保存失败" }, { status: 502 });
  }
}
