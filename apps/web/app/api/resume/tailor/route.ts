import { gate } from "../../../../lib/billing/gate";
import { FitJob } from "../../../../lib/fit";
import { chat, LlmError, parseJsonLoose } from "../../../../lib/llmConfig";
import { normalizeResume, withinSize } from "../../../../lib/resumeData";
import { buildTailorInput, normalizeTailor, TAILOR_SYSTEM_PROMPT } from "../../../../lib/tailor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * 岗位定制简历：返回一份“改动方案”（每处改动单独可选、已做防编造检查），不直接改你的简历。
 * 入参：岗位 + 在线简历的结构化数据（不含联系方式）+ 可选的匹配度评估建议（focus）。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("请求格式不对", 400);
  if (body.consent !== true) return fail("需要先同意把简历内容发送给大模型服务", 400);

  const job = FitJob.safeParse(body.job);
  if (!job.success) return fail("岗位信息不完整：至少要有岗位名称", 400);
  if (job.data.description.trim().length < 20) return fail("岗位描述太短，没法按岗位定制；请粘贴完整的岗位职责和任职要求", 422);
  const resume = normalizeResume({ ...(body.resume as object), contact: {} });
  if (!withinSize(resume)) return fail("简历内容过大", 413);
  if (!resume.experiences.some((x) => x.bullets.length)) return fail("简历里还没有经历要点，先补充经历再来定制", 422);
  const focus = (Array.isArray(body.focus) ? body.focus : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 3);

  const granted = await gate(req, "resume_tailor", (k) => (typeof body[k] === "string" ? (body[k] as string) : undefined), { minPlan: "plus" });
  if (granted instanceof Response) return granted;

  let ok = false;
  try {
    const { input, flags } = buildTailorInput(job.data, resume, focus);
    const content = await chat(
      granted.cfg,
      [
        { role: "system", content: TAILOR_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      { json: true, timeoutMs: 110_000 },
    );
    const plan = normalizeTailor(parseJsonLoose(content), resume, flags);
    if (!plan.changes.length) throw new LlmError("这次没有得到可用的改动建议，已退还额度，请重试", 502);
    ok = true;
    return Response.json({ plan, via: granted.via }, { headers: granted.setCookies.map((c) => ["Set-Cookie", c] as [string, string]) });
  } catch (e) {
    return e instanceof LlmError ? fail(e.message, e.status) : fail("生成失败，已退还额度，请重试", 502);
  } finally {
    await granted.finish(ok);
  }
}
