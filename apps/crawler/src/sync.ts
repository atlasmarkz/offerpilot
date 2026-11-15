import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { planFreshness, type Job, type RunSource } from "@offerpilot/shared";
import { loadSourceConfigs } from "./sources";
import { JobStore } from "./store";

/**
 * 本地 Job -> job_listing 表的一行（只有内容字段）。
 * keepReview=true 时不带审核状态：新岗位用库里的默认值 pending，已有岗位的审核状态不被覆盖
 * （定时采集在 CI 里跑，那里没有你本机的审核记录，不能把已通过的岗位重置回待审）。
 */
export function toRow(job: Job, descriptionMax = 600, keepReview = false) {
  const row = {
    id: job.id,
    company_id: job.companyId,
    company_type: job.companyType,
    title: job.title,
    kind: job.kind,
    cities: job.city,
    description: job.description.slice(0, descriptionMax),
    requirements: job.requirements,
    deadline: job.deadline ?? null,
    apply_url: job.applyUrl,
    source_url: job.sourceUrl,
    updated_at: new Date().toISOString(),
  };
  return keepReview ? row : { ...row, review_status: job.reviewStatus };
}

/**
 * 新版密钥（sb_secret_ / sb_publishable_）不是 JWT，只能放在 apikey 头里；
 * 再放进 Authorization: Bearer 会让网关把请求当成匿名角色。旧版 JWT 密钥两个头都要带。
 */
export function authHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 库里已有的一行（判断新旧、下架用到的字段）。 */
export interface DbRow {
  id: string;
  source: string | null;
  source_url: string;
  status: "open" | "closed";
  miss_count: number;
  review_status: Job["reviewStatus"];
  last_seen_at?: string | null;
}

export interface LastRun {
  at: string;
  sources: RunSource[];
}

type Row = Record<string, unknown>;

export interface SyncPlan {
  /** 新岗位：整行插入 */
  inserts: Row[];
  /** 这次采集到的已有岗位：刷新内容，记为“刚确认在招” */
  seen: Row[];
  /** 本机审核模式下、这次没采集到的已有岗位：只推内容和审核状态 */
  reviewOnly: Row[];
  /** 旧数据补上数据源 id */
  backfill: { id: string; source: string }[];
  miss: { id: string; missCount: number }[];
  close: { id: string; missCount: number }[];
}

/**
 * 同步方案（纯函数）：数据库是新旧、下架判断的依据（CI 每天从空白开始，本机文件没有历史）。
 * - 这次采集到、库里没有：插入。keepReview 时，数据源之前有岗位审核通过（整组抽查过、可信）就直接通过，否则待审核；
 * - 这次采集到、库里有：刷新内容 + 最近确认在招 + 恢复在招；
 * - 这次没采集到：按 planFreshness 记“没找到”或下架（只看完整采集的数据源）。
 */
export function planSync(opts: { db: DbRow[]; local: Job[]; run?: LastRun; keepReview: boolean; urlToSource: Map<string, string> }): SyncPlan {
  const { db, local, run, keepReview, urlToSource } = opts;
  const at = run?.at ?? new Date().toISOString();
  const dbById = new Map(db.map((r) => [r.id, r]));
  const sourceOf = (r: DbRow) => r.source ?? urlToSource.get(r.source_url) ?? null;
  const trusted = new Set(db.filter((r) => r.review_status === "approved").map(sourceOf).filter((s): s is string => !!s));
  const seen = new Set(run?.sources.flatMap((s) => s.ids) ?? []);

  const plan: SyncPlan = { inserts: [], seen: [], reviewOnly: [], backfill: [], miss: [], close: [] };
  for (const job of local) {
    const source = job.source ?? urlToSource.get(job.sourceUrl) ?? null;
    const existing = dbById.get(job.id);
    if (!existing) {
      if (!seen.has(job.id) && keepReview) continue; // CI 里只会有这次采集到的；保险起见不插入没见过的
      plan.inserts.push({
        ...toRow(job, 600, true),
        source,
        posted_at: job.postedAt ?? null,
        first_seen_at: seen.has(job.id) ? at : (job.firstSeenAt ?? at),
        last_seen_at: seen.has(job.id) ? at : (job.lastSeenAt ?? at),
        status: seen.has(job.id) ? "open" : job.status,
        closed_at: seen.has(job.id) ? null : (job.closedAt ?? null),
        miss_count: seen.has(job.id) ? 0 : job.missCount,
        review_status: keepReview ? (source && trusted.has(source) ? "approved" : "pending") : job.reviewStatus,
      });
    } else if (seen.has(job.id)) {
      // 发布日期以这次采集到的为准：识别不到就清空，避免沿用识别规则修正前的错误日期
      plan.seen.push({ ...toRow(job, 600, keepReview), source, posted_at: job.postedAt ?? null, last_seen_at: at, status: "open", closed_at: null, miss_count: 0 });
    } else if (!keepReview) {
      plan.reviewOnly.push(toRow(job, 600, false));
    }
  }

  for (const r of db) {
    const s = !r.source ? urlToSource.get(r.source_url) : undefined;
    if (s && !seen.has(r.id)) plan.backfill.push({ id: r.id, source: s });
  }
  const fresh = planFreshness(
    db.map((r) => ({ id: r.id, source: sourceOf(r), status: r.status, missCount: r.miss_count, lastSeenAt: r.last_seen_at })),
    run?.sources ?? [],
    undefined,
    new Date(at),
  );
  plan.miss = fresh.miss;
  plan.close = fresh.close;
  return plan;
}

/** 按值分组，用于“把这些 id 的某个字段改成同一个值”的批量 PATCH。 */
export function groupBy<T, K>(list: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of list) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
  return m;
}

async function main() {
  try {
    process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
  } catch {
    /* 没有 .env 就只用进程环境变量（CI 里就是这样） */
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    throw new Error("缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY（service_role 密钥，只能放在本机或 CI 的密钥里）");
  const origin = new URL(SUPABASE_URL.trim()).origin;
  const headers = { ...authHeaders(SUPABASE_SERVICE_KEY.trim()), "Content-Type": "application/json" };
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${origin}/rest/v1${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
    return res;
  };

  const keepReview = process.argv.includes("--keep-review");
  const dataDir = join(import.meta.dirname, "..", "data");
  const local = new JobStore(join(dataDir, "jobs.json")).list();
  const runPath = join(dataDir, "last-run.json");
  const run = existsSync(runPath) ? (JSON.parse(readFileSync(runPath, "utf8")) as LastRun) : undefined;
  if (!run) console.warn("没有 data/last-run.json（还没跑过采集）：只同步内容，不判断下架");
  const urlToSource = new Map(loadSourceConfigs(join(import.meta.dirname, "..", "sources.json")).map((c) => [c.url, c.id]));

  // 1. 读库里已有的岗位（service_role 绕过行级安全，能读到待审核和已下架的）
  const db: DbRow[] = [];
  try {
    for (let offset = 0; ; offset += 1000) {
      const res = await rest(`/job_listing?select=id,source,source_url,status,miss_count,review_status,last_seen_at&order=id&limit=1000&offset=${offset}`);
      const rows = (await res.json()) as DbRow[];
      db.push(...rows);
      if (rows.length < 1000) break;
    }
  } catch (e) {
    throw new Error(`读取已有岗位失败（是不是还没运行 supabase/migrations/0010_job_freshness.sql？）：${(e as Error).message}`);
  }

  const plan = planSync({ db, local, run, keepReview, urlToSource });

  // 2. 写入。每组字段一致，PostgREST 批量写入要求如此
  const upsert = async (rows: Row[], label: string, prefer = "resolution=merge-duplicates,return=minimal") => {
    let n = 0;
    for (const part of chunk(rows, 500)) {
      await rest("/job_listing?on_conflict=id", { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(part) });
      n += part.length;
    }
    if (rows.length) console.log(`${label}：${n} 条`);
  };
  await upsert(plan.inserts, "新增", "resolution=ignore-duplicates,return=minimal");
  await upsert(plan.seen, "刷新");
  await upsert(plan.reviewOnly, "同步审核状态");

  const patch = async (ids: string[], body: Row) => {
    for (const part of chunk(ids, 150)) await rest(`/job_listing?id=in.(${part.join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
  };
  for (const [source, rows] of groupBy(plan.backfill, (r) => r.source)) await patch(rows.map((r) => r.id), { source });
  for (const [missCount, rows] of groupBy(plan.miss, (r) => r.missCount)) await patch(rows.map((r) => r.id), { miss_count: missCount });
  const at = run?.at ?? new Date().toISOString();
  for (const [missCount, rows] of groupBy(plan.close, (r) => r.missCount))
    await patch(rows.map((r) => r.id), { miss_count: missCount, status: "closed", closed_at: at });

  const autoApproved = plan.inserts.filter((r) => r.review_status === "approved").length;
  console.log(
    `完成：新增 ${plan.inserts.length} 条（其中可信数据源直接上线 ${autoApproved} 条），确认在招 ${plan.seen.length} 条，` +
      `暂时没找到 ${plan.miss.length} 条，下架 ${plan.close.length} 条${plan.backfill.length ? `，补数据源 ${plan.backfill.length} 条` : ""}`,
  );
}

// 被测试 import 时不执行
if (process.argv[1]?.endsWith("sync.ts")) await main();
