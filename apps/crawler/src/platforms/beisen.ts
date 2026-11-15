import { toDay } from "@offerpilot/shared";
import { acquire, politeFetch, USER_AGENT } from "../fetch";
import type { RawPosting, SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/**
 * 北森招聘门户（<租户>.zhiye.com，以及 vivo 校招这类自有域名的北森门户）。
 * 长江存储、长鑫存储、摩尔线程、零跑、长安汽车、科大讯飞、三一等都在用。
 *
 * 门户页面在无头浏览器里渲染不出来，但它的前端调用的岗位列表接口是公开的（不需要登录），
 * robots.txt 也允许，所以直接用 HTTP：先从首页 HTML 取 PortalId，再翻 /api/JobAd/GetJobAdPageList。
 * 接口一次返回全部招聘类型，按分类名只保留校招 / 实习。
 */
export interface BeisenJobAd {
  /** 详情页用的 GUID */
  Id: string;
  JobAdName: string;
  Category?: string | null;
  LocNames?: string[] | null;
  Duty?: string | null;
  Require?: string | null;
  PostDate?: string | null;
  Kind?: string | null;
}

const MAX_TEXT = 4000;
const PAGE_SIZE = 100;
/** 校招 / 实习类分类名（各家叫法不一：校园招聘、实习生招聘、青苗计划、飞星计划……） */
const CAMPUS = /校园|校招|应届|实习|管培|青苗|飞星|星火|飞凡|毕业生/;
const NOT_CAMPUS = /社会|社招|内部|大使/;

export function isCampusCategory(category: string | null | undefined): boolean {
  const c = category ?? "";
  return CAMPUS.test(c) && !NOT_CAMPUS.test(c);
}

/** “四川省·成都市” → “成都”；“上海市” → “上海”。 */
export function beisenCity(loc: string): string {
  const last = loc.split(/[·/]/).pop() ?? loc;
  return last.replace(/(市|省|自治区|特别行政区)$/, "").trim();
}

export function mapBeisenJobAd(j: BeisenJobAd, origin: string) {
  const duty = (j.Duty ?? "").trim();
  const req = (j.Require ?? "").trim();
  const text = [duty, req].filter(Boolean).join("\n");
  const a = extractRequirements(req);
  const b = extractRequirements(`${j.JobAdName}\n${text}`);
  // 岗位名常带内部编号：“工艺工程(J14649)”
  const title = j.JobAdName.replace(/\s*[(（]J\d+[)）]\s*$/, "").trim();
  return {
    title,
    kind: /实习/.test(`${j.Category ?? ""}${j.JobAdName}`) ? "intern" : "fulltime",
    city: [...new Set((j.LocNames ?? []).map(beisenCity).filter(Boolean))],
    description: text.slice(0, MAX_TEXT),
    requirements: {
      minDegree: a.minDegree ?? b.minDegree,
      graduationYears: a.graduationYears.length ? a.graduationYears : b.graduationYears,
      majors: a.majors.length ? a.majors : b.majors,
      schoolTags: a.schoolTags.length ? a.schoolTags : b.schoolTags,
      politicalStatus: [],
      hukou: [],
    },
    // ⚠ 详情页地址按北森门户的常见格式拼（门户配置里有“校园招聘详情页”“实习生招聘详情页”两种页面），
    // 无头浏览器里渲染不出来，没能自动验证；用户反馈打不开时改这里
    applyUrl: `${origin}/${/实习/.test(j.Category ?? "") ? "intern" : "campus"}/detail?jobAdId=${encodeURIComponent(j.Id)}`,
    postedAt: toDay(j.PostDate ?? undefined),
  };
}

export function beisenSource(cfg: SourceConfig): SourceAdapter {
  return {
    id: cfg.id,
    async fetchPostings(): Promise<RawPosting[]> {
      const origin = new URL(cfg.url).origin;
      const html = await politeFetch(`${origin}/`);
      const portalId = html.match(/"PortalId":"([0-9a-f-]{36})"/)?.[1];
      if (!portalId) throw new Error("页面里没找到 PortalId（可能不是北森门户，或门户改版了）");

      const all: BeisenJobAd[] = [];
      let count = Infinity;
      for (let page = 0; all.length < count && page < 60; page++) {
        const url = new URL(`${origin}/api/JobAd/GetJobAdPageList`);
        await acquire(url);
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json", "Accept-Language": "zh-CN,zh;q=0.9" },
          body: JSON.stringify({ PageIndex: page, PageSize: PAGE_SIZE, KeyWords: "", SpecialType: 0, PortalId: portalId, DisplayFields: ["Category", "Kind", "LocId"] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
        const body = (await res.json()) as { Code?: number; Count?: number; Data?: BeisenJobAd[] };
        if (body.Code !== 200 || !Array.isArray(body.Data)) throw new Error(`接口返回异常：${String(body.Code)}`);
        count = body.Count ?? 0;
        all.push(...body.Data);
        if (body.Data.length < PAGE_SIZE) break;
      }

      const campus = all.filter((j) => isCampusCategory(j.Category));
      const candidates = campus.slice(0, cfg.maxJobs).map((j) => mapBeisenJobAd(j, origin));
      if (candidates.length === 0) throw new Error(`共 ${all.length} 个岗位，没有校招 / 实习分类（可能这一季还没开）`);
      console.log(`[${cfg.id}] 共 ${all.length}/${count} 个岗位，其中校招 / 实习 ${campus.length} 个`);
      return [
        {
          sourceUrl: cfg.url,
          applyUrl: cfg.url,
          text: "",
          fetchedAt: new Date().toISOString(),
          companyId: cfg.companyId,
          companyType: cfg.companyType,
          candidates,
          // 翻完了全部岗位，且校招 / 实习没被 maxJobs 截断
          complete: all.length >= count && campus.length <= cfg.maxJobs,
        },
      ];
    },
  };
}
