import { detectBlocker, fillCustomSelects, fillForm } from "./formFill";
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

  async fill(doc, profile, extras = {}) {
    const { template } = detectTemplate(doc);
    const meta = { template: template.name };
    const blocker = detectBlocker(doc);
    const report = fillForm(doc, profile, { extras, template });
    await fillCustomSelects(report, template);
    const missing = report.missing;
    if (blocker) return { status: "needs_user", reason: blocker, filledFields: report.filled, missing, ...meta };
    if (report.filled.length === 0 && report.manual.length === 0 && report.kept.length === 0 && missing.length === 0)
      return { status: "failed", error: "没有在当前页面找到可填写的字段（姓名/学校/专业/学历/毕业年份/手机/邮箱等）", ...meta };
    if (report.manual.length)
      return { status: "needs_user", reason: `这些字段需要你手动选择：${report.manual.join("、")}`, filledFields: report.filled, missing, ...meta };
    if (missing.length)
      return { status: "needs_user", reason: `页面上还有信息我没有：${missing.join("、")}。可以在下面补充后重新填写。`, filledFields: report.filled, missing, ...meta };
    return { status: "filled", filledFields: report.filled, ...meta };
  },
};
