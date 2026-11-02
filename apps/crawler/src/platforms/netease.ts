import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 网易校招（campus.163.com / campus.game.163.com 共用）getJobList 列表项。 */
export interface NeteaseJob {
  id: number;
  positionName: string;
  positionTypeName?: string | null;
  /** 逗号分隔，如 "杭州,上海,广州" */
  workPlaceName?: string | null;
  positionDescription?: string | null;
  positionRequirement?: string | null;
}

const MAX_TEXT = 4000;

export function mapNeteaseJob(j: NeteaseJob, cfg: Pick<SourceConfig, "url" | "defaultKind" | "defaultGraduationYears">) {
  const desc = (j.positionDescription ?? "").trim();
  const req = (j.positionRequirement ?? "").trim();
  const text = [desc, req].filter(Boolean).join("\n");
  const primary = extractRequirements(req);
  const all = extractRequirements(text);
  return {
    title: j.positionName.trim(),
    kind: j.positionName.includes("实习") ? "intern" : cfg.defaultKind,
    city: [...new Set((j.workPlaceName ?? "").split(/[,，、/]+/).map((c) => c.trim()).filter(Boolean))],
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
    // 网易的岗位没有独立详情页（点击行在列表页内展开），投递入口只能落到该项目的岗位列表；
    // 用 #job-<id> 让每个岗位的链接唯一
    applyUrl: `${cfg.url}#job-${j.id}`,
  };
}

export function neteaseSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<NeteaseJob>(cfg, {
    isListResponse: (res) => res.url().includes("/api/campuspc/position/getJobList"),
    parse: (body) => {
      const data = (body as { data?: { list?: NeteaseJob[]; total?: number } }).data;
      return { items: data?.list ?? [], total: data?.total };
    },
    idOf: (j) => String(j.id),
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (j) => mapNeteaseJob(j, cfg),
  });
}
