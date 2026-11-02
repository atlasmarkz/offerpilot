/**
 * 简历解析的用量保护：每个 IP 每天 N 次、全站每天 M 次。
 * 计数放在进程内存里：单机/本地是准的；部署到无服务器平台时每个实例各记各的，
 * 只能当作“防滥用的第一道闸”，真要严格限额需要换成 Redis 或数据库计数。
 */
export interface Limiter {
  /** 允许则计数并返回 undefined，超限返回给用户看的原因 */
  check(ip: string, now?: Date): string | undefined;
}

export interface LimiterText {
  /** 额度的名称，如“解析”“验证码” */
  what: string;
  /** 全站额度用完时的补充提示 */
  tail: string;
}

export function createLimiter(
  perIp: number,
  perDay: number,
  text: LimiterText = { what: "解析", tail: "请明天再试，或直接手动填写画像" },
): Limiter {
  let day = "";
  let total = 0;
  const byIp = new Map<string, number>();
  return {
    check(ip, now = new Date()) {
      const today = now.toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        total = 0;
        byIp.clear();
      }
      if (total >= perDay) return `今天的${text.what}额度已用完，${text.tail}`;
      const used = byIp.get(ip) ?? 0;
      if (used >= perIp) return `你今天已${text.what} ${used} 次，达到上限，请明天再试`;
      total++;
      byIp.set(ip, used + 1);
      return undefined;
    },
  };
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

let shared: Limiter | undefined;
/** 按环境变量创建（默认每 IP 5 次/天，全站 200 次/天）。 */
export function resumeLimiter(): Limiter {
  shared ??= createLimiter(num(process.env.RESUME_PER_IP_LIMIT, 5), num(process.env.RESUME_DAILY_LIMIT, 200));
  return shared;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

let sendLimiter: Limiter | undefined;
let verifyLimiter: Limiter | undefined;

/** 发送登录验证码：每个 IP 每天最多 AUTH_CODE_PER_IP（默认 20）次，全站 AUTH_CODE_DAILY（默认 500）次。 */
export function authSendLimiter(): Limiter {
  sendLimiter ??= createLimiter(num(process.env.AUTH_CODE_PER_IP, 20), num(process.env.AUTH_CODE_DAILY, 500), {
    what: "发送验证码",
    tail: "请明天再试",
  });
  return sendLimiter;
}

/** 校验验证码：防止暴力猜 6 位码。每个 IP 每天 60 次。 */
export function authVerifyLimiter(): Limiter {
  verifyLimiter ??= createLimiter(60, 5000, { what: "校验验证码", tail: "请明天再试" });
  return verifyLimiter;
}
