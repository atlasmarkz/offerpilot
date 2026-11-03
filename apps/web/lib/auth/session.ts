import { getUser, refreshSession, type AuthUser, type Tokens } from "./supabaseAuth";

export const AT_COOKIE = "op_at";
export const RT_COOKIE = "op_rt";
const RT_MAX_AGE = 60 * 60 * 24 * 30;

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* 忽略坏的 Cookie */
    }
  }
  return out;
}

const secureFlag = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

function cookie(name: string, value: string, maxAge: number): string {
  // HttpOnly：页面脚本读不到令牌，即使出现 XSS 也偷不走；SameSite=Lax：跨站请求不带 Cookie
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag()}`;
}

export function sessionCookies(t: Pick<Tokens, "accessToken" | "refreshToken" | "expiresIn">): string[] {
  return [cookie(AT_COOKIE, t.accessToken, t.expiresIn), cookie(RT_COOKIE, t.refreshToken, RT_MAX_AGE)];
}

export function clearCookies(): string[] {
  return [cookie(AT_COOKIE, "", 0), cookie(RT_COOKIE, "", 0)];
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  /** 令牌刚被刷新时需要写回浏览器 */
  setCookies: string[];
}

/** 从请求的 Cookie 还原登录状态：访问令牌有效就用，过期了就用刷新令牌换一次。 */
export async function resolveSession(req: Request): Promise<Session | undefined> {
  const c = parseCookies(req.headers.get("cookie"));
  if (c[AT_COOKIE]) {
    const user = await getUser(c[AT_COOKIE]);
    if (user) return { user, accessToken: c[AT_COOKIE], setCookies: [] };
  }
  if (c[RT_COOKIE]) {
    const t = await refreshSession(c[RT_COOKIE]);
    if (t) return { user: t.user, accessToken: t.accessToken, setCookies: sessionCookies(t) };
  }
  return undefined;
}

/** 带 Set-Cookie 的 JSON 响应。 */
export function jsonWith(data: unknown, init: { status?: number; cookies?: string[]; headers?: Record<string, string> } = {}): Response {
  const headers = new Headers({ "Cache-Control": "no-store", ...init.headers });
  for (const c of init.cookies ?? []) headers.append("Set-Cookie", c);
  return Response.json(data, { status: init.status ?? 200, headers });
}

/**
 * 防跨站请求伪造：改数据的请求必须来自本站页面。
 * 浏览器发 POST/PUT 一定会带 Origin，和本站域名对不上就拒绝。
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
