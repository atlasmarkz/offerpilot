import { resolve } from "node:path";
import { jsonWith, resolveSession } from "../auth/session";
import { authConfig } from "../auth/supabaseAuth";
import { LlmError, userConfig, type LlmConfig } from "../llmConfig";
import { clientIp, resumeLimiter } from "../rateLimit";
import { BillingError, billingEnabled, consume, refund, type Feature } from "./billing";

/** 服务端自备的模型（MiniMax 等）：本机 .env / 部署平台环境变量。 */
export function serverLlm(): LlmConfig | undefined {
  try {
    process.loadEnvFile(resolve(process.cwd(), "../../.env"));
  } catch {
    /* 没有 .env 就只用进程环境变量 */
  }
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) return undefined;
  return { baseUrl: LLM_BASE_URL.replace(/\/$/, ""), apiKey: LLM_API_KEY, model: LLM_MODEL };
}

export interface Granted {
  cfg: LlmConfig;
  /** 调用结束后调用：ok=false 时把扣的额度退还 */
  finish: (ok: boolean) => Promise<void>;
  setCookies: string[];
  /** 这次用的是谁的模型：user = 用户自带（免费），server = 站点自备 */
  via: "user" | "server";
}

const fail = (error: string, status: number, code?: string, cookies?: string[]) =>
  jsonWith({ error, code }, { status, cookies });

/**
 * 大模型功能的统一入口，决定“用谁的模型、要不要扣额度”：
 *  1. 用户自带 Key（请求里带了 Base URL / Key / 模型名）：用它，免费、不要求登录；
 *  2. 否则用站点自备模型：
 *     - 开了计费：必须登录，先扣额度（订阅额度 → 次数包），模型调用失败自动退还；
 *     - 没开计费（本地 / 自托管）：沿用每日次数限制。
 * 返回 Response 表示被拦下，调用方直接 return；返回 Granted 表示可以继续。
 */
export async function gate(
  req: Request,
  feature: Feature,
  field: (k: string) => string | undefined,
): Promise<Granted | Response> {
  try {
    const mine = await userConfig(field);
    if (mine) return { cfg: mine, finish: async () => {}, setCookies: [], via: "user" };
  } catch (e) {
    return fail((e as Error).message, e instanceof LlmError ? e.status : 400);
  }

  if (process.env.RESUME_ENABLED === "0") return fail("该功能暂未开放，请在“模型设置”里填写你自己的模型", 503);
  const cfg = serverLlm();
  if (!cfg) return fail("还没有配置大模型：请在页面的“模型设置”里填写你自己的 Base URL、API Key 和模型名", 503);

  if (!billingEnabled()) {
    const limited = resumeLimiter().check(clientIp(req));
    if (limited) return fail(`${limited}。也可以在“模型设置”里填写你自己的模型，不受次数限制`, 429);
    return { cfg, finish: async () => {}, setCookies: [], via: "server" };
  }

  // 计费模式：登录 → 扣额度
  if (!authConfig()) return fail("账号功能未启用", 503);
  const session = await resolveSession(req).catch(() => undefined);
  if (!session) return fail("使用站点提供的模型需要先登录", 401, "login_required");
  try {
    const charge = await consume(session.user.id, feature);
    let settled = false;
    return {
      cfg,
      setCookies: session.setCookies,
      via: "server",
      finish: async (ok) => {
        if (settled) return;
        settled = true;
        if (!ok) await refund(charge.requestId);
      },
    };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message, e.status, e.code, session.setCookies);
    return fail("扣减额度失败，请稍后重试", 502);
  }
}
