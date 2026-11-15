import { toDay } from "@offerpilot/shared";
import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 拼多多校招官网 recruit/position/list 列表项。 */
export interface PddPosition {
  id: string;
  name: string;
  workLocationName?: string | null;
  workLocation?: string | null;
  releaseTime?: number | null;
  jobDuty?: string | null;
  jobRequire?: string | null;
  recruitTypeName?: string | null;
  graduationYear?: string | null;
}

const MAX_TEXT = 4000;
const PROVINCE = /^(广东|浙江|江苏|四川|湖北|湖南|福建|山东|河南|河北|安徽|陕西|江西|辽宁|吉林|黑龙江|云南|贵州|广西|山西|甘肃|海南)/;

export function mapPddPosition(p: PddPosition, cfg: Pick<SourceConfig, "url" | "defaultKind">) {
  const text = [p.jobDuty, p.jobRequire].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
  const r = extractRequirements(text);
  const year = Number(p.graduationYear);
  // 详情页和列表页同一前缀：/campus/grad/detail 或 /campus/intern/detail
  const base = cfg.url.replace(/\/$/, "");
  const city = (p.workLocationName ?? p.workLocation ?? "").replace(PROVINCE, "").trim();
  return {
    title: p.name.trim(),
    kind: cfg.defaultKind === "intern" || `${p.name}${p.recruitTypeName ?? ""}`.includes("实习") ? "intern" : "fulltime",
    city: city ? [city] : [],
    description: text.slice(0, MAX_TEXT),
    requirements: { ...r, graduationYears: Number.isInteger(year) && year > 2000 ? [year] : r.graduationYears, politicalStatus: [], hukou: [] },
    applyUrl: `${base}/detail?positionId=${encodeURIComponent(p.id)}`,
  };
}

export function pddSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<PddPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/recruit/position/list") && res.request().method() === "POST",
    parse: (body) => {
      const r = (body as { result?: { list?: PddPosition[]; total?: number } }).result;
      return { items: r?.list ?? [], total: r?.total };
    },
    idOf: (p) => p.id,
    nextButton: "li.rocket-pagination-next:not(.rocket-pagination-disabled)",
    map: (p, c) => mapPddPosition(p, c),
    postedAt: (p) => toDay(p.releaseTime ?? undefined),
  });
}
