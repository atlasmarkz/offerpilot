import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 京东校招 campus.jd.com 的岗位列表项。 */
export interface JdPosition {
  publishId: number;
  positionName: string;
  jobDirection?: string | null;
  workContent?: string | null;
  qualification?: string | null;
  requirementVoList?: { workCity?: string | null }[] | null;
}

const MAX_TEXT = 4000;

/** “广东省-广州市” -> “广州”；“上海市-上海市” -> “上海” */
export function jdCity(raw: string): string {
  const last = raw.split("-").slice(-1)[0] ?? raw;
  return last.replace(/市$/, "").trim();
}

export function mapJdPosition(p: JdPosition) {
  const qualification = (p.qualification ?? "").trim();
  const content = (p.workContent ?? "").trim();
  const text = `${content}\n${qualification}`.trim();
  const primary = extractRequirements(qualification);
  const all = extractRequirements(text);
  const cities = (p.requirementVoList ?? []).map((r) => (r.workCity ? jdCity(r.workCity) : "")).filter(Boolean);
  return {
    title: p.positionName.trim(),
    kind: p.positionName.includes("实习") ? "intern" : "fulltime",
    city: [...new Set(cities)],
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: primary.minDegree ?? all.minDegree,
      graduationYears: primary.graduationYears.length ? primary.graduationYears : all.graduationYears,
      majors: primary.majors.length ? primary.majors : all.majors,
      schoolTags: primary.schoolTags.length ? primary.schoolTags : all.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    applyUrl: `https://campus.jd.com/#/details?id=${p.publishId}`,
  };
}

export function jdSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<JdPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/api/wx/position/page") && res.request().method() === "POST",
    parse: (body) => {
      const b = (body as { body?: { items?: JdPosition[]; totalNumber?: number } }).body;
      return { items: b?.items ?? [], total: b?.totalNumber };
    },
    idOf: (p) => String(p.publishId),
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (p) => mapJdPosition(p),
  });
}
