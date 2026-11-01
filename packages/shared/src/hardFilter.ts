import type { DegreeLevel, Job, Profile } from "./schema";

const DEGREE_RANK: Record<DegreeLevel, number> = { bachelor: 1, master: 2, phd: 3 };

export interface HardFilterResult {
  pass: boolean;
  /** 未通过的原因，展示给用户以便理解为什么没被推荐 */
  reasons: string[];
}

/** 空列表表示岗位对该项无限制。 */
function allows(list: string[], value: string | undefined): boolean {
  if (list.length === 0) return true;
  return value !== undefined && list.includes(value);
}

export function hardFilter(profile: Profile, job: Job, today = new Date()): HardFilterResult {
  const reasons: string[] = [];
  const req = job.requirements;

  if (job.reviewStatus !== "approved") reasons.push("岗位尚未审核");

  if (job.deadline && new Date(job.deadline) < today) reasons.push("已过截止日期");

  if (req.minDegree && DEGREE_RANK[profile.degree] < DEGREE_RANK[req.minDegree]) {
    reasons.push("学历不满足");
  }
  if (req.graduationYears.length && !req.graduationYears.includes(profile.graduationYear)) {
    reasons.push("毕业届别不符");
  }
  if (req.majors.length && !req.majors.some((m) => profile.major.includes(m))) {
    reasons.push("专业不符");
  }
  if (req.schoolTags.length && !req.schoolTags.some((t) => profile.schoolTags.includes(t))) {
    reasons.push("院校要求不符");
  }
  if (!allows(req.politicalStatus, profile.politicalStatus)) reasons.push("政治面貌要求不符");
  if (!allows(req.hukou, profile.hukou)) reasons.push("户籍要求不符");

  if (profile.cities.length && job.city.length && !job.city.some((c) => profile.cities.includes(c))) {
    reasons.push("工作地不在意向城市");
  }

  return { pass: reasons.length === 0, reasons };
}
