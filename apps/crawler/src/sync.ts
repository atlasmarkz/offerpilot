import { join } from "node:path";
import type { Job } from "@offerpilot/shared";
import { JobStore } from "./store";

/**
 * 本地 Job -> job_listing 表的一行。
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

async function main() {
  try {
    process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
  } catch {
    /* 没有 .env 就只用进程环境变量（CI 里就是这样） */
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const supabaseOrigin = SUPABASE_URL ? new URL(SUPABASE_URL.trim()).origin : "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    throw new Error("缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY（service_role 密钥，只能放在本机或 CI 的密钥里）");

  const keepReview = process.argv.includes("--keep-review");
  const jobs = new JobStore(join(import.meta.dirname, "..", "data", "jobs.json")).list();
  // 默认以本机审核状态为准整体同步；--keep-review 只更新内容、不碰审核状态。没被刷新的旧岗位不删除
  let n = 0;
  for (const part of chunk(jobs, 500)) {
    const res = await fetch(`${supabaseOrigin}/rest/v1/job_listing?on_conflict=id`, {
      method: "POST",
      headers: {
        ...authHeaders(SUPABASE_SERVICE_KEY.trim()),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(part.map((j) => toRow(j, 600, keepReview))),
    });
    if (!res.ok) throw new Error(`同步失败 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    n += part.length;
    console.log(`已同步 ${n}/${jobs.length}`);
  }
  const approved = jobs.filter((j) => j.reviewStatus === "approved").length;
  console.log(`完成：共 ${jobs.length} 条，其中已审核通过 ${approved} 条（网页端只会展示这部分）`);
}

// 被测试 import 时不执行
if (process.argv[1]?.endsWith("sync.ts")) await main();
