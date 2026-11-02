import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 美团招聘 getJobList 列表项（职责与要求已在列表里，不需要再请求详情）。 */
export interface MeituanJob {
  jobUnionId: string;
  name: string;
  /** "1" 校招，"2" 实习 */
  jobType?: string | null;
  cityList?: { name?: string | null }[] | null;
  jobDuty?: string | null;
  jobRequirement?: string | null;
  highLight?: string | null;
}

const MAX_TEXT = 4000;

export function mapMeituanJob(j: MeituanJob) {
  const duty = (j.jobDuty ?? "").trim();
  const req = (j.jobRequirement ?? "").trim();
  const highlight = (j.highLight ?? "").trim();
  const text = [duty, req, highlight].filter(Boolean).join("\n");
  const primary = extractRequirements(req);
  const all = extractRequirements(text);
  return {
    title: j.name.trim(),
    kind: j.jobType === "2" ? "intern" : "fulltime",
    city: [...new Set((j.cityList ?? []).map((c) => c.name?.replace(/市$/, "").trim()).filter((n): n is string => !!n))],
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: primary.minDegree ?? all.minDegree,
      graduationYears: primary.graduationYears.length ? primary.graduationYears : all.graduationYears,
      majors: primary.majors.length ? primary.majors : all.majors,
      schoolTags: primary.schoolTags.length ? primary.schoolTags : all.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    applyUrl: `https://zhaopin.meituan.com/web/position/detail?jobUnionId=${j.jobUnionId}&highlightType=campus`,
  };
}

export function meituanSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<MeituanJob>(cfg, {
    isListResponse: (res) => res.url().includes("/api/official/job/getJobList") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { list?: MeituanJob[]; page?: { totalCount?: number } } }).data;
      return { items: data?.list ?? [], total: data?.page?.totalCount };
    },
    idOf: (j) => j.jobUnionId,
    nextButton: "li.mtd-pagination-next:not(.mtd-pagination-item-disabled)",
    map: (j) => mapMeituanJob(j),
  });
}
