import { Profile, normalizePrivateInfo } from "@offerpilot/shared";
import { findAdapter } from "../adapters";
import { resumeExtras } from "../adapters/resumeFacts";
import { pickResume } from "../adapters/resumePick";
import type { FillOutcome } from "../adapters/types";

/**
 * 填表脚本：不会自动注入任何网页，只在你点击扩展图标里的“填写当前页面”时，
 * 由弹窗通过 activeTab 权限注入到当前这一个标签页，运行一次，把结果回报给弹窗。
 */
export default defineContentScript({
  registration: "runtime",
  matches: ["*://*/*"],
  async main() {
    const { profile, extras, resumes, resumeId, resume, private: privateInfo, fillMode } = await browser.storage.local.get(["profile", "extras", "resumes", "resumeId", "resume", "private", "fillMode"]);
    // 弹窗里点“核对页面”时会先写入 fillMode=check：这次只比对，不写任何内容
    const check = fillMode === "check";
    await browser.storage.local.remove("fillMode");
    const parsed = Profile.safeParse(profile);
    const typed: Record<string, string> =
      extras && typeof extras === "object" ? Object.fromEntries(Object.entries(extras).filter(([, v]) => typeof v === "string")) : {};
    // 在线简历里的联系方式打底，弹窗里手动补充的覆盖它
    const parsedResume = pickResume({ resumes, resumeId, resume })?.data;
    // 优先级：弹窗里手动补充的 > 网页里填的个人隐私信息（只存本机）> 旧版简历里的联系方式
    const extraValues = { ...resumeExtras(parsedResume), ...normalizePrivateInfo(privateInfo), ...typed };

    let outcome: FillOutcome;
    if (!parsed.success) {
      outcome = { status: "failed", error: "还没有画像，请先在 OfferPilot 网页端同步" };
    } else {
      const adapter = findAdapter(location.href);
      outcome = adapter
        ? await adapter.fill(document, parsed.data, extraValues, parsedResume, { check }).catch((e: Error) => ({ status: "failed", error: e.message }) as FillOutcome)
        : { status: "failed", error: "当前页面暂无适配器" };
    }
    await browser.runtime.sendMessage({ type: "offerpilot:result", outcome });
  },
});
