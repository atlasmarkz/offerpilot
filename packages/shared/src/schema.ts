import { z } from "zod";

export const DegreeLevel = z.enum(["bachelor", "master", "phd"]);
export type DegreeLevel = z.infer<typeof DegreeLevel>;

export const CompanyType = z.enum(["internet", "finance", "soe"]);
export type CompanyType = z.infer<typeof CompanyType>;

export const JobKind = z.enum(["fulltime", "intern"]);
export type JobKind = z.infer<typeof JobKind>;

/** 经历原子：画像里最小的可复用素材，用于定制简历与简答题。 */
export const ExperienceAtom = z.object({
  kind: z.enum(["project", "internship", "research", "award", "campus"]),
  title: z.string(),
  org: z.string().optional(),
  /** 实习/工作所在部门 */
  department: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  bullets: z.array(z.string()),
  skills: z.array(z.string()).default([]),
});
export type ExperienceAtom = z.infer<typeof ExperienceAtom>;

export const Profile = z.object({
  name: z.string(),
  school: z.string(),
  /** 是否 985/211/海外名校等，用于院校门槛过滤 */
  schoolTags: z.array(z.string()).default([]),
  major: z.string(),
  degree: DegreeLevel,
  graduationYear: z.number().int(),
  gpaPercentile: z.number().min(0).max(100).optional(),
  cities: z.array(z.string()).default([]),
  targetCompanyTypes: z.array(CompanyType).default([]),
  targetRoles: z.array(z.string()).default([]),
  /** 国企常见硬条件 */
  politicalStatus: z.string().optional(),
  hukou: z.string().optional(),
  experiences: z.array(ExperienceAtom).default([]),
});
export type Profile = z.infer<typeof Profile>;

export const JobRequirements = z.object({
  minDegree: DegreeLevel.optional(),
  graduationYears: z.array(z.number().int()).default([]),
  majors: z.array(z.string()).default([]),
  schoolTags: z.array(z.string()).default([]),
  politicalStatus: z.array(z.string()).default([]),
  hukou: z.array(z.string()).default([]),
});
export type JobRequirements = z.infer<typeof JobRequirements>;

export const Job = z.object({
  id: z.string(),
  companyId: z.string(),
  companyType: CompanyType,
  title: z.string(),
  kind: JobKind,
  city: z.array(z.string()).default([]),
  description: z.string().default(""),
  requirements: JobRequirements.default({}),
  deadline: z.string().optional(),
  applyUrl: z.string().url(),
  sourceUrl: z.string().url(),
  /** 自动抽取的岗位必须人工审核后才能展示 */
  reviewStatus: z.enum(["pending", "approved", "rejected"]).default("pending"),
});
export type Job = z.infer<typeof Job>;
