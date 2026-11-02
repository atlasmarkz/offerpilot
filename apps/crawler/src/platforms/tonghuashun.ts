import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 同花顺校招 apply_list 列表项（职责 intro、要求 requirement 都在列表里）。 */
export interface TonghuashunJob {
  id: number;
  name: string;
  intro?: string | null;
  requirement?: string | null;
  /** 工作地，如 "杭州" */
  base?: string | null;
  /** 如 "2027届校园招聘"、"2027届暑期实习" */
  apply_recruitment_series_name?: string | null;
}

const MAX_TEXT = 4000;

export function mapTonghuashunJob(j: TonghuashunJob, cfg: Pick<SourceConfig, "defaultGraduationYears">) {
  const req = (j.requirement ?? "").trim();
  const text = [(j.intro ?? "").trim(), req].filter(Boolean).join("\n");
  const series = j.apply_recruitment_series_name ?? "";
  const primary = extractRequirements(`${series}\n${req}`);
  const all = extractRequirements(`${series}\n${text}`);
  return {
    title: j.name.trim(),
    kind: series.includes("实习") || j.name.includes("实习") ? "intern" : "fulltime",
    city: [...new Set((j.base ?? "").split(/[,，、/\s]+/).map((c) => c.replace(/市$/, "")).filter(Boolean))],
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: primary.minDegree ?? all.minDegree,
      graduationYears: primary.graduationYears.length
        ? primary.graduationYears
        : all.graduationYears.length
          ? all.graduationYears
          : cfg.defaultGraduationYears,
      majors: primary.majors.length ? primary.majors : all.majors,
      schoolTags: primary.schoolTags.length ? primary.schoolTags : all.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    applyUrl: `https://campus.10jqka.com.cn/job/detail?id=${j.id}`,
  };
}

export function tonghuashunSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<TonghuashunJob>(cfg, {
    isListResponse: (res) => res.url().includes("/school_recruitment/apply/apply_list") && res.request().method() === "GET",
    parse: (body) => {
      const e = (body as { ex_data?: { apply_show_do_list?: TonghuashunJob[]; total?: number } }).ex_data;
      return { items: e?.apply_show_do_list ?? [], total: e?.total };
    },
    idOf: (j) => String(j.id),
    nextButton: "button.btn-next:not([disabled])",
    map: (j) => mapTonghuashunJob(j, cfg),
  });
}
