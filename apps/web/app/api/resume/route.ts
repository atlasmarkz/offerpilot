import { resolve } from "node:path";
import { clientIp, resumeLimiter } from "../../../lib/rateLimit";
import { fileToText, MAX_FILE_BYTES } from "../../../lib/extractText";
import { chat, LlmError, parseJsonLoose, userConfig, type LlmConfig } from "../../../lib/llmConfig";
import { MAX_RESUME_CHARS, normalizeDraft, RESUME_SYSTEM_PROMPT } from "../../../lib/resume";

export const dynamic = "force-dynamic";

/** 服务端自备的模型配置（本机 .env / 部署平台环境变量）。部署公网时可以不配，让用户自带。 */
function serverConfig(): LlmConfig | undefined {
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
 * 简历 -> 画像草稿。文件只在内存里处理，不落盘、不记录内容。
 * 模型优先用用户在页面上自己配置的（Base URL / API Key / 模型名，随本次请求带来，不保存、不记录）；
 * 没配才退回服务端自备的，且只有这种情况才受每日次数限制（花的是服务端的钱）。
 * 无论哪种，简历文字都会发给模型服务，所以必须带上用户的明确同意。
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("请选择简历文件", 400);
  if (form?.get("consent") !== "1") return fail("需要先同意把简历文字发送给大模型服务", 400);
  if (file.size > MAX_FILE_BYTES) return fail("文件超过 5MB", 413);

  let cfg: LlmConfig | undefined;
  try {
    cfg = await userConfig((k) => {
      const v = form?.get(k);
      return typeof v === "string" ? v : undefined;
    });
  } catch (e) {
    return fail((e as Error).message, e instanceof LlmError ? e.status : 400);
  }
  if (!cfg) {
    if (process.env.RESUME_ENABLED === "0") return fail("简历解析功能暂未开放，请手动填写画像", 503);
    cfg = serverConfig();
    if (!cfg) return fail("还没有配置大模型：请在页面的“模型设置”里填写你自己的 Base URL、API Key 和模型名", 503);
    const limited = resumeLimiter().check(clientIp(req));
    if (limited) return fail(`${limited}。也可以在“模型设置”里填写你自己的模型，不受次数限制`, 429);
  }

  let text: string;
  try {
    text = (await fileToText(file.name, new Uint8Array(await file.arrayBuffer()))).trim();
  } catch (e) {
    return fail((e as Error).message || "读取文件失败", 422);
  }
  if (text.length < 30) return fail("没有读到文字，可能是扫描件或图片，请换成文字版 PDF / Word", 422);

  try {
    const content = await chat(
      cfg,
      [
        { role: "system", content: RESUME_SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, MAX_RESUME_CHARS) },
      ],
      { json: true },
    );
    return Response.json({
      draft: normalizeDraft(parseJsonLoose(content)),
      chars: text.length,
      truncated: text.length > MAX_RESUME_CHARS,
    });
  } catch (e) {
    return e instanceof LlmError ? fail(e.message, e.status) : fail("解析失败，请重试", 502);
  }
}
