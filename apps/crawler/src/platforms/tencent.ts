import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import type { SourceConfig } from "../sources";

/** 腾讯校招 join.qq.com 的岗位列表项。列表里没有职责/要求正文。 */
export interface TencentPosition {
  id: number;
  postId: string;
  positionTitle: string;
  workCities?: string | null;
  projectName?: string | null;
  recruitLabelName?: string | null;
}

export function mapTencentPosition(p: TencentPosition, cfg: Pick<SourceConfig, "defaultGraduationYears">) {
  const label = `${p.recruitLabelName ?? ""}${p.projectName ?? ""}`;
  const kind = label.includes("实习") ? "intern" : "fulltime";
  return {
    title: p.positionTitle.trim(),
    kind,
    // “深圳总部 北京 上海” -> ["深圳", "北京", "上海"]
    city: [...new Set((p.workCities ?? "").split(/\s+/).map((c) => c.replace(/总部$/, "")).filter(Boolean))],
    description: "",
    requirements: { graduationYears: cfg.defaultGraduationYears },
    applyUrl: `https://join.qq.com/post_detail.html?postid=${p.postId}`,
  };
}

export function tencentSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<TencentPosition>(cfg, {
    isListResponse: (res) => res.url().includes("/position/searchPosition") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { positionList?: TencentPosition[]; count?: number } }).data;
      return { items: data?.positionList ?? [], total: data?.count };
    },
    idOf: (p) => p.postId,
    nextButton: "button.btn-next:not([disabled])",
    map: (p) => mapTencentPosition(p, cfg),
  });
}
