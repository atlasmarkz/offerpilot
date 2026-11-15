import { isBlankResume } from "./resumeLocal";
import type { ResumeData } from "./resumeData";

export interface SyncedResume {
  id: string;
  name: string;
  data: ResumeData;
}

/**
 * 把我的在线简历（可能不止一份）发给浏览器扩展；扩展里可以选用哪一份填表（扩展没装就没有回执，什么也不会发生）。
 * 份数上限由平台决定：免费版只有 1 份，所以扩展自己不需要做任何限制。
 */
export function postResumesToExtension(resumes: SyncedResume[], activeId: string | undefined): void {
  const usable = resumes.filter((r) => !isBlankResume(r.data));
  window.postMessage(
    { source: "offerpilot-web", type: "resumes", resumes: usable, activeId: usable.some((r) => r.id === activeId) ? activeId : usable[0]?.id },
    window.location.origin,
  );
}

/**
 * 向扩展要它在本机记录的平台投递（Boss直聘、猎聘……）。只要这个账号上次同步之后的新记录。
 * 扩展没装或没回应时返回 null。
 */
export function requestExtensionApplications(account: string, timeoutMs = 1500): Promise<unknown[] | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);
    function onMsg(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; type?: string; items?: unknown } | null;
      if (d?.source !== "offerpilot-ext" || d.type !== "applications") return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve(Array.isArray(d.items) ? d.items : []);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "offerpilot-web", type: "applications-request", account }, window.location.origin);
  });
}

/** 告诉扩展：这个账号已经同步到 upTo（ISO 时间）为止，下次只要更新的。 */
export function markExtensionApplicationsSynced(account: string, upTo: string): void {
  window.postMessage({ source: "offerpilot-web", type: "applications-synced", account, upTo }, window.location.origin);
}

/** 从云端取我的简历列表发给扩展（岗位页“同步到浏览器扩展”用）。没登录或没有简历返回 false。 */
export async function syncResumesFromCloud(loggedIn: boolean, activeId?: string): Promise<boolean> {
  if (!loggedIn) return false;
  try {
    const res = await fetch("/api/me/resumes");
    if (!res.ok) return false;
    const { items } = (await res.json()) as { items: { id: string; name: string; data: ResumeData }[] };
    if (!items.length) return false;
    postResumesToExtension(items, activeId);
    return true;
  } catch {
    return false;
  }
}
