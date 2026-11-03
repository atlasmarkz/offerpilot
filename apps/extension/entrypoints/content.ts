import { Profile, normalizeResume } from "@offerpilot/shared";
import { findAdapter } from "../adapters";
import { resumeExtras } from "../adapters/resumeFacts";
import type { FillOutcome } from "../adapters/types";

/**
 * 填表脚本：不会自动注入任何网页，只在你点击扩展图标里的“填写当前页面”时，
 * 由弹窗通过 activeTab 权限注入到当前这一个标签页，运行一次，把结果回报给弹窗。
 */
export default defineContentScript({
  registration: "runtime",
  matches: ["*://*/*"],
  async main() {
    const { profile, extras, resume } = await browser.storage.local.get(["profile", "extras", "resume"]);
    const parsed = Profile.safeParse(profile);
    const typed: Record<string, string> =
      extras && typeof extras === "object" ? Object.fromEntries(Object.entries(extras).filter(([, v]) => typeof v === "string")) : {};
    // 在线简历里的联系方式打底，弹窗里手动补充的覆盖它
    const extraValues = { ...resumeExtras(resume ? normalizeResume(resume) : undefined), ...typed };

    const parsedResume = resume ? normalizeResume(resume) : undefined;
    let outcome: FillOutcome;
    if (!parsed.success) {
      outcome = { status: "failed", error: "还没有画像，请先在 OfferPilot 网页端同步" };
    } else {
      const adapter = findAdapter(location.href);
      outcome = adapter
        ? await adapter.fill(document, parsed.data, extraValues, parsedResume).catch((e: Error) => ({ status: "failed", error: e.message }) as FillOutcome)
        : { status: "failed", error: "当前页面暂无适配器" };
    }
    await browser.runtime.sendMessage({ type: "offerpilot:result", outcome });
  },
});
