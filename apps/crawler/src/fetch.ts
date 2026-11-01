const USER_AGENT = "OfferPilotBot/0.1 (personal project; respects robots.txt)";

export interface FetchOptions {
  /** 同一主机两次请求的最小间隔（毫秒） */
  minIntervalMs?: number;
}

const lastRequestAt = new Map<string, number>();
const robotsCache = new Map<string, string[]>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 极简 robots.txt 解析：只读 User-agent: * 下的 Disallow。 */
export function parseDisallow(robotsTxt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.split("#")[0]!.trim();
    const [k, ...rest] = line.split(":");
    const key = k?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*";
    else if (applies && key === "disallow" && value) rules.push(value);
  }
  return rules;
}

async function allowedByRobots(url: URL): Promise<boolean> {
  let rules = robotsCache.get(url.origin);
  if (!rules) {
    try {
      const res = await fetch(new URL("/robots.txt", url.origin), { headers: { "User-Agent": USER_AGENT } });
      rules = res.ok ? parseDisallow(await res.text()) : [];
    } catch {
      rules = [];
    }
    robotsCache.set(url.origin, rules);
  }
  return !rules.some((prefix) => url.pathname.startsWith(prefix));
}

/** 礼貌抓取：遵守 robots.txt，限速，带可识别的 UA。被禁止时抛错而不是绕过。 */
export async function politeFetch(urlStr: string, opts: FetchOptions = {}): Promise<string> {
  const url = new URL(urlStr);
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt 禁止抓取: ${urlStr}`);

  const wait = (lastRequestAt.get(url.host) ?? 0) + (opts.minIntervalMs ?? 2000) - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(url.host, Date.now());

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${urlStr}`);
  return res.text();
}
