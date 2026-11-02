import type { DegreeLevel, JobRequirements } from "@offerpilot/shared";

/**
 * 用规则从岗位文字里抽硬条件。宁可留空也不猜：
 * 空表示“未识别”，匹配时视为无限制，由大模型或人工审核补充。
 */

const DEGREE_RANK: Record<DegreeLevel, number> = { bachelor: 1, master: 2, phd: 3 };
const DEGREE_WORD: Record<string, DegreeLevel> = { 本科: "bachelor", 硕士: "master", 博士: "phd" };

export function extractGraduationYears(text: string): number[] {
  const years = new Set<number>();
  for (const m of text.matchAll(/(20\d{2})\s*届/g)) years.add(Number(m[1]));
  // “2026年9月-2027年8月期间毕业” 取结束年份
  const range =
    /20\d{2}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?\s*[-—~～至到]+\s*(20\d{2})\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?[^。；;\n]{0,8}毕业/g;
  for (const m of text.matchAll(range)) {
    years.add(Number(m[1]));
  }
  return [...years].filter((y) => y >= 2024 && y <= 2032).sort();
}

export function extractMinDegree(text: string): DegreeLevel | undefined {
  const found: DegreeLevel[] = [];
  for (const m of text.matchAll(/(本科|硕士|博士)\s*(?:研究生)?\s*(?:及以上|以上|学历|在读|或以上)/g)) {
    found.push(DEGREE_WORD[m[1]!]!);
  }
  if (found.length === 0) return undefined;
  // “本科及以上”优先于同文中其他更高学历的说法：取最低
  return found.reduce((a, b) => (DEGREE_RANK[a] <= DEGREE_RANK[b] ? a : b));
}

/** 专业名的常见结尾；只收像专业名的词，宁缺毋滥。 */
const MAJOR_NAME =
  /^[一-龥A-Za-z（）()]{0,10}(学|工程|技术|科学|管理|设计|自动化|通信|金融|会计|经济|统计|数学|物理|化学|软件|电子|机械|材料|计算机|信息|控制|能源|电气|车辆|交通|营销|传播|新闻|法律|艺术|外语|英语|语言|药学|生物|地理|测绘|建筑|土木|水利|环境)$/;
const MAJOR_NOISE = /的|了|能|具有|具备|良好|熟悉|积极|成为|提供|制定|负责|热爱|优秀|扎实|较强|相关|优先/;
/** “专业”必须以这些固定句式出现，才认为前面是专业列表 */
const MAJOR_PHRASE = /([^。；;\n：:]{2,60}?)(?:等?(?:相关|类|方向)专业|等专业|专业(?:背景|优先|毕业|本科|硕士|博士|学位|方向|不限))/g;

export function extractMajors(text: string): string[] {
  if (/专业不限|不限专业/.test(text)) return [];
  const majors = new Set<string>();
  for (const m of text.matchAll(MAJOR_PHRASE)) {
    // 取最后一个逗号分句，避免把前面的长句带进来
    const clause = m[1]!.split(/[，,]/).slice(-1)[0] ?? "";
    const withComma = m[1]!.split(/[，,]/).slice(-4).join("、");
    // “电气工程及其自动化”是一个专业名，先保护起来再按分隔符切分
    const protectedText = (clause.length >= 2 ? withComma : clause).replace(/及其/g, "\u0000");
    for (const raw of protectedText.split(/[、，,/和及或与]/)) {
      const part = raw.replace(/\u0000/g, "及其");
      const p = part.replace(/^(?:如|包括|例如|为|是|来自|毕业于|主修|修读|在|于)+/, "").trim();
      if (p.length >= 2 && MAJOR_NAME.test(p) && !MAJOR_NOISE.test(p)) majors.add(p);
    }
  }
  return [...majors].slice(0, 12);
}

export function extractSchoolTags(text: string): string[] {
  const tags: string[] = [];
  for (const tag of ["985", "211", "双一流"]) if (text.includes(tag)) tags.push(tag);
  return tags;
}

export function extractRequirements(text: string): JobRequirements {
  return {
    minDegree: extractMinDegree(text),
    graduationYears: extractGraduationYears(text),
    majors: extractMajors(text),
    schoolTags: extractSchoolTags(text),
    politicalStatus: [],
    hukou: [],
  };
}
