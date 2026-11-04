import { PLANS } from "@offerpilot/shared";
import { billingEnabled } from "./billing/billing";
import { loadPlan } from "./billing/plan";
import { AuthError, pgReason, userRest } from "./auth/supabaseAuth";
import { normalizeResume, withinSize, type ResumeData } from "./resumeData";

export const RESUME_DOC_COLUMNS = "id,name,data,updated_at";

export interface ResumeDocRow {
  id: string;
  name: string;
  data: ResumeData;
  updatedAt: string;
}

export const cleanName = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const n = v.replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
  return n || undefined;
};

export const toDoc = (r: { id: string; name: string; data: unknown; updated_at: string }): ResumeDocRow => ({
  id: r.id,
  name: r.name,
  data: normalizeResume(r.data),
  updatedAt: r.updated_at,
});

/** 不收费（自托管）时按最高档；收费时按当前会员等级。 */
export async function maxResumes(accessToken: string): Promise<{ max: number; plan: string }> {
  if (!billingEnabled()) return { max: PLANS.pro.resumes, plan: "pro" };
  const p = await loadPlan(accessToken);
  return { max: PLANS[p.plan].resumes, plan: p.plan };
}

export async function listDocs(accessToken: string): Promise<ResumeDocRow[]> {
  const res = await userRest(`/resume_doc?select=${RESUME_DOC_COLUMNS}&order=created_at.asc`, accessToken);
  if (!res.ok) {
    const why = await pgReason(res);
    throw new AuthError(`读取简历失败${why ? `：${why}` : ""}`, 502);
  }
  return ((await res.json()) as { id: string; name: string; data: unknown; updated_at: string }[]).map(toDoc);
}

/** 校验并规整请求里的简历内容；不合格返回给用户看的错误。 */
export function parseResumeBody(raw: unknown): { data: ResumeData } | { error: string; status: number } {
  const data = normalizeResume(raw);
  if (!withinSize(data)) return { error: "简历内容过大", status: 413 };
  return { data };
}
