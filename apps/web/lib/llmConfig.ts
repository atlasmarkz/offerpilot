import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 带“能直接显示给用户”的中文说明的错误。 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** 内网、回环、链路本地、云厂商元数据等地址：服务端不能替用户去访问。 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true; // 不是合法 IP，当作不安全
}

/**
 * 校验用户填的 Base URL 并返回规范化结果（去掉末尾斜杠）。
 * 部署在公网时服务端会替用户发请求，所以必须挡住 SSRF：只允许 https，
 * 并且域名解析出的所有地址都不能是内网地址。本地开发（allowPrivate）可以连 localhost 的 Ollama 等。
 */
export async function assertSafeBaseUrl(raw: string, opts: { allowPrivate: boolean }): Promise<string> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new LlmError("Base URL 格式不对，应类似 https://api.openai.com/v1", 400);
  }
  if (u.username || u.password) throw new LlmError("Base URL 里不要带用户名密码", 400);
  if (!opts.allowPrivate && u.protocol !== "https:") throw new LlmError("Base URL 必须以 https:// 开头", 400);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new LlmError("Base URL 只支持 http(s)", 400);

  if (!opts.allowPrivate) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
      throw new LlmError("不能使用内网地址作为 Base URL", 400);
    let addrs: string[];
    try {
      addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new LlmError("Base URL 的域名无法解析，请检查拼写", 400);
    }
    if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new LlmError("不能使用内网地址作为 Base URL", 400);
  }
  return u.toString().replace(/\/+$/, "");
}

const MAX_RESPONSE_CHARS = 1_000_000;

function upstreamError(status: number): LlmError {
  if (status === 401 || status === 403) return new LlmError("API Key 无效，或没有调用该模型的权限", 400);
  if (status === 404) return new LlmError("接口地址或模型名不对：请检查 Base URL（常以 /v1 结尾）和模型名", 400);
  if (status === 429) return new LlmError("模型服务提示额度不足或请求太频繁，请稍后再试", 429);
  return new LlmError(`模型服务返回 ${status}，请稍后重试`, 502);
}

/** 调用 OpenAI 兼容的 chat/completions，返回模型文本。失败抛 LlmError。 */
export async function chat(
  cfg: LlmConfig,
  messages: { role: "system" | "user"; content: string }[],
  opts: { json?: boolean; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const send = async (withJsonMode: boolean) => {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
        }),
        redirect: "manual", // 不跟随跳转：跳转目标没有经过地址校验
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
    } catch (e) {
      const timeout = (e as Error).name === "TimeoutError";
      throw new LlmError(timeout ? "模型服务响应超时" : "连接模型服务失败，请检查 Base URL 和网络", 502);
    }
    if (res.status >= 300 && res.status < 400) throw new LlmError("模型服务地址发生了跳转，请填写最终的 Base URL", 400);
    return res;
  };

  let res = await send(!!opts.json);
  // 有的兼容服务不支持 json 模式，会回 400/422：去掉后重试一次，格式由提示词约束
  if (opts.json && (res.status === 400 || res.status === 422)) res = await send(false);
  if (!res.ok) throw upstreamError(res.status);

  const text = await res.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new LlmError("模型服务返回内容过大", 502);
  try {
    const body = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new LlmError("模型服务返回的不是预期的格式，请确认它兼容 OpenAI 接口", 502);
  }
}

/** 模型有时会把 JSON 包在 ```json 代码块里，取出第一个完整对象再解析。 */
export function parseJsonLoose(raw: string): unknown {
  // 推理型模型（MiniMax M 系列等）会先输出 <think>…</think>，里面可能带花括号，先去掉
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("模型返回的内容无法解析，请重试", 502);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new LlmError("模型返回的内容无法解析，请重试", 502);
  }
}

export const allowPrivateUrls = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_PRIVATE_LLM_URLS === "1";

/** 读用户在请求里带来的配置；三项都没填返回 undefined，只填一部分报错。 */
export async function userConfig(get: (k: string) => string | undefined): Promise<LlmConfig | undefined> {
  const baseUrl = get("llmBaseUrl")?.trim();
  const apiKey = get("llmApiKey")?.trim();
  const model = get("llmModel")?.trim();
  if (!baseUrl && !apiKey && !model) return undefined;
  if (!baseUrl || !apiKey || !model) throw new LlmError("模型设置不完整：Base URL、API Key、模型名都要填", 400);
  return { baseUrl: await assertSafeBaseUrl(baseUrl, { allowPrivate: allowPrivateUrls() }), apiKey, model };
}
