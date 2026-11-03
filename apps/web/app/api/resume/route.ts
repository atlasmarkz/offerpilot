import { fileToText, MAX_FILE_BYTES } from "../../../lib/extractText";
import { gate } from "../../../lib/billing/gate";
import { chat, LlmError, parseJsonLoose } from "../../../lib/llmConfig";
import { MAX_RESUME_CHARS, normalizeDraft, RESUME_SYSTEM_PROMPT } from "../../../lib/resume";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * 简历 -> 结构化草稿。文件只在内存里处理，不落盘、不记录内容。
 * 用谁的模型、扣不扣额度见 gate()：用户自带模型免费；站点模型在计费模式下要登录并扣额度，失败自动退还。
 * 无论哪种，简历文字都会发给模型服务，所以必须带上用户的明确同意。
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("请选择简历文件", 400);
  if (form?.get("consent") !== "1") return fail("需要先同意把简历文字发送给大模型服务", 400);
  if (file.size > MAX_FILE_BYTES) return fail("文件超过 5MB", 413);

  // 先读文件：读不出文字的（扫描件、格式不对）不该扣额度
  let text: string;
  try {
    text = (await fileToText(file.name, new Uint8Array(await file.arrayBuffer()))).trim();
  } catch (e) {
    return fail((e as Error).message || "读取文件失败", 422);
  }
  if (text.length < 30) return fail("没有读到文字，可能是扫描件或图片，请换成文字版 PDF / Word", 422);

  const granted = await gate(req, "resume_parse", (k) => {
    const v = form?.get(k);
    return typeof v === "string" ? v : undefined;
  });
  if (granted instanceof Response) return granted;

  let ok = false;
  try {
    const content = await chat(
      granted.cfg,
      [
        { role: "system", content: RESUME_SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, MAX_RESUME_CHARS) },
      ],
      { json: true },
    );
    const draft = normalizeDraft(parseJsonLoose(content));
    ok = true;
    return Response.json(
      {
        draft,
        chars: text.length,
        // 给左侧预览用；只返回给发起请求的用户，不保存
        text: text.slice(0, MAX_RESUME_CHARS),
        truncated: text.length > MAX_RESUME_CHARS,
        via: granted.via,
      },
      { headers: granted.setCookies.map((c) => ["Set-Cookie", c] as [string, string]) },
    );
  } catch (e) {
    return e instanceof LlmError ? fail(e.message, e.status) : fail("解析失败，已退还额度，请重试", 502);
  } finally {
    await granted.finish(ok);
  }
}
