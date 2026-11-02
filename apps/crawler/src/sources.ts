import { readFileSync } from "node:fs";
import { z } from "zod";
import { CompanyType } from "@offerpilot/shared";
import { renderPage } from "./browser";
import { feishuSource } from "./platforms/feishu";
import { jdSource } from "./platforms/jd";
import { meituanSource } from "./platforms/meituan";
import { tencentSource } from "./platforms/tencent";
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
  /** 备注：为什么启用/停用、已知限制 */
  note: z.string().optional(),
  /** 专用平台适配器；generic 走网页文字加大模型抽取 */
  platform: z.enum(["generic", "feishu", "tencent", "meituan", "jd"]).default("generic"),
  /** 单个数据源本次最多取多少条，防止字节这类 7000 条的站跑太久 */
  maxJobs: z.number().int().positive().default(300),
  /** 岗位详情页（也是投递入口）模板，{id} 会被替换 */
  detailUrlTemplate: z.string().optional(),
  /** 岗位文字里没写届别时的默认值（如腾讯列表页只标“2027校园招聘”） */
  /** 只保留招聘类型名称包含这些词的岗位（如同一入口混有社招时填 ["校招","实习"]） */
  recruitTypes: z.array(z.string()).default([]),
  defaultGraduationYears: z.array(z.number().int()).default([]),
  /** http：直接抓 HTML；browser：用 Chrome 渲染（JS 站点） */
  mode: z.enum(["http", "browser"]).default("http"),
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

      const load = async (url: string) => {
        if (cfg.mode === "http") return htmlToText(await politeFetch(url), url);
        const page = await renderPage(url);
        // 岗位常来自 XHR 接口：把捕获到的 JSON 一并交给抽取器
        const json = page.jsonPayloads.map((p) => `\n[JSON ${p.url}]\n${p.body}`).join("");
        return { ...page, text: page.text + json };
      };

      const list = await load(cfg.url);
      const postings = [make(cfg.url, list.text)];

      if (cfg.detailLinkPattern) {
        const re = new RegExp(cfg.detailLinkPattern);
        const details = [...new Set(list.links.map((l) => l.href).filter((h) => re.test(h)))].slice(
          0,
          cfg.maxDetailPages,
        );
        for (const url of details) {
          try {
            postings.push(make(url, (await load(url)).text));
          } catch (e) {
            console.warn(`[${cfg.id}] 跳过详情页 ${url}: ${(e as Error).message}`);
          }
        }
      }
      return postings;
    },
  };
}

/** 按平台选择数据源实现。 */
export function createSource(cfg: SourceConfig): SourceAdapter {
  switch (cfg.platform) {
    case "feishu":
      return feishuSource(cfg);
    case "tencent":
      return tencentSource(cfg);
    case "meituan":
      return meituanSource(cfg);
    case "jd":
      return jdSource(cfg);
    default:
      return pageSource(cfg);
  }
}
