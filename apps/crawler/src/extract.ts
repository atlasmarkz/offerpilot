import type { Extractor, RawPosting } from "./pipeline";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const MAX_TEXT_CHARS = 12000;

const SYSTEM_PROMPT = `你是校招岗位信息抽取器。从给定的招聘页面文本中抽取所有校招/实习岗位，输出 JSON 对象 {"jobs": [...]}。
每个岗位字段：
- title: 岗位名称
- kind: "fulltime"（正式校招）或 "intern"（实习）
- city: 工作城市数组
- description: 岗位职责与要求的摘要，不超过 500 字，忽略页面导航等无关内容
- requirements: { minDegree: "bachelor"|"master"|"phd"（可省略）, graduationYears: 数字数组, majors: 字符串数组, schoolTags: 字符串数组（如 "985"、"211"）, politicalStatus: 字符串数组, hukou: 字符串数组 }，原文没写的项留空数组或省略
- deadline: ISO 日期，原文没写则省略
- applyUrl: 投递链接，原文没有则省略
严格依据原文，不要猜测或编造；原文没有的信息一律省略。页面没有岗位时返回 {"jobs": []}。`;

export function createLlmExtractor(cfg: LlmConfig): Extractor {
  return async (raw: RawPosting) => {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `来源: ${raw.sourceUrl}\n\n${raw.text.slice(0, MAX_TEXT_CHARS)}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { jobs?: unknown };
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  };
}

export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    throw new Error("缺少环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（见 .env.example）");
  }
  return { baseUrl: LLM_BASE_URL, apiKey: LLM_API_KEY, model: LLM_MODEL };
}
