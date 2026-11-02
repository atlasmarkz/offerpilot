import { Profile, type CompanyType, type ExperienceAtom } from "@offerpilot/shared";
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
