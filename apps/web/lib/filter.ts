import { jobDate } from "@offerpilot/shared";
import { companyName } from "./companies";
import { ageDays } from "./jobMeta";
import type { Match } from "./match";

export interface ListFilter {
  /** 关键词，空格分隔，全部命中才保留（标题、公司、城市、职责预览里找） */
  query: string;
  companies: string[];
  cities: string[];
  onlySelected: boolean;
  /** 只看最近 N 天发布（没有发布日期的按收录日期）；0 表示不限 */
  withinDays: number;
  /** 排序：match 按和你的匹配度；new 最新发布在前 */
  sort: "match" | "new";
}

export const EMPTY_FILTER: ListFilter = { query: "", companies: [], cities: [], onlySelected: false, withinDays: 0, sort: "match" };

/** 发布时间筛选的选项（天）。 */
export const WITHIN_OPTIONS = [3, 7, 30] as const;

export interface Facet {
  value: string;
  count: number;
}

const haystack = (m: Match) =>
  [m.job.title, companyName(m.job.companyId), m.job.companyId, m.job.city.join(" "), m.job.description]
    .join("\n")
    .toLowerCase();

/** 按筛选条件过滤；各组条件之间是“且”，同一组内是“或”。 */
export function applyFilter(matches: Match[], f: ListFilter, selected: ReadonlySet<string>, now = new Date()): Match[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = matches.filter((m) => {
    if (f.withinDays > 0) {
      const age = ageDays(m.job, now);
      if (age === undefined || age > f.withinDays) return false;
    }
    if (f.onlySelected && !selected.has(m.job.id)) return false;
    if (f.companies.length && !f.companies.includes(m.job.companyId)) return false;
    if (f.cities.length && !m.job.city.some((c) => f.cities.includes(c))) return false;
    if (words.length) {
      const text = haystack(m);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  if (f.sort === "new") {
    // 最新在前；没有日期的排最后。同一天的保持原来的匹配度顺序（sort 是稳定的）
    const key = (m: Match) => jobDate(m.job).date ?? "";
    out.sort((a, b) => key(b).localeCompare(key(a)));
  }
  return out;
}

/** 统计可选项及数量，按数量从多到少。 */
export function facets(matches: Match[], pick: (m: Match) => string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const m of matches) for (const v of new Set(pick(m))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh"));
}
