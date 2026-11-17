import { gate } from "../../../../lib/billing/gate";
import { buildFitInput, FIT_SYSTEM_PROMPT, FitJob, normalizeFit } from "../../../../lib/fit";
import { chat, LlmError, parseJsonLoose } from "../../../../lib/llmConfig";
import { normalizeResume, resumeToText, withinSize } from "../../../../lib/resumeData";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** 岗位匹配度评估：入参是岗位（岗位库里的，或用户粘贴的岗位描述）+ 在线简历的结构化数据（不含联系方式）。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("请求格式不对", 400);
  if (body.consent !== true) return fail("需要先同意把简历内容发送给大模型服务", 400);

  const job = FitJob.safeParse(body.job);
  if (!job.success) return fail("岗位信息不完整：至少要有岗位名称", 400);
  const resume = normalizeResume(body.resume);
  if (!withinSize(resume)) return fail("简历内容过大", 413);
  const resumeText = resumeToText(resume);
  if (resumeText.replace(/\s/g, "").length < 40) return fail("简历内容太少：先在“投递资料”里填写或上传简历，再来评估", 422);
  if (!job.data.description.trim() && !job.data.requirements.trim()) return fail("这个岗位没有描述，没法评估；可以粘贴岗位描述再试", 422);

  const granted = await gate(req, "job_fit", (k) => (typeof body[k] === "string" ? (body[k] as string) : undefined));
  if (granted instanceof Response) return granted;

  let ok = false;
  try {
    const { input, flags } = buildFitInput(job.data, resume);
    const content = await chat(
      granted.cfg,
      [
        { role: "system", content: FIT_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      { json: true, timeoutMs: 110_000 },
    );
    const fit = normalizeFit(parseJsonLoose(content), resumeText, flags);
    if (!fit) throw new LlmError("这次没有得到有效的评估，已退还额度，请重试", 502);
    ok = true;
    return Response.json({ fit, via: granted.via }, { headers: granted.setCookies.map((c) => ["Set-Cookie", c] as [string, string]) });
  } catch (e) {
    return e instanceof LlmError ? fail(e.message, e.status) : fail("评估失败，已退还额度，请重试", 502);
  } finally {
    await granted.finish(ok);
  }
}
