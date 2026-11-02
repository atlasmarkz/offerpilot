import { companyName } from "./companies";
import type { Match } from "./match";

export interface ListFilter {
  /** 关键词，空格分隔，全部命中才保留（标题、公司、城市、职责预览里找） */
  query: string;
  companies: string[];
  cities: string[];
  onlySelected: boolean;
}

export const EMPTY_FILTER: ListFilter = { query: "", companies: [], cities: [], onlySelected: false };

export interface Facet {
  value: string;
  count: number;
}

const haystack = (m: Match) =>
  [m.job.title, companyName(m.job.companyId), m.job.companyId, m.job.city.join(" "), m.job.description]
    .join("\n")
    .toLowerCase();

/** 按筛选条件过滤；各组条件之间是“且”，同一组内是“或”。 */
export function applyFilter(matches: Match[], f: ListFilter, selected: ReadonlySet<string>): Match[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return matches.filter((m) => {
    if (f.onlySelected && !selected.has(m.job.id)) return false;
    if (f.companies.length && !f.companies.includes(m.job.companyId)) return false;
    if (f.cities.length && !m.job.city.some((c) => f.cities.includes(c))) return false;
    if (words.length) {
      const text = haystack(m);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

/** 统计可选项及数量，按数量从多到少。 */
export function facets(matches: Match[], pick: (m: Match) => string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const m of matches) for (const v of new Set(pick(m))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh"));
}
