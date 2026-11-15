/**
 * 防编造检查（借鉴 career-ops：生成的简历里出现的数字和事实，必须能在原简历里找到）。
 * 大模型改写简历时最容易“顺手”加上的，是数字（提升 30%、10 万用户）和技术名词（Kubernetes、Redis）。
 * 这里不判断措辞，只把“原简历里找不到”的数字和英文技术词挑出来，提醒用户核实。纯函数，不调用模型。
 */

/** “【请补充：xx】”这类占位里的内容是让用户自己填的，不算编造。 */
const PLACEHOLDER = /【请补充[^】]*】|\[请补充[^\]]*\]/g;

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角 → 半角
    .replace(/\s+/g, "");

/** 数字类事实：带单位的数（30%、10万、5k、3倍、2.5x、200ms）和三位以上的纯数字；一位、两位纯数字太常见，不查。 */
function numbers(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d+(?:[.,]\d+)?)\s*(%|％|万|千|亿|k|K|w|W|倍|x|X|ms|s|秒|分钟|小时|天|人|个|次|条|篇|项|元|qps|QPS)?/g;
  for (const m of text.matchAll(re)) {
    const n = m[1]!.replace(",", "");
    const unit = m[2];
    if (!unit && n.replace(".", "").length < 3) continue;
    // 年份（2019-2030）和时间段在经历里很常见，单独出现时不当作“成果数字”
    if (!unit && /^20[1-3]\d$/.test(n)) continue;
    out.add(unit ? `${n}${unit}` : n);
  }
  return [...out];
}

/** 英文技术词：React、Spring Boot、K8s、C++ 之类（中文词改写空间太大，不查）。 */
function techTerms(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+#.]*(?:[ -][A-Z][A-Za-z0-9+#.]*)?/g)) {
    const w = m[0].replace(/[.]+$/, "");
    if (w.length < 2 || /^(a|an|the|and|or|of|to|in|on|for|with|by|at|is|are|xx|etc|e\.g|i\.e|vs)$/i.test(w)) continue;
    out.add(w);
  }
  return [...out];
}

/** 数字是否在原文里：比较时去掉千分位和空格；“30%”在原文写成“30 %”或“３０％”也算有。 */
function hasNumber(source: string, fact: string): boolean {
  const n = fact.match(/^\d+(?:\.\d+)?/)![0];
  return new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(source.replace(/(\d),(\d{3})/g, "$1$2"));
}

/**
 * 找出生成文本里、原简历里没有的数字和英文技术词。
 * @param generated 模型生成的内容（改写示例、定制简历等）
 * @param source 用户原简历的全文（以及用户确认过的其他材料）
 */
export function unsupportedFacts(generated: string, source: string): string[] {
  const text = generated.replace(PLACEHOLDER, " ");
  const src = fold(source);
  const missing: string[] = [];
  for (const n of numbers(text)) if (!hasNumber(src, n)) missing.push(n);
  for (const t of techTerms(text)) if (!src.includes(fold(t))) missing.push(t);
  return missing.slice(0, 10);
}
