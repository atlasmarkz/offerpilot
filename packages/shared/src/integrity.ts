/**
 * 岗位描述的安全检查（借鉴 ai-job-search 的 posting integrity gate）。
 * 岗位描述来自第三方网页，会被原样交给大模型：先去掉看不见的字符，再找“像是写给 AI 的指令”的句子，
 * 有问题的句子从送给模型的文本里删掉，并把发现告诉用户。纯函数，确定性，不调用模型。
 */
export interface IntegrityReport {
  /** 清理后的文本（去掉不可见字符和疑似指令行），送给模型用 */
  clean: string;
  /** 发现的问题，给用户看 */
  flags: string[];
  /** 被删掉的疑似指令行（截短） */
  removed: string[];
}

// 零宽字符、双向文本控制符、软连字符、BOM 等：人眼看不见，却能把指令藏进岗位描述
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩­﻿᠎]/g;
// 私有区字符：常见于自定义字体“加密”的文字，模型读到的是乱码
const PRIVATE_USE = /[-]/g;

/** 像是写给模型的指令（中英文）：要求忽略之前的指示、扮演角色、给出高分、输出特定内容等。 */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|messages)/i,
  /disregard\s+(the\s+)?(previous|above|system)/i,
  /\b(system|developer)\s*prompt\b/i,
  /\byou\s+are\s+(now\s+)?(an?\s+)?(ai|assistant|language model|chatgpt|claude|gpt)\b/i,
  /\bas\s+an?\s+(ai|language model)\b/i,
  /\b(rate|score|rank)\s+(this|the)\s+(candidate|applicant|resume|cv)\s+(as|at)\s+/i,
  /忽略(以上|上面|之前|前面|先前)(所有|全部)?的?(指令|指示|提示|要求|内容)/,
  /(无视|不要理会)(以上|上面|之前|系统)/,
  /(系统|开发者)提示(词|语)/,
  /你(现在)?是(一个|一名)?\s*(AI|人工智能|大模型|语言模型|助手|ChatGPT|Claude)/i,
  /作为(一个|一名)?\s*(AI|人工智能|大模型|语言模型)/i,
  /(给|打)(这份|该|此)?(简历|候选人|求职者)?\s*(打)?(满分|最高分|5\s*分|五分)/,
  /(请|务必)(在回答|在输出|在结果)中(加入|包含|写上)/,
];

export function inspectPosting(text: string): IntegrityReport {
  const flags: string[] = [];
  const invisible = text.match(INVISIBLE)?.length ?? 0;
  if (invisible) flags.push(`含 ${invisible} 个看不见的字符，已去掉`);
  const pua = text.match(PRIVATE_USE)?.length ?? 0;
  if (pua >= 3) flags.push(`含 ${pua} 个无法识别的字符（可能是网站的字体加密），相关内容可能读不准`);

  let s = text.replace(INVISIBLE, "").replace(PRIVATE_USE, "");
  // HTML 注释和隐藏标签里的文字也是常见的藏指令手法
  if (/<!--[\s\S]*?-->/.test(s)) {
    flags.push("含 HTML 注释，已去掉");
    s = s.replace(/<!--[\s\S]*?-->/g, "");
  }

  const removed: string[] = [];
  const lines = s.split(/\r?\n/).filter((line) => {
    if (INSTRUCTION_PATTERNS.some((re) => re.test(line))) {
      removed.push(line.trim().slice(0, 80));
      return false;
    }
    return true;
  });
  if (removed.length) flags.push(`有 ${removed.length} 句像是写给 AI 的指令，已从送给模型的内容里删掉`);

  return { clean: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), flags, removed };
}
