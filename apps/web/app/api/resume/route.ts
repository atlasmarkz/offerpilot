import { resolve } from "node:path";
import { clientIp, resumeLimiter } from "../../../lib/rateLimit";
import { fileToText, MAX_FILE_BYTES } from "../../../lib/extractText";
import { MAX_RESUME_CHARS, normalizeDraft, RESUME_SYSTEM_PROMPT } from "../../../lib/resume";

export const dynamic = "force-dynamic";

function llmConfig() {
  // 与采集器共用根目录 .env；已有的环境变量优先
  try {
    process.loadEnvFile(resolve(process.cwd(), "../../.env"));
  } catch {
    /* 没有 .env 就只用进程环境变量 */
  }
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) return undefined;
  return { baseUrl: LLM_BASE_URL.replace(/\/$/, ""), apiKey: LLM_API_KEY, model: LLM_MODEL };
}

const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * 简历 -> 画像草稿。文件只在内存里处理，不落盘、不记录内容；
 * 解析出的文字会发给 .env 里配置的大模型服务，所以必须带上用户的明确同意。
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("请选择简历文件", 400);
  if (form?.get("consent") !== "1") return fail("需要先同意把简历文字发送给大模型服务", 400);
  if (file.size > MAX_FILE_BYTES) return fail("文件超过 5MB", 413);

  if (process.env.RESUME_ENABLED === "0") return fail("简历解析功能暂未开放，请手动填写画像", 503);
  const limited = resumeLimiter().check(clientIp(req));
  if (limited) return fail(limited, 429);

  const cfg = llmConfig();
  if (!cfg) return fail("服务端没有配置大模型（根目录 .env 的 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）", 503);

  let text: string;
  try {
    text = (await fileToText(file.name, new Uint8Array(await file.arrayBuffer()))).trim();
  } catch (e) {
    return fail((e as Error).message || "读取文件失败", 422);
  }
  if (text.length < 30) return fail("没有读到文字，可能是扫描件或图片，请换成文字版 PDF / Word", 422);

  let content: string;
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RESUME_SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, MAX_RESUME_CHARS) },
        ],
      }),
    });
    if (!res.ok) return fail(`大模型服务返回 ${res.status}，请稍后重试`, 502);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    content = body.choices?.[0]?.message?.content ?? "{}";
  } catch {
    return fail("连接大模型服务失败", 502);
  }

  try {
    return Response.json({ draft: normalizeDraft(JSON.parse(content)), chars: text.length, truncated: text.length > MAX_RESUME_CHARS });
  } catch {
    return fail("大模型返回的内容无法解析，请重试", 502);
  }
}
