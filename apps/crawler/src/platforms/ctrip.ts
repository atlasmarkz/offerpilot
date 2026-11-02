import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { htmlToText } from "../html";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 携程招聘 getJobAd 列表项；职责与要求是 HTML，写在 requirements 里。 */
export interface CtripJob {
  fromId: string;
  jobTitle: string;
  cityName?: string | null;
  requirements?: string | null;
  duty?: string | null;
  /** "应届校招生" / "实习生" 等 */
  kindName?: string | null;
}

const MAX_TEXT = 4000;
const plain = (html?: string | null) =>
  html ? htmlToText(`<body>${html.replace(/<\/(p|li|div)>/gi, "\n")}</body>`, "https://careers.ctrip.com/").text : "";

export function mapCtripJob(j: CtripJob) {
  const text = [plain(j.duty), plain(j.requirements)].filter(Boolean).join("\n");
  const r = extractRequirements(text);
  return {
    // 标题末尾带职位编号，如“商务合作（2027届秋招）(MJ037473)”
    title: j.jobTitle.replace(/\s*\([A-Z]{2}\d+\)\s*$/, "").trim(),
    kind: (j.kindName ?? "").includes("实习") ? "intern" : "fulltime",
    city: j.cityName ? [j.cityName.trim()] : [],
    description: text.slice(0, MAX_TEXT),
    requirements: { ...r, politicalStatus: [], hukou: [] },
    applyUrl: `https://careers.ctrip.com/#/campus/job-detail/${j.fromId}`,
  };
}

export function ctripSource(cfg: SourceConfig): SourceAdapter {
  return paginatedSource<CtripJob>(cfg, {
    isListResponse: (res) => res.url().includes("/api/hrrecruit/getJobAd") && res.request().method() === "POST",
    parse: (body) => {
      const v = (body as { retValue?: { recruitJobAdList?: CtripJob[]; total?: number } }).retValue;
      return { items: v?.recruitJobAdList ?? [], total: v?.total };
    },
    idOf: (j) => j.fromId,
    nextButton: "li.ant-pagination-next:not(.ant-pagination-disabled)",
    map: (j) => mapCtripJob(j),
  });
}
