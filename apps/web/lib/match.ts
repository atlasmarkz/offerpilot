import { hardFilter, type Job, type JobKind, type Profile } from "@offerpilot/shared";

export interface Match {
  job: Job;
  score: number;
  /** 岗位没写、所以没法判断的条件，提醒用户自己核对 */
  unknown: string[];
}

export interface MatchResult {
  matches: Match[];
  /** 被硬条件挡掉的岗位数，按原因统计 */
  rejected: Record<string, number>;
}

export interface MatchOptions {
  kind: JobKind;
  /** 本地试用：把未审核的岗位也当作可展示 */
  includeUnreviewed: boolean;
  today?: Date;
}

const UNREVIEWED = "岗位尚未审核";

/** 硬条件过滤 + 简单排序：意向岗位关键词命中最重，其次意向公司类型、意向城市。 */
export function matchJobs(profile: Profile, jobs: Job[], opts: MatchOptions): MatchResult {
  const matches: Match[] = [];
  const rejected: Record<string, number> = {};
  const roles = profile.targetRoles.map((r) => r.trim().toLowerCase()).filter(Boolean);

  for (const job of jobs) {
    if (job.kind !== opts.kind) continue;
    const { reasons } = hardFilter(profile, job, opts.today);
    const blocking = reasons.filter((r) => !(opts.includeUnreviewed && r === UNREVIEWED));
    if (blocking.length) {
      for (const r of blocking) rejected[r] = (rejected[r] ?? 0) + 1;
      continue;
    }

    const title = job.title.toLowerCase();
    let score = 0;
    for (const r of roles) if (title.includes(r)) score += 3;
    if (profile.targetCompanyTypes.includes(job.companyType)) score += 1;
    if (profile.cities.length && job.city.some((c) => profile.cities.includes(c))) score += 1;
    // 岗位有明确要求而且我们都满足，比什么都没写的更可信
    const req = job.requirements;
    if (req.minDegree) score += 0.5;
    if (req.graduationYears.length) score += 0.5;

    const unknown: string[] = [];
    if (!req.minDegree) unknown.push("学历");
    if (!req.graduationYears.length) unknown.push("届别");
    if (!req.majors.length) unknown.push("专业");
    matches.push({ job, score, unknown });
  }

  matches.sort((a, b) => b.score - a.score || a.job.title.localeCompare(b.job.title, "zh"));
  return { matches, rejected };
}
