import { resumeToText, type ResumeData } from "./resumeData";

export const SUGGEST_SYSTEM_PROMPT = `你是资深的校招简历顾问。读下面这份应届生简历，给出具体、可执行的修改建议，输出 JSON 对象：
{"overall": "一两句话的整体评价，不超过 120 字",
 "items": [{"section": "教育 / 某段经历的标题 / 技能 / 整体", "level": "high|medium|low", "problem": "这里的问题", "suggestion": "怎么改", "rewrite": "可选：给出一句改写示例"}]}
要求：
- 最多 8 条，按重要性从高到低排；优先指出：缺少量化结果、只写职责不写成果、动词弱、技术栈和成果对不上、排版信息冗余、关键信息缺失。
- 严格依据简历里已有的事实。**绝不编造**经历、数字、技术或奖项。需要数据而简历里没有时，在 rewrite 里用“【请补充：xx】”占位，让用户自己填真实数字。
- 如果给了目标岗位，说明哪些经历和它相关、哪些可以弱化。
- 用中文，语气直接、友好，不要空话套话。`;

export interface SuggestItem {
  section: string;
  level: "high" | "medium" | "low";
  problem: string;
  suggestion: string;
  rewrite?: string;
}
export interface Suggestions {
  overall: string;
  items: SuggestItem[];
}

export function buildSuggestInput(r: ResumeData, targetRole?: string): string {
  const role = targetRole?.trim().slice(0, 100);
  return `${role ? `目标岗位：${role}\n\n` : ""}${resumeToText(r)}`.slice(0, 12000);
}

const LEVELS = new Set(["high", "medium", "low"]);

/** 模型输出不可信：逐条校验，坏条目丢弃。 */
export function normalizeSuggestions(raw: unknown): Suggestions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 8).flatMap((x): SuggestItem[] => {
    const i = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const problem = s(i.problem, 300);
    const suggestion = s(i.suggestion, 500);
    if (!problem || !suggestion) return [];
    const rewrite = s(i.rewrite, 400);
    return [
      {
        section: s(i.section, 60) || "整体",
        level: LEVELS.has(String(i.level)) ? (i.level as SuggestItem["level"]) : "medium",
        problem,
        suggestion,
        ...(rewrite ? { rewrite } : {}),
      },
    ];
  });
  return { overall: s(o.overall, 200), items };
}
