import type { RawPosting, SourceAdapter } from "../pipeline";
import { politeFetch } from "../fetch";
import { htmlToText } from "../html";
import type { SourceConfig } from "../sources";

/** Jane Street 公开的岗位 JSON（https://www.janestreet.com/jobs/main.json）。 */
export interface JaneStreetJob {
  id: number;
  position: string;
  /** "Full-Time: New Grad" / "Full-Time: Experienced" / "Summer Internship" */
  availability: string;
  city: string;
  overview?: string | null;
}

const CITY: Record<string, string> = { NYC: "纽约", LDN: "伦敦", HKG: "香港", SGP: "新加坡", ATX: "奥斯汀", CHI: "芝加哥" };
const MAX_TEXT = 4000;

/** 只要应届（New Grad）和实习，社招（Experienced）丢弃。 */
export function isCampus(j: JaneStreetJob): boolean {
  return /New Grad|Intern/i.test(j.availability);
}

export function mapJaneStreetJob(j: JaneStreetJob) {
  return {
    title: j.position.trim(),
    kind: /Intern/i.test(j.availability) ? "intern" : "fulltime",
    city: [CITY[j.city] ?? j.city],
    description: htmlToText(`<body>${j.overview ?? ""}</body>`, "https://www.janestreet.com/").text.slice(0, MAX_TEXT),
    requirements: {},
    applyUrl: `https://www.janestreet.com/join-jane-street/position/${j.id}/`,
  };
}

export function janeStreetSource(cfg: SourceConfig): SourceAdapter {
  return {
    id: cfg.id,
    async fetchPostings(): Promise<RawPosting[]> {
      const jobs = JSON.parse(await politeFetch(cfg.url)) as JaneStreetJob[];
      const candidates = jobs.filter(isCampus).slice(0, cfg.maxJobs).map(mapJaneStreetJob);
      if (candidates.length === 0) throw new Error("没有应届/实习岗位（接口结构可能变了）");
      return [
        {
          sourceUrl: cfg.url,
          applyUrl: cfg.url,
          text: "",
          fetchedAt: new Date().toISOString(),
          companyId: cfg.companyId,
          companyType: cfg.companyType,
          candidates,
        },
      ];
    },
  };
}
