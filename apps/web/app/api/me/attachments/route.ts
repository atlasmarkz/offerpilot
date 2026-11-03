import { randomUUID } from "node:crypto";
import { PLANS } from "@offerpilot/shared";
import { AttachError, checkAttachment, MAX_ATTACHMENT_BYTES } from "../../../../lib/attachments";
import { billingEnabled } from "../../../../lib/billing/billing";
import { loadPlan } from "../../../../lib/billing/plan";
import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, pgReason, userRest, userStorage } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 不收费（自托管）时按最高档的上限；收费时按当前会员等级。 */
async function maxAttachments(accessToken: string): Promise<{ max: number; plan: string }> {
  if (!billingEnabled()) return { max: PLANS.pro.attachments, plan: "pro" };
  const p = await loadPlan(accessToken);
  return { max: p.attachments, plan: p.plan };
}

interface Row {
  id: string;
  name: string;
  size: number;
  created_at: string;
}

async function list(accessToken: string): Promise<Row[]> {
  const res = await userRest("/attachment?select=id,name,size,created_at&order=created_at.asc", accessToken);
  if (!res.ok) {
    const why = await pgReason(res);
    throw new AuthError(`读取附件失败${why ? `：${why}` : ""}`, 502);
  }
  return (await res.json()) as Row[];
}

/** 我的附件简历列表和上限。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const [items, { max, plan }] = await Promise.all([list(s.accessToken), maxAttachments(s.accessToken)]);
    return jsonWith({ items, max, plan }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/** 上传一份附件简历（PDF / docx，≤5MB）。数量受会员等级限制。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonWith({ error: "请选择文件" }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return jsonWith({ error: "文件超过 5MB" }, { status: 413 });

  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkAttachment(file.name, bytes);

    const [items, { max, plan }] = await Promise.all([list(s.accessToken), maxAttachments(s.accessToken)]);
    if (items.length >= max)
      return jsonWith(
        { error: plan === "free" ? `免费版最多 ${max} 份附件简历，升级会员最多可存 3 份` : `已达到上限（${max} 份），请先删除一份`, code: "limit" },
        { status: 403, cookies: s.setCookies },
      );

    // 路径以用户 id 开头：存储策略据此保证只能碰自己的目录
    const path = `${s.user.id}/${randomUUID()}.${checked.ext}`;
    const up = await userStorage(`/object/resumes/${path}`, s.accessToken, {
      method: "POST",
      headers: { "Content-Type": checked.contentType, "x-upsert": "false" },
      body: bytes,
    });
    if (!up.ok) return jsonWith({ error: "上传失败，请稍后重试" }, { status: 502, cookies: s.setCookies });

    const ins = await userRest("/attachment", s.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: s.user.id, name: checked.name, size: bytes.length, path }),
    });
    if (!ins.ok) {
      // 记录没写进去（比如数据库层的数量上限）：把刚传的文件删掉，不留孤儿文件
      await userStorage(`/object/resumes/${path}`, s.accessToken, { method: "DELETE" }).catch(() => {});
      const text = await ins.text().catch(() => "");
      const limit = text.includes("attachment_limit");
      return jsonWith({ error: limit ? "已达到附件数量上限" : "保存附件记录失败", code: limit ? "limit" : undefined }, { status: limit ? 403 : 502, cookies: s.setCookies });
    }
    const [row] = (await ins.json()) as Row[];
    return jsonWith({ item: row }, { status: 201, cookies: s.setCookies });
  } catch (e) {
    if (e instanceof AttachError || e instanceof AuthError) return jsonWith({ error: e.message }, { status: e.status });
    return jsonWith({ error: "上传失败" }, { status: 502 });
  }
}
