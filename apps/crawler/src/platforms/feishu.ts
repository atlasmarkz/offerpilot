import { paginatedSource } from "./paginated";
import type { SourceAdapter } from "../pipeline";
import { extractRequirements } from "../requirements";
import type { SourceConfig } from "../sources";

/** 飞书招聘（字节、蔚来、理想、小米等共用）岗位接口里我们用到的字段。 */
export interface FeishuPost {
  id: string;
  title: string;
  description?: string | null;
  requirement?: string | null;
  city_list?: { name?: string | null }[] | null;
  city_info?: { name?: string | null } | null;
  recruit_type?: { name?: string | null; parent?: { name?: string | null } | null } | null;
  publish_time?: number | null;
}

const MAX_TEXT = 4000;

function mergeRequirements(primary: string, fallback: string) {
  const a = extractRequirements(primary);
  const b = extractRequirements(fallback);
  return {
    minDegree: a.minDegree ?? b.minDegree,
    graduationYears: a.graduationYears.length ? a.graduationYears : b.graduationYears,
    majors: a.majors.length ? a.majors : b.majors,
    schoolTags: a.schoolTags.length ? a.schoolTags : b.schoolTags,
    politicalStatus: [],
    hukou: [],
  };
}

export function mapFeishuPost(post: FeishuPost, detailUrl: string): Record<string, unknown> {
  const description = (post.description ?? "").trim();
  const requirement = (post.requirement ?? "").trim();
  const cities = (post.city_list?.length ? post.city_list : post.city_info ? [post.city_info] : [])
    .map((c) => c.name?.trim())
    .filter((n): n is string => !!n);

  return {
    title: post.title.trim(),
    kind: (post.recruit_type?.name ?? "").includes("实习") ? "intern" : "fulltime",
    city: [...new Set(cities)],
    description: `${description}\n${requirement}`.trim().slice(0, MAX_TEXT),
    // 硬条件优先从“任职要求”里抽，抽不到再看全文
    requirements: mergeRequirements(requirement, `${description}\n${requirement}`),
    applyUrl: detailUrl,
  };
}

export function feishuSource(cfg: SourceConfig): SourceAdapter {
  const template = cfg.detailUrlTemplate ?? new URL("/position/{id}/detail", cfg.url).toString();
  return paginatedSource<FeishuPost>(cfg, {
    isListResponse: (res) => res.url().includes("/search/job/posts") && res.request().method() === "POST",
    parse: (body) => {
      const data = (body as { data?: { job_post_list?: FeishuPost[]; count?: number } }).data;
      return { items: data?.job_post_list ?? [], total: data?.count };
    },
    idOf: (p) => p.id,
    nextButton: "li.atsx-pagination-next:not(.atsx-pagination-disabled)",
    map: (p) => mapFeishuPost(p, template.replace("{id}", p.id)),
    keep: (p, c) => {
      if (c.recruitTypes.length === 0) return true;
      const names = `${p.recruit_type?.name ?? ""}${p.recruit_type?.parent?.name ?? ""}`;
      return c.recruitTypes.some((t) => names.includes(t));
    },
  });
}
