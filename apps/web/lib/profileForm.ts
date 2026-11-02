import { ExperienceAtom, Profile, type CompanyType } from "@offerpilot/shared";
import { split } from "./storage";

export const TYPE_LABEL: Record<CompanyType, string> = { internet: "互联网", finance: "金融", soe: "国央企" };
export const SCHOOL_TAGS = ["985", "211", "双一流"];

export interface Form {
  name: string;
  school: string;
  schoolTags: string[];
  major: string;
  degree: "bachelor" | "master" | "phd";
  graduationYear: number;
  cities: string;
  targetRoles: string;
  targetCompanyTypes: CompanyType[];
  /** 从简历解析出的经历，后续用于定制简历和简答题 */
  experiences: ExperienceAtom[];
}

export const EMPTY_FORM: Form = {
  name: "",
  school: "",
  schoolTags: [],
  major: "",
  degree: "bachelor",
  graduationYear: 2027,
  cities: "",
  targetRoles: "",
  targetCompanyTypes: [],
  experiences: [],
};

export interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** true：记在这个浏览器里；false：只在当前标签页会话里保留 */
  remember: boolean;
}
export const EMPTY_LLM: LlmSettings = { baseUrl: "", apiKey: "", model: "", remember: false };

/** 表单 -> 校验过的画像。没填的文字字段用占位值，扩展里会跳过这些占位。 */
export function toProfile(form: Form) {
  return Profile.safeParse({
    ...form,
    cities: split(form.cities),
    targetRoles: split(form.targetRoles),
    name: form.name || "未命名",
    school: form.school || "-",
    major: form.major || "-",
  });
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** 云端读回来的数据不可信：逐字段校验，坏字段回到默认值，而不是让页面崩溃。 */
export function sanitizeForm(raw: unknown): Form {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, max = 50) => (Array.isArray(v) ? v.filter(isStr).slice(0, max) : []);
  const year = Number(o.graduationYear);
  const types = list(o.targetCompanyTypes).filter((t): t is CompanyType => t in TYPE_LABEL);
  const exps = (Array.isArray(o.experiences) ? o.experiences : []).flatMap((e) => {
    const p = ExperienceAtom.safeParse(e);
    return p.success ? [p.data] : [];
  });
  return {
    name: isStr(o.name) ? o.name.slice(0, 80) : "",
    school: isStr(o.school) ? o.school.slice(0, 80) : "",
    schoolTags: list(o.schoolTags).filter((t) => SCHOOL_TAGS.includes(t)),
    major: isStr(o.major) ? o.major.slice(0, 80) : "",
    degree: o.degree === "master" || o.degree === "phd" ? o.degree : "bachelor",
    graduationYear: Number.isInteger(year) && year >= 2020 && year <= 2035 ? year : 2027,
    cities: isStr(o.cities) ? o.cities.slice(0, 200) : "",
    targetRoles: isStr(o.targetRoles) ? o.targetRoles.slice(0, 200) : "",
    targetCompanyTypes: types,
    experiences: exps.slice(0, 20),
  };
}

/** 画像是不是“空白的”（用户还没填过），用于决定登录后以谁为准。 */
export function isBlankForm(f: Form): boolean {
  return JSON.stringify({ ...f, name: "" }) === JSON.stringify({ ...EMPTY_FORM });
}
