import { ExperienceAtom } from "@offerpilot/shared";

/** 发给大模型的简历文字上限，超出部分截断。 */
export const MAX_RESUME_CHARS = 12000;

export const RESUME_SYSTEM_PROMPT = `你是简历信息抽取器。从给定的简历文字中抽取求职画像，输出 JSON 对象，字段：
- school: 当前或最近的学校名称
- schoolTags: 数组，只有简历明确写出“985”“211”“双一流”时才填，不要凭学校名推断
- major: 当前或最近学历的专业名称
- degree: "bachelor" | "master" | "phd"，取当前正在读或最高的学历
- graduationYear: 预计毕业年份（数字）
- cities: 数组，仅当简历里明确写了意向城市时填
- targetRoles: 数组，仅当简历里明确写了求职意向岗位时填
- experiences: 数组，每项 { kind: "project"|"internship"|"research"|"award"|"campus", title, org（可省略）, start, end（YYYY-MM，可省略）, bullets: 字符串数组（保留原文要点，不要改写夸大）, skills: 字符串数组 }
严格依据原文，不要猜测或编造；原文没有的信息一律省略。不要输出姓名、电话、邮箱、身份证号、住址等个人标识信息。`;

const DEGREE_ALIASES: [RegExp, "bachelor" | "master" | "phd"][] = [
  [/博士|phd|doctor/i, "phd"],
  [/硕士|研究生|master|msc|m\.s/i, "master"],
  [/本科|学士|bachelor|undergrad/i, "bachelor"],
];

function normalizeDegree(v: unknown): "bachelor" | "master" | "phd" | undefined {
  if (typeof v !== "string") return undefined;
  if (v === "bachelor" || v === "master" || v === "phd") return v;
  return DEGREE_ALIASES.find(([re]) => re.test(v))?.[1];
}

const strList = (v: unknown, max = 12): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

const SCHOOL_TAGS = new Set(["985", "211", "双一流"]);

export interface ResumeDraft {
  school?: string;
  schoolTags: string[];
  major?: string;
  degree?: "bachelor" | "master" | "phd";
  graduationYear?: number;
  cities: string[];
  targetRoles: string[];
  experiences: ExperienceAtom[];
}

/**
 * 大模型输出不可信：逐字段校验，坏的字段丢掉而不是整体失败。
 * 返回的只是草稿，由用户在界面上核对后才会生效。
 */
export function normalizeDraft(raw: unknown): ResumeDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  const year = Number(o.graduationYear);

  const experiences = (Array.isArray(o.experiences) ? o.experiences : []).flatMap((e) => {
    const p = ExperienceAtom.safeParse(e);
    return p.success ? [p.data] : [];
  });

  return {
    school: text(o.school),
    schoolTags: strList(o.schoolTags).filter((t) => SCHOOL_TAGS.has(t)),
    major: text(o.major),
    degree: normalizeDegree(o.degree),
    graduationYear: Number.isInteger(year) && year >= 2020 && year <= 2035 ? year : undefined,
    cities: strList(o.cities).map((c) => c.replace(/市$/, "")),
    targetRoles: strList(o.targetRoles),
    experiences: experiences.slice(0, 20),
  };
}
