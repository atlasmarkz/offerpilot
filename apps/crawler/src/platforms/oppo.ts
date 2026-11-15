import { toDay } from "@offerpilot/shared";
import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** OPPO 校招官网 openapi/position/pageNew 列表项。 */
export interface OppoPosition {
  idRecruitPosition: number | string;
  positionName: string;
  projectName?: string | null;
  recruitmentTypeName?: string | null;
  positionDesc?: string | null;
  positionRequire?: string | null;
  knowledgeSkill?: string | null;
  workCityName?: string | null;
  releaseTime?: string | null;
}

const MAX_TEXT = 4000;

export function mapOppoPosition(p: OppoPosition) {
  const req = [p.positionRequire, p.knowledgeSkill].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
  const text = [(p.positionDesc ?? "").trim(), req].filter(Boolean).join("\n");
  const a = extractRequirements(req);
  const b = extractRequirements(`${p.projectName ?? ""}\n${text}`);
  const kindText = `${p.projectName ?? ""}${p.recruitmentTypeName ?? ""}${p.positionName}`;
  return {
    title: p.positionName.trim(),
    kind: kindText.includes("实习") ? "intern" : "fulltime",
    city: (p.workCityName ?? "")
      .split(/[,，、/]/)
      .map((c) => c.replace(/市$/, "").trim())
      .filter(Boolean),
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: a.minDegree ?? b.minDegree,
      // 项目名里常带届别（“2027届博士生招聘”）
      graduationYears: a.graduationYears.length ? a.graduationYears : b.graduationYears,
      majors: a.majors.length ? a.majors : b.majors,
      schoolTags: a.schoolTags.length ? a.schoolTags : b.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    applyUrl: `https://careers.oppo.com/university/oppo/campus/post/${p.idRecruitPosition}`,
  };
}

export function oppoSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<OppoPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/openapi/position/pageNew") && res.request().method() === "POST",
    parse: (body) => {
      const d = (body as { data?: { records?: OppoPosition[]; total?: number } }).data;
      return { items: d?.records ?? [], total: d?.total };
    },
    idOf: (p) => String(p.idRecruitPosition),
    nextButton: "button.btn-next:not([disabled])",
    map: (p) => mapOppoPosition(p),
    postedAt: (p) => toDay(p.releaseTime ?? undefined),
  });
}
