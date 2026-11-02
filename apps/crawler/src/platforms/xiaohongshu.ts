import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 小红书招聘 pageQueryPosition 列表项（职责与要求已在列表里）。 */
export interface XiaohongshuPosition {
  positionId: number;
  positionName: string;
  /** 如 "上海市，杭州市" */
  workplace?: string | null;
  duty?: string | null;
  qualification?: string | null;
  jobProjectName?: string | null;
}

const MAX_TEXT = 4000;

export function mapXiaohongshuPosition(p: XiaohongshuPosition, cfg: Pick<SourceConfig, "defaultGraduationYears">) {
  const duty = (p.duty ?? "").trim();
  const req = (p.qualification ?? "").trim();
  const text = [duty, req].filter(Boolean).join("\n");
  const primary = extractRequirements(`${p.positionName}\n${req}`);
  const all = extractRequirements(`${p.positionName}\n${text}`);
  return {
    title: p.positionName.trim(),
    kind: `${p.positionName}${p.jobProjectName ?? ""}`.includes("实习") ? "intern" : "fulltime",
    city: [...new Set((p.workplace ?? "").split(/[,，、/\s]+/).map((c) => c.replace(/市$/, "")).filter(Boolean))],
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
    applyUrl: `https://job.xiaohongshu.com/campus/position/${p.positionId}`,
  };
}

export function xiaohongshuSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<XiaohongshuPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/websiterecruit/position/pageQueryPosition") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { list?: XiaohongshuPosition[]; total?: number } }).data;
      return { items: data?.list ?? [], total: data?.total };
    },
    idOf: (p) => String(p.positionId),
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (p) => mapXiaohongshuPosition(p, cfg),
  });
}
