import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Job } from "@offerpilot/shared";

const PAGE = 1000;

/** Supabase 行 -> Job；坏数据返回 undefined，由调用方跳过。 */
export function rowToJob(row: Record<string, unknown>): Job | undefined {
  const p = Job.safeParse({
    id: row.id,
    companyId: row.company_id,
    companyType: row.company_type,
    title: row.title,
    kind: row.kind,
    city: row.cities ?? [],
    description: row.description ?? "",
    requirements: row.requirements ?? {},
    deadline: row.deadline ?? undefined,
    applyUrl: row.apply_url,
    sourceUrl: row.source_url,
    reviewStatus: row.review_status,
  });
  return p.success ? p.data : undefined;
}

/** 线上模式：从 Supabase 读（匿名公钥 + 行级安全，只会拿到已审核岗位）。 */
async function fromSupabase(url: string, anonKey: string): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/job_listing?select=*&order=id&limit=${PAGE}&offset=${offset}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, next: { revalidate: 300 } },
    );
    if (!res.ok) throw new Error(`数据库读取失败 HTTP ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const r of rows) {
      const j = rowToJob(r);
      if (j) jobs.push(j);
    }
    if (rows.length < PAGE) return jobs;
  }
}

/** 本地模式：直接读采集器输出的文件（含未审核岗位，仅供本机试用）。 */
function fromFile(): Job[] {
  const path = process.env.JOBS_FILE ?? resolve(process.cwd(), "../crawler/data/jobs.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  return raw.flatMap((j) => {
    const p = Job.safeParse(j);
    return p.success ? [p.data] : [];
  });
}

export type Mode = "supabase" | "file";

export async function loadJobs(): Promise<{ jobs: Job[]; mode: Mode }> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { jobs: await fromSupabase(SUPABASE_URL, SUPABASE_ANON_KEY), mode: "supabase" };
  return { jobs: fromFile(), mode: "file" };
}
