import type { ResumeDraft } from "./resume";
import { emptyResume, normalizeResume, type ResumeData } from "./resumeData";

export const RESUME_KEY = "offerpilot.resume.v1";

/** 简历解析的草稿 -> 在线简历。联系方式不会被解析（也不发给大模型），留给用户自己填。 */
export function draftToResume(d: ResumeDraft): ResumeData {
  return normalizeResume({
    ...emptyResume(),
    summary: d.summary,
    education: d.education.length
      ? d.education
      : d.school
        ? [{ school: d.school, major: d.major ?? "", degree: d.degree === "master" ? "硕士" : d.degree === "phd" ? "博士" : "本科" }]
        : [],
    experiences: d.experiences,
    skills: d.skills,
  });
}

/** 简历里是不是还没有任何内容。 */
export function isBlankResume(r: ResumeData): boolean {
  return (
    !r.summary &&
    r.education.length === 0 &&
    r.experiences.length === 0 &&
    r.skills.length === 0 &&
    !r.contact.name &&
    !r.contact.phone &&
    !r.contact.email
  );
}
