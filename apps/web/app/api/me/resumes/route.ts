import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../lib/auth/supabaseAuth";
import { emptyResume } from "../../../../lib/resumeData";
import { cleanName, listDocs, maxResumes, parseResumeBody, RESUME_DOC_COLUMNS, toDoc } from "../../../../lib/resumeDocs";

export const dynamic = "force-dynamic";

/** 我的在线简历列表（含内容）和份数上限。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const [items, { max, plan }] = await Promise.all([listDocs(s.accessToken), maxResumes(s.accessToken)]);
    return jsonWith({ items, max, plan }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/** 新建一份简历（可带内容，如从旧数据迁移）。份数受会员等级限制，数据库触发器兜底。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { name?: unknown; resume?: unknown };
  const parsed = body.resume ? parseResumeBody(body.resume) : { data: emptyResume() };
  if ("error" in parsed) return jsonWith({ error: parsed.error }, { status: parsed.status });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const { max } = await maxResumes(s.accessToken);
    const res = await userRest(`/resume_doc?select=${RESUME_DOC_COLUMNS}`, s.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: s.user.id, name: cleanName(body.name) ?? "新简历", data: parsed.data }),
    });
    if (!res.ok) {
      const limit = (await res.text().catch(() => "")).includes("resume_limit");
      return jsonWith(
        { error: limit ? `简历份数已达当前等级的上限（${max} 份），升级会员可建更多` : "新建失败", code: limit ? "limit" : undefined },
        { status: limit ? 403 : 502, cookies: s.setCookies },
      );
    }
    const [row] = (await res.json()) as { id: string; name: string; data: unknown; updated_at: string }[];
    return jsonWith({ item: toDoc(row!) }, { status: 201, cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "新建失败" }, { status: 502 });
  }
}
