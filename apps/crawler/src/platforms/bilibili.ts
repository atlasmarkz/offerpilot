import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 哔哩哔哩招聘 positionList 列表项（职责与要求已在列表里）。 */
export interface BilibiliPosition {
  id: number;
  positionName: string;
  /** "实习" / "全职" */
  positionTypeName?: string | null;
  workLocation?: string | null;
  positionDescription?: string | null;
}

const MAX_TEXT = 4000;

export function mapBilibiliPosition(p: BilibiliPosition, cfg: Pick<SourceConfig, "defaultGraduationYears">) {
  const text = (p.positionDescription ?? "").trim();
  // 要求写在“工作要求:”之后，优先从这里抽，抽不到再看全文
  const reqPart = text.includes("工作要求") ? text.slice(text.indexOf("工作要求")) : text;
  const primary = extractRequirements(reqPart);
  const all = extractRequirements(text);
  return {
    title: p.positionName.trim(),
    kind: (p.positionTypeName ?? "").includes("实习") ? "intern" : "fulltime",
    city: [...new Set((p.workLocation ?? "").split(/[,，、/\s]+/).map((c) => c.replace(/市$/, "")).filter(Boolean))],
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
    applyUrl: `https://jobs.bilibili.com/campus/positions/${p.id}`,
  };
}

export function bilibiliSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<BilibiliPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/api/campus/position/positionList") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { list?: BilibiliPosition[]; total?: number } }).data;
      return { items: data?.list ?? [], total: data?.total };
    },
    idOf: (p) => String(p.id),
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (p) => mapBilibiliPosition(p, cfg),
  });
}
