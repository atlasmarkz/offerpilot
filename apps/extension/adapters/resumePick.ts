import { normalizeResume, type ResumeData } from "@offerpilot/shared";

/** 扩展本地存的一份简历。份数上限由平台（网页端）按会员等级决定，扩展只负责存着、让用户选用哪一份。 */
export interface StoredResume {
  id: string;
  name: string;
  data: ResumeData;
}

interface Stored {
  resumes?: unknown;
  /** 用户在扩展里选的、填表用的那一份 */
  resumeId?: unknown;
  /** 旧版只存一份时的字段 */
  resume?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** 网页发来的简历列表：逐份校验，丢掉没有 id 的；最多收 10 份，防止异常数据撑爆本地存储。 */
export function sanitizeResumes(raw: unknown): StoredResume[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredResume[] = [];
  for (const r of raw.slice(0, 10)) {
    if (!isObj(r) || typeof r.id !== "string" || !r.id) continue;
    out.push({ id: r.id.slice(0, 64), name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : "简历", data: normalizeResume(r.data) });
  }
  return out;
}

/**
 * 收到网页同步后，填表要用哪一份：
 * 用户在扩展里选过且还在列表里就保留；否则用网页上正在编辑的那份；再不行用第一份。
 */
export function chooseResumeId(list: StoredResume[], currentChoice: unknown, webActiveId: unknown): string | undefined {
  const has = (id: unknown) => typeof id === "string" && list.some((r) => r.id === id);
  if (has(currentChoice)) return currentChoice as string;
  if (has(webActiveId)) return webActiveId as string;
  return list[0]?.id;
}

/** 填表时用的那一份；没有多份简历数据时退回旧版单份。 */
export function pickResume(stored: Stored): StoredResume | undefined {
  const list = sanitizeResumes(stored.resumes);
  if (list.length) return list.find((r) => r.id === stored.resumeId) ?? list[0];
  if (stored.resume) return { id: "legacy", name: "我的简历", data: normalizeResume(stored.resume) };
  return undefined;
}
