import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractGraduationYears } from "../requirements";
import type { SourceConfig } from "../sources";

/** 米哈游招聘 job/list 列表项。列表里没有职责/要求正文，只有届别说明（objectName）。 */
export interface MihoyoJob {
  id: string;
  title: string;
  addressDetailList?: { addressDetail?: string | null }[] | null;
  /** "全职" / "实习" */
  jobNature?: string | null;
  /** 如 "2027届（2026.9-2027.8之间毕业）"、"2027届及之后毕业的在校生" */
  objectName?: string | null;
}

export function mapMihoyoJob(j: MihoyoJob, cfg: Pick<SourceConfig, "defaultGraduationYears">) {
  const target = j.objectName ?? "";
  // “2027届及之后毕业”是开放区间，不能当成只招 2027 届
  const years = target.includes("之后") ? [] : extractGraduationYears(target);
  return {
    title: j.title.trim(),
    kind: j.jobNature === "实习" ? "intern" : "fulltime",
    city: [...new Set((j.addressDetailList ?? []).map((a) => a.addressDetail?.trim()).filter((c): c is string => !!c))],
    description: "",
    requirements: { graduationYears: years.length ? years : cfg.defaultGraduationYears },
    applyUrl: `https://jobs.mihoyo.com/#/campus/position/${j.id}`,
  };
}

export function mihoyoSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<MihoyoJob>(cfg, {
    isListResponse: (res) => res.url().includes("/ats-portal/v1/job/list") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { list?: MihoyoJob[]; total?: number } }).data;
      return { items: data?.list ?? [], total: data?.total };
    },
    idOf: (j) => j.id,
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (j) => mapMihoyoJob(j, cfg),
  });
}
