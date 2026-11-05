import { detectBlocker, fillCustomSelects, fillForm } from "./formFill";
import { fillSections } from "./sections";
import { detectTemplate } from "./templates";
import type { SiteAdapter } from "./types";

/**
 * 模板适配器：先识别当前页面是哪个投递系统/组件库的模板（见 templates.ts），
 * 再按该模板的表单结构找字段、选下拉。画像和补充信息里没有的字段，报给用户补充。
 */
export const genericAdapter: SiteAdapter = {
  id: "template",
  matches: [/.*/],

  detectBlocker,

  async fill(doc, profile, extras = {}, resume, opts = {}) {
    const { template } = detectTemplate(doc);
    const metaBase = { template: template.name };
    const blocker = detectBlocker(doc);
    // 可重复区块（教育、实习、项目……）先做：有适配的模板才做，逐项读回核对。
    // 要先于基础字段，否则基础字段会抢先往第一行的学校、专业里打字，区块里就当成“已有内容”跳过了
    const sections = template.sections && resume ? (await fillSections(doc, resume, template, opts.check ? "check" : "fill")).sections : [];
    const report = fillForm(doc, profile, { extras, template, check: opts.check });
    if (!opts.check) await fillCustomSelects(report, template);
    for (const s of sections) if (s.filled) report.filled.push(`${s.title} ${s.filled} 条`);
    // 区块里已经选好的字段，不再要求用户手动选
    const sectionOk = sections.flatMap((s) => s.fields.filter((f) => f.status === "ok").map((f) => f.label));
    report.manual = report.manual.filter((k) => !sectionOk.some((l) => l.includes(k)));
    const why = (f: { status: string; actual?: string; expected?: string; note?: string }) =>
      f.status === "mismatch" && f.actual && f.expected ? `页面：${f.actual}；简历：${f.expected}${f.note ? `；${f.note}` : ""}` : (f.note ?? "");
    const unsure = sections.flatMap((s) => s.fields.filter((f) => f.status !== "ok").map((f) => `${f.label}${why(f) ? `（${why(f)}）` : ""}`));
    const missing = report.missing;
    const meta = { ...metaBase, sections: sections.length ? sections : undefined, unrecognized: report.unrecognized.length ? report.unrecognized : undefined, differs: report.differs.length ? report.differs : undefined, check: opts.check || undefined };
    const done = report.filled;
    if (blocker) return { status: "needs_user", reason: blocker, filledFields: done, missing, ...meta };
    if (done.length === 0 && report.manual.length === 0 && report.kept.length === 0 && missing.length === 0 && sections.every((s) => !s.kept))
      return { status: "failed", error: "没有在当前页面找到可填写的字段（姓名/学校/专业/学历/毕业年份/手机/邮箱等）", ...metaBase };
    const todo: string[] = [];
    if (report.manual.length && !opts.check) todo.push(`需要你手动选择：${report.manual.join("、")}`);
    if (report.differs.length)
      todo.push(`页面上已有的内容和你的信息不一致（没有改动）：${report.differs.map((d) => `${d.label}（页面：${d.actual}；你的：${d.expected}）`).join("；")}`);
    if (opts.check && report.empty.length) todo.push(`页面上还是空的：${report.empty.join("、")}`);
    if (unsure.length) todo.push(`这些项${opts.check ? "和简历对不上" : "没有核对通过"}，请检查：${unsure.join("；")}`);
    if (missing.length && !opts.check) todo.push(`页面上还有信息我没有：${missing.join("、")}（可在下面补充后重新填写）`);
    if (todo.length) return { status: "needs_user", reason: todo.join("。"), filledFields: done, missing, ...meta };
    return { status: "filled", filledFields: done, ...meta };
  },
};
