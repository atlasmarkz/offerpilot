import { isBlankResume, RESUME_KEY } from "./resumeLocal";
import { normalizeResume, type ResumeData } from "./resumeData";
import { load } from "./storage";

/** 把在线简历发给浏览器扩展（扩展没装就没有回执，什么也不会发生）。 */
export function postResumeToExtension(resume: ResumeData): void {
  window.postMessage({ source: "offerpilot-web", type: "resume", resume }, window.location.origin);
}

/**
 * 要同步给扩展的简历：优先用这台设备上的；本机还是空的（比如刚在新设备登录、还没打开过简历页）
 * 就取云端那一份。都没有返回 undefined。
 */
export async function resumeForExtension(loggedIn: boolean): Promise<ResumeData | undefined> {
  const local = normalizeResume(load<unknown>(RESUME_KEY, {}));
  if (!isBlankResume(local)) return local;
  if (!loggedIn) return undefined;
  try {
    const res = await fetch("/api/me/resume");
    if (!res.ok) return undefined;
    const { resume } = (await res.json()) as { resume: unknown | null };
    const cloud = resume ? normalizeResume(resume) : undefined;
    return cloud && !isBlankResume(cloud) ? cloud : undefined;
  } catch {
    return undefined;
  }
}
