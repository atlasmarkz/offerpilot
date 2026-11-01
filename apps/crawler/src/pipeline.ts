import { createHash } from "node:crypto";
import { Job, type CompanyType } from "@offerpilot/shared";

/** 一条原始公告：数据源适配器的输出，尚未结构化。 */
export interface RawPosting {
  sourceUrl: string;
  /** 抽取结果没给出投递链接时的兜底 */
  applyUrl: string;
  /** 页面或公告的纯文本，同时作为原文快照入库 */
  text: string;
  fetchedAt: string;
  companyId: string;
  companyType: CompanyType;
}

/** 每个数据源（企业官网、聚合站等）实现一个适配器。 */
export interface SourceAdapter {
  id: string;
  fetchPostings(): Promise<RawPosting[]>;
}

/** 抽取结果：大模型只负责岗位内容，身份、来源、审核状态由管道填。 */
export type Extractor = (raw: RawPosting) => Promise<unknown[]>;

export interface PipelineResult {
  accepted: Job[];
  /** 抽取结果不符合 schema 的条目，留作人工排查 */
  invalid: { raw: RawPosting; error: string }[];
  /** 本批内重复（同一投递链接且同标题）被丢弃的数量 */
  duplicates: number;
}

export function jobId(applyUrl: string, title: string): string {
  return createHash("sha256").update(`${applyUrl}\n${title}`).digest("hex").slice(0, 16);
}

function resolveUrl(candidate: unknown, base: string, fallback: string): string {
  if (typeof candidate !== "string" || !candidate) return fallback;
  try {
    return new URL(candidate, base).toString();
  } catch {
    return fallback;
  }
}

export async function runPipeline(sources: SourceAdapter[], extract: Extractor): Promise<PipelineResult> {
  const accepted: Job[] = [];
  const invalid: PipelineResult["invalid"] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const source of sources) {
    const postings = await source.fetchPostings();
    for (const raw of postings) {
      let candidates: unknown[];
      try {
        candidates = await extract(raw);
      } catch (e) {
        invalid.push({ raw, error: `extract failed: ${(e as Error).message}` });
        continue;
      }
      for (const candidate of candidates) {
        const c = (candidate ?? {}) as Record<string, unknown>;
        const applyUrl = resolveUrl(c.applyUrl, raw.sourceUrl, raw.applyUrl);
        const title = typeof c.title === "string" ? c.title : "";
        const id = jobId(applyUrl, title);
        if (seen.has(id)) {
          duplicates++;
          continue;
        }
        // 身份与来源由管道强制覆盖；一律 pending，必须人工审核后才可见
        const parsed = Job.safeParse({
          ...c,
          id,
          companyId: raw.companyId,
          companyType: raw.companyType,
          applyUrl,
          sourceUrl: raw.sourceUrl,
          reviewStatus: "pending",
        });
        if (parsed.success) {
          seen.add(id);
          accepted.push(parsed.data);
        } else {
          invalid.push({ raw, error: parsed.error.message });
        }
      }
    }
  }
  return { accepted, invalid, duplicates };
}
