import { ExperienceAtom } from "./schema";
import { z } from "zod";

const short = (n: number) => z.string().max(n).default("");

export const Education = z.object({
  school: short(80),
  major: short(80),
  /** 本科 / 硕士 / 博士 等，自由文字 */
  degree: short(20),
  start: short(20),
  end: short(20),
  gpa: short(40),
  /** 所在学院、实验室、导师、荣誉奖项：很多官方投递页会单独问，在平台填好后各家都能直接用 */
  college: short(80),
  lab: short(80),
  advisor: short(40),
  honors: short(500),
  highlights: z.array(z.string().max(300)).max(8).default([]),
});
export type Education = z.infer<typeof Education>;

/**
 * 在线简历的结构化数据。云端每人只存【最新一份】，不存原始文件和全文。
 * 联系方式由用户自己填写，不会发给大模型。
 */
export const ResumeData = z.object({
  contact: z
    .object({
      name: short(40),
      phone: short(30),
      email: short(100),
      city: short(40),
      links: z.array(z.string().max(200)).max(5).default([]),
    })
    .default({}),
  summary: short(500),
  education: z.array(Education).max(6).default([]),
  experiences: z.array(ExperienceAtom).max(20).default([]),
  skills: z.array(z.string().max(60)).max(40).default([]),
});
export type ResumeData = z.infer<typeof ResumeData>;

export const emptyResume = (): ResumeData => ResumeData.parse({});

const MAX_BYTES = 100_000;

/** 不可信输入（云端、模型输出、本地存储）逐段校验：坏的段落丢掉，不让整份简历丢失。 */
export function normalizeResume(raw: unknown): ResumeData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const each = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown, max: number): T[] =>
    (Array.isArray(v) ? v : []).slice(0, max).flatMap((x) => {
      const p = schema.safeParse(x);
      return p.success ? [p.data] : [];
    });
  const strs = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, max);
  const contact = ResumeData.shape.contact.safeParse(o.contact);
  return {
    contact: contact.success ? contact.data : emptyResume().contact,
    summary: typeof o.summary === "string" ? o.summary.slice(0, 500) : "",
    education: each(Education, o.education, 6),
    experiences: each(ExperienceAtom, o.experiences, 20),
    skills: strs(o.skills, 40),
  };
}

export function withinSize(r: ResumeData): boolean {
  return JSON.stringify(r).length <= MAX_BYTES;
}

const KIND = { project: "项目", internship: "实习", research: "科研", award: "奖项", campus: "校园" } as const;

/** 给大模型看的纯文字版。刻意不含联系方式（姓名、电话、邮箱、链接）。 */
export function resumeToText(r: ResumeData): string {
  const lines: string[] = [];
  if (r.summary) lines.push(`【自我评价】${r.summary}`);
  if (r.education.length) {
    lines.push("【教育】");
    for (const e of r.education)
      lines.push(`- ${[e.school, e.major, e.degree, [e.start, e.end].filter(Boolean).join("~"), e.gpa].filter(Boolean).join(" | ")}`, ...e.highlights.map((h) => `  · ${h}`));
  }
  for (const x of r.experiences) {
    lines.push(`【${KIND[x.kind]}】${[x.title, x.org, [x.start, x.end].filter(Boolean).join("~")].filter(Boolean).join(" | ")}`);
    lines.push(...x.bullets.map((b) => `  · ${b}`));
    if (x.skills.length) lines.push(`  技术栈：${x.skills.join("、")}`);
  }
  if (r.skills.length) lines.push(`【技能】${r.skills.join("、")}`);
  return lines.join("\n");
}
