import { collectStructure } from "../adapters/diagnose";

/**
 * 页面结构诊断脚本：和填表脚本一样不会自动注入任何网页，只在你点弹窗里“复制页面结构”时，
 * 通过 activeTab 注入到当前这一个标签页，运行一次，把结果发回弹窗去复制。里面没有你填的任何内容。
 */
export default defineContentScript({
  registration: "runtime",
  matches: ["*://*/*"],
  async main() {
    const report = collectStructure(document, location.href);
    await browser.runtime.sendMessage({ type: "offerpilot:diagnose", report });
  },
});
