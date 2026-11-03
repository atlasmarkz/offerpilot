import { authHeaders, supabaseOrigin } from "../jobsSource";

/** 带“可直接显示给用户”的中文说明的错误。 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** 访问令牌的有效秒数 */
  expiresIn: number;
  user: AuthUser;
}

interface Cfg {
  origin: string;
  anonKey: string;
}

/** 没配 Supabase（本地文件模式）时账号功能整体关闭。 */
export function authConfig(): Cfg | undefined {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return undefined;
  try {
    return { origin: supabaseOrigin(SUPABASE_URL), anonKey: SUPABASE_ANON_KEY.trim() };
  } catch {
    return undefined;
  }
}

function need(): Cfg {
  const c = authConfig();
  if (!c) throw new AuthError("账号功能未启用", 503);
  return c;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 规范化并校验邮箱；不合法返回 undefined。 */
export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : undefined;
}

async function gotrue(cfg: Cfg, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${cfg.origin}/auth/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(cfg.anonKey), ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AuthError("连接登录服务失败，请稍后重试", 502);
  }
}

async function errorCode(res: Response): Promise<{ code: string; msg: string }> {
  try {
    const j = (await res.json()) as { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string };
    return { code: String(j.error_code ?? j.code ?? ""), msg: String(j.msg ?? j.message ?? j.error_description ?? "") };
  } catch {
    return { code: "", msg: "" };
  }
}

/** 给邮箱发 6 位验证码（邮箱不存在则自动注册）。 */
export async function sendOtp(email: string): Promise<void> {
  const cfg = need();
  const res = await gotrue(cfg, "/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
  if (res.ok) return;
  const { code, msg } = await errorCode(res);
  if (res.status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit")
    throw new AuthError("发送太频繁，请一分钟后再试", 429);
  if (code === "email_address_invalid" || code === "validation_failed") throw new AuthError("邮箱地址不可用，请换一个", 400);
  if (/smtp|mail/i.test(msg)) throw new AuthError("验证码邮件发送失败，请稍后重试（站点的邮件服务可能还没配置好）", 502);
  throw new AuthError("发送验证码失败，请稍后重试", 502);
}

function toTokens(j: Record<string, unknown>): Tokens {
  const user = (j.user ?? {}) as { id?: string; email?: string };
  if (typeof j.access_token !== "string" || typeof j.refresh_token !== "string" || !user.id)
    throw new AuthError("登录服务返回了意外的内容", 502);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresIn: Number(j.expires_in) || 3600,
    user: { id: user.id, email: user.email ?? "" },
  };
}

/** 用邮箱 + 验证码换会话。 */
export async function verifyOtp(email: string, token: string): Promise<Tokens> {
  const cfg = need();
  const res = await gotrue(cfg, "/verify", { method: "POST", body: JSON.stringify({ type: "email", email, token }) });
  if (!res.ok) {
    if (res.status === 429) throw new AuthError("尝试太频繁，请稍后再试", 429);
    if (res.status >= 500) throw new AuthError("登录服务暂时不可用，请稍后重试", 502);
    throw new AuthError("验证码不对或已过期，请重新获取", 400);
  }
  return toTokens((await res.json()) as Record<string, unknown>);
}

/** 用刷新令牌换新会话；失败返回 undefined（需要重新登录）。 */
export async function refreshSession(refreshToken: string): Promise<Tokens | undefined> {
  const cfg = need();
  const res = await gotrue(cfg, "/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return undefined;
  try {
    return toTokens((await res.json()) as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

/** 校验访问令牌，返回用户；令牌无效或过期返回 undefined。 */
export async function getUser(accessToken: string): Promise<AuthUser | undefined> {
  const cfg = need();
  const res = await gotrue(cfg, "/user", { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return undefined;
  const j = (await res.json()) as { id?: string; email?: string };
  return j.id ? { id: j.id, email: j.email ?? "" } : undefined;
}

/** 以登录用户的身份访问数据库：apikey 用公钥，Authorization 用用户令牌，行级安全据此限定只能碰自己的数据。 */
export async function userRest(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const cfg = need();
  try {
    return await fetch(`${cfg.origin}/rest/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.anonKey,
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AuthError("连接数据库失败，请稍后重试", 502);
  }
}

/** 以登录用户的身份访问存储（私有桶），存储策略保证只能碰自己目录下的文件。 */
export async function userStorage(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const cfg = need();
  try {
    return await fetch(`${cfg.origin}/storage/v1${path}`, {
      ...init,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}`, ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AuthError("连接存储服务失败，请稍后重试", 502);
  }
}
