import { readFileSync } from "node:fs";
import { z } from "zod";
import { CompanyType } from "@offerpilot/shared";
import { politeFetch } from "./fetch";
import { htmlToText } from "./html";
import type { RawPosting, SourceAdapter } from "./pipeline";

const SourceConfig = z.object({
  id: z.string(),
  companyId: z.string(),
  companyType: CompanyType,
  /** 校招岗位列表页或公告页 */
  url: z.string().url(),
  enabled: z.boolean().default(true),
  /** 同时抓取列表页里匹配该正则的详情链接（可选） */
  detailLinkPattern: z.string().optional(),
  maxDetailPages: z.number().int().default(20),
});
export type SourceConfig = z.infer<typeof SourceConfig>;

export function loadSourceConfigs(path: string): SourceConfig[] {
  return z.array(SourceConfig).parse(JSON.parse(readFileSync(path, "utf8")));
}

/** 通用网页数据源：抓列表页，可选地顺着详情链接再抓一层。 */
export function pageSource(cfg: SourceConfig): SourceAdapter {
  return {
    id: cfg.id,
    async fetchPostings() {
      const make = (url: string, text: string): RawPosting => ({
        sourceUrl: url,
        applyUrl: cfg.url,
        text,
        fetchedAt: new Date().toISOString(),
        companyId: cfg.companyId,
        companyType: cfg.companyType,
      });

      const list = htmlToText(await politeFetch(cfg.url), cfg.url);
      const postings = [make(cfg.url, list.text)];

      if (cfg.detailLinkPattern) {
        const re = new RegExp(cfg.detailLinkPattern);
        const details = [...new Set(list.links.map((l) => l.href).filter((h) => re.test(h)))].slice(
          0,
          cfg.maxDetailPages,
        );
        for (const url of details) {
          try {
            postings.push(make(url, htmlToText(await politeFetch(url), url).text));
          } catch (e) {
            console.warn(`[${cfg.id}] 跳过详情页 ${url}: ${(e as Error).message}`);
          }
        }
      }
      return postings;
    },
  };
}
