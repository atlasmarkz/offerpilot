/**
 * 简历解析的用量保护：每个 IP 每天 N 次、全站每天 M 次。
 * 计数放在进程内存里：单机/本地是准的；部署到无服务器平台时每个实例各记各的，
 * 只能当作“防滥用的第一道闸”，真要严格限额需要换成 Redis 或数据库计数。
 */
export interface Limiter {
  /** 允许则计数并返回 undefined，超限返回给用户看的原因 */
  check(ip: string, now?: Date): string | undefined;
}

export function createLimiter(perIp: number, perDay: number): Limiter {
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
      if (total >= perDay) return "今天的解析额度已用完，请明天再试，或直接手动填写画像";
      const used = byIp.get(ip) ?? 0;
      if (used >= perIp) return `你今天已解析 ${used} 次，达到上限，请明天再试或手动填写`;
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
