import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import type { Job } from "@offerpilot/shared";
import { JobStore } from "./store";

/** 页面里应该能找到的岗位名片段：去掉开头的【…】/(…) 标注后取前 6 个字。 */
export function titleKey(title: string): string {
  return title
    .replace(/^[\s【\[（(][^】\]）)]*[】\]）)]/, "")
    .replace(/\s+/g, "")
    .slice(0, 6);
}

/** 从一组岗位里均匀抽 n 个（结果稳定，便于复查）。 */
export function pickSample<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]!);
}

/** 抽样通过率达到 minRate 才放行整组。 */
export function decide(passed: number, total: number, minRate = 0.8): boolean {
  return total > 0 && passed / total >= minRate;
}

interface Check {
  id: string;
  url: string;
  ok: boolean;
  why: string;
}

async function checkOne(job: Job, browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<Check> {
  const base = { id: job.id, url: job.applyUrl };
  const context = await browser.newContext({ locale: "zh-CN" });
  const page = await context.newPage();
  try {
    const res = await page.goto(job.applyUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
    if (res && res.status() >= 400) return { ...base, ok: false, why: `HTTP ${res.status()}` };
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, "");
    // 网易的岗位没有独立详情页（链接带 #job-，落在项目列表第一页），只能确认页面正常打开
    if (job.applyUrl.includes("#job-")) return { ...base, ok: text.length > 200, why: "仅确认页面可打开（无独立详情页）" };
    const key = titleKey(job.title);
    return text.includes(key) ? { ...base, ok: true, why: "页面含岗位名" } : { ...base, ok: false, why: `页面里没找到「${key}」` };
  } catch (e) {
    return { ...base, ok: false, why: (e as Error).message.split("\n")[0]!.slice(0, 80) };
  } finally {
    await context.close();
  }
}

async function main() {
  const dry = process.argv.includes("--dry");
  const perSource = 5;
  const store = new JobStore(join(import.meta.dirname, "..", "data", "jobs.json"));

  const groups = new Map<string, Job[]>();
  for (const j of store.list("pending")) (groups.get(j.sourceUrl) ?? groups.set(j.sourceUrl, []).get(j.sourceUrl)!).push(j);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const report: Record<string, unknown>[] = [];
  let approved = 0;
  try {
    for (const [source, jobs] of groups) {
      const sample = pickSample(jobs, perSource);
      const checks: Check[] = [];
      for (const j of sample) checks.push(await checkOne(j, browser));
      const passed = checks.filter((c) => c.ok).length;
      const pass = decide(passed, checks.length);
      let n = 0;
      if (pass && !dry) {
        n = store.setStatusWhere((j) => j.sourceUrl === source, "pending", "approved");
        approved += n;
      }
      console.log(`${pass ? "通过" : "未通过"}  ${passed}/${checks.length}  ${jobs[0]!.companyId.padEnd(12)} ${jobs.length} 条${pass && !dry ? `，已批准 ${n}` : ""}  ${source}`);
      for (const c of checks.filter((x) => !x.ok)) console.log(`        ✗ ${c.url}  ${c.why}`);
      report.push({ source, companyId: jobs[0]!.companyId, total: jobs.length, sampled: checks.length, passed, approved: pass && !dry, checks });
    }
  } finally {
    await browser.close();
  }
  if (!dry) store.save();
  writeFileSync(join(import.meta.dirname, "..", "data", "verify-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n共批准 ${approved} 条${dry ? "（--dry 只检查，未改动）" : ""}。明细见 data/verify-report.json`);
}

if (process.argv[1]?.endsWith("verifyLinks.ts")) await main();
