import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { CLOSE_AFTER } from "@offerpilot/shared";
import { authHeaders, chunk, groupBy, type LastRun } from "./sync";
import { checkOne } from "./verifyLinks";

/**
 * 复查：没有“取全”的数据源（如字节只取前 300 条），没出现的岗位不能直接判下架，
 * 这里每天挑这些数据源里最久没确认的在招岗位，打开详情页看还在不在：
 * - 还在：记为刚确认在招；
 * - 打不开 / 页面里没有岗位名：记一次“没找到”，连续 CLOSE_AFTER 次（隔天再查）才下架，避免偶发故障误判。
 *
 * 用法：npm run recheck -w @offerpilot/crawler [-- --per-source 8 --stale-days 3 --dry]
 */

interface Row {
  id: string;
  title: string;
  apply_url: string;
  source: string;
  miss_count: number;
  last_seen_at: string | null;
}

export interface RecheckResult {
  ok: { id: string }[];
  miss: { id: string; missCount: number }[];
  close: { id: string; missCount: number }[];
}

/** 复查结果 → 要写回的改动（纯函数）。 */
export function planRecheck(checks: { row: Pick<Row, "id" | "miss_count">; ok: boolean }[], closeAfter = CLOSE_AFTER): RecheckResult {
  const out: RecheckResult = { ok: [], miss: [], close: [] };
  for (const { row, ok } of checks) {
    if (ok) out.ok.push({ id: row.id });
    else {
      const missCount = row.miss_count + 1;
      (missCount >= closeAfter ? out.close : out.miss).push({ id: row.id, missCount });
    }
  }
  return out;
}

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

async function main() {
  try {
    process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
  } catch {
    /* CI 里用环境变量 */
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const origin = new URL(SUPABASE_URL.trim()).origin;
  const headers = { ...authHeaders(SUPABASE_SERVICE_KEY.trim()), "Content-Type": "application/json" };
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${origin}/rest/v1${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  };

  const perSource = arg("--per-source", 8);
  const staleDays = arg("--stale-days", 3);
  const dry = process.argv.includes("--dry");
  const runPath = join(import.meta.dirname, "..", "data", "last-run.json");
  const run = existsSync(runPath) ? (JSON.parse(readFileSync(runPath, "utf8")) as LastRun) : undefined;
  // 只复查这次没取全的数据源；没有采集记录时不知道哪些没取全，什么也不做
  const sources = (run?.sources ?? []).filter((s) => !s.complete).map((s) => s.id);
  if (!sources.length) return console.log("没有需要复查的数据源（都已取全，或还没跑过采集）");

  const before = new Date(Date.now() - staleDays * 86400_000).toISOString();
  const rows: Row[] = [];
  for (const source of sources) {
    const res = await rest(
      `/job_listing?select=id,title,apply_url,source,miss_count,last_seen_at&source=eq.${encodeURIComponent(source)}` +
        `&status=eq.open&review_status=eq.approved&last_seen_at=lt.${encodeURIComponent(before)}&order=last_seen_at.asc&limit=${perSource}`,
    );
    rows.push(...((await res.json()) as Row[]));
  }
  if (!rows.length) return console.log(`复查数据源 ${sources.join("、")}：没有超过 ${staleDays} 天没确认的岗位`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const checks: { row: Row; ok: boolean }[] = [];
  try {
    for (const row of rows) {
      const c = await checkOne({ id: row.id, title: row.title, applyUrl: row.apply_url }, browser);
      checks.push({ row, ok: c.ok });
      console.log(`${c.ok ? "在招" : "没找到"}  [${row.source}] ${row.title}  ${c.ok ? "" : c.why}`);
    }
  } finally {
    await browser.close();
  }

  const plan = planRecheck(checks);
  if (!dry) {
    const now = new Date().toISOString();
    const patch = async (ids: string[], body: Record<string, unknown>) => {
      for (const part of chunk(ids, 150)) await rest(`/job_listing?id=in.(${part.join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
    };
    await patch(plan.ok.map((r) => r.id), { last_seen_at: now, miss_count: 0 });
    for (const [missCount, list] of groupBy(plan.miss, (r) => r.missCount)) await patch(list.map((r) => r.id), { miss_count: missCount });
    for (const [missCount, list] of groupBy(plan.close, (r) => r.missCount)) await patch(list.map((r) => r.id), { miss_count: missCount, status: "closed", closed_at: now });
  }
  console.log(`复查 ${checks.length} 条：在招 ${plan.ok.length}，暂时没找到 ${plan.miss.length}，下架 ${plan.close.length}${dry ? "（--dry 未写回）" : ""}`);
}

if (process.argv[1]?.endsWith("recheck.ts")) await main();
