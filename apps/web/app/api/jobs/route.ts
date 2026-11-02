import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Job } from "@offerpilot/shared";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** 采集器输出的岗位文件；可用 JOBS_FILE 指向别处。 */
const jobsFile = () => process.env.JOBS_FILE ?? resolve(process.cwd(), "../crawler/data/jobs.json");

export function GET() {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jobsFile(), "utf8"));
  } catch {
    return Response.json({ error: "还没有岗位数据，请先在 apps/crawler 运行 npm run crawl" }, { status: 404 });
  }
  // 逐条解析：坏数据跳过，不拖垮整个列表
  const jobs = z.array(z.unknown()).parse(raw).flatMap((j) => {
    const p = Job.safeParse(j);
    if (!p.success) return [];
    // 列表里只给个预览，正文留在官网
    return [{ ...p.data, description: p.data.description.slice(0, 300) }];
  });
  // 审核被驳回的绝不展示
  return Response.json({ jobs: jobs.filter((j) => j.reviewStatus !== "rejected") });
}
