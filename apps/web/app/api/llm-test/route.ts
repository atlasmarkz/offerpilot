import { chat, LlmError, userConfig } from "../../../lib/llmConfig";

export const dynamic = "force-dynamic";

/** “测试连接”：用用户填的配置发一条极短的请求，确认地址、密钥、模型名都对。不保存任何内容。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const cfg = await userConfig((k) => (typeof body?.[k] === "string" ? (body[k] as string) : undefined));
    if (!cfg) return Response.json({ error: "请先填写 Base URL、API Key 和模型名" }, { status: 400 });
    await chat(cfg, [{ role: "user", content: "回复 ok" }], { maxTokens: 8, timeoutMs: 20_000 });
    return Response.json({ ok: true });
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("测试失败，请重试");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
