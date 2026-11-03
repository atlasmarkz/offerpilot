import { gate } from "../../../../lib/billing/gate";
import { chat, LlmError, parseJsonLoose } from "../../../../lib/llmConfig";
import { normalizeResume, resumeToText, withinSize } from "../../../../lib/resumeData";
import { buildSuggestInput, normalizeSuggestions, SUGGEST_SYSTEM_PROMPT } from "../../../../lib/suggest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** 简历修改建议：入参是在线简历的结构化数据（不含联系方式），不是文件。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("请求格式不对", 400);
  if (body.consent !== true) return fail("需要先同意把简历内容发送给大模型服务", 400);

  const resume = normalizeResume(body.resume);
  if (!withinSize(resume)) return fail("简历内容过大", 413);
  if (resumeToText(resume).replace(/\s/g, "").length < 40) return fail("简历内容太少，先补充一些经历再来获取建议", 422);

  const granted = await gate(req, "resume_suggest", (k) => (typeof body[k] === "string" ? (body[k] as string) : undefined));
  if (granted instanceof Response) return granted;

  let ok = false;
  try {
    const role = typeof body.targetRole === "string" ? body.targetRole : undefined;
    const content = await chat(
      granted.cfg,
      [
        { role: "system", content: SUGGEST_SYSTEM_PROMPT },
        { role: "user", content: buildSuggestInput(resume, role) },
      ],
      { json: true, timeoutMs: 110_000 },
    );
    const suggestions = normalizeSuggestions(parseJsonLoose(content));
    // 模型一条有效建议都没给，等于没服务：不收费
    if (suggestions.items.length === 0) throw new LlmError("这次没有生成有效的建议，已退还额度，请重试", 502);
    ok = true;
    return Response.json(
      { suggestions, via: granted.via },
      { headers: granted.setCookies.map((c) => ["Set-Cookie", c] as [string, string]) },
    );
  } catch (e) {
    return e instanceof LlmError ? fail(e.message, e.status) : fail("生成建议失败，已退还额度，请重试", 502);
  } finally {
    await granted.finish(ok);
  }
}
