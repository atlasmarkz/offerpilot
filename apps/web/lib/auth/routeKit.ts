import { jsonWith, sameOrigin } from "./session";
import { AuthError, authConfig, normalizeEmail } from "./supabaseAuth";
import { clientIp, type Limiter } from "../rateLimit";

export interface Ctx {
  email: string;
  body: Record<string, unknown>;
  ip: string;
}

/**
 * 认证类接口的公共前置检查：账号功能已启用、请求来源是本站、邮箱合法、没超限流。
 * 通过返回上下文，不通过直接返回要给用户的响应。
 */
export async function preflight(req: Request, limiter: Limiter): Promise<Ctx | Response> {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (!email) return jsonWith({ error: "请输入正确的邮箱地址" }, { status: 400 });
  const ip = clientIp(req);
  const limited = limiter.check(ip);
  if (limited) return jsonWith({ error: limited }, { status: 429 });
  return { email, body, ip };
}

/** 把异常变成给用户看的响应；顺带带上上游耗时（浏览器开发者工具的 Server-Timing 里能看到发邮件到底花了多久）。 */
export function failure(e: unknown): Response {
  const err = e instanceof AuthError ? e : new AuthError("操作失败，请稍后重试", 502);
  return jsonWith({ error: err.message }, { status: err.status });
}

/** 计时：返回 [结果, Server-Timing 头]。 */
export async function timed<T>(run: () => Promise<T>): Promise<[T, Record<string, string>]> {
  const t0 = performance.now();
  const out = await run();
  return [out, { "Server-Timing": `upstream;dur=${Math.round(performance.now() - t0)}` }];
}
