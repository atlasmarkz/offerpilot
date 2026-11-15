import { toDay } from "@offerpilot/shared";
import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 阿里巴巴校招官网 position/search 列表项里用到的字段（列表里已有职责和要求）。 */
export interface AlibabaPosition {
  id: number | string;
  name: string;
  status?: string | null;
  requirement?: string | null;
  description?: string | null;
  workLocations?: string[] | null;
  /** 毕业时间范围（毫秒时间戳） */
  graduationTime?: { from?: number | null; to?: number | null } | null;
  publishTime?: number | null;
}

const MAX_TEXT = 4000;

/** 毕业时间范围 → 届别（取结束时间所在年，如 2026-11 ~ 2027-10 → 2027 届）。 */
export function graduationYearsOf(g: AlibabaPosition["graduationTime"]): number[] {
  const to = g?.to ? new Date(g.to + 8 * 3600_000).getUTCFullYear() : undefined;
  return to && to >= 2020 && to <= 2040 ? [to] : [];
}

export function mapAlibabaPosition(p: AlibabaPosition) {
  const req = (p.requirement ?? "").trim();
  const desc = (p.description ?? "").trim();
  const text = `${desc}\n${req}`.trim();
  const a = extractRequirements(req);
  const b = extractRequirements(text);
  const years = graduationYearsOf(p.graduationTime);
  return {
    title: p.name.trim(),
    kind: p.name.includes("实习") ? "intern" : "fulltime",
    city: [...new Set((p.workLocations ?? []).map((c) => c.trim()).filter(Boolean))],
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: a.minDegree ?? b.minDegree,
      graduationYears: years.length ? years : a.graduationYears.length ? a.graduationYears : b.graduationYears,
      majors: a.majors.length ? a.majors : b.majors,
      schoolTags: a.schoolTags.length ? a.schoolTags : b.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    applyUrl: `https://campus-talent.alibaba.com/campus/position/${p.id}`,
  };
}

export function alibabaSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<AlibabaPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/position/search") && res.request().method() === "POST",
    parse: (body) => {
      const c = (body as { content?: { datas?: AlibabaPosition[]; totalCount?: number; total?: number } }).content;
      return { items: c?.datas ?? [], total: c?.totalCount ?? c?.total };
    },
    idOf: (p) => String(p.id),
    nextButton: "button.next-next:not([disabled])",
    map: (p) => mapAlibabaPosition(p),
    // 列表里有 status；只要在招的
    keep: (p) => !p.status || p.status === "recruit",
    // modifyTime 是修改时间，不当发布日期；publishTime 目前为空，有值时才用
    postedAt: (p) => toDay(p.publishTime ?? undefined),
  });
}
