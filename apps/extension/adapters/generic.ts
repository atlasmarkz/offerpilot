import { detectBlocker, fillCustomSelects, fillForm } from "./formFill";
import type { SiteAdapter } from "./types";

/**
 * 通用适配器：按字段标签识别基础信息并填写，适用于结构规整的投递表单。
 * 站点有专用适配器时优先用专用的；这里是兜底。
 */
export const genericAdapter: SiteAdapter = {
  id: "generic",
  matches: [/.*/],

  detectBlocker,

  async fill(doc, profile) {
    const blocker = detectBlocker(doc);
    const report = fillForm(doc, profile);
    await fillCustomSelects(report);
    if (blocker) return { status: "needs_user", reason: blocker, filledFields: report.filled };
    if (report.filled.length === 0 && report.manual.length === 0 && report.kept.length === 0)
      return { status: "failed", error: "没有在当前页面找到可填写的基础信息字段（姓名/学校/专业/学历/毕业年份）" };
    if (report.manual.length)
      return { status: "needs_user", reason: `这些字段需要你手动选择：${report.manual.join("、")}`, filledFields: report.filled };
    return { status: "filled", filledFields: report.filled };
  },
};
