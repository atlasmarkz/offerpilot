import { Profile } from "@offerpilot/shared";
import { findAdapter } from "../adapters";
import type { FillOutcome } from "../adapters/types";

/**
 * 填表脚本：不会自动注入任何网页，只在你点击扩展图标里的“填写当前页面”时，
 * 由弹窗通过 activeTab 权限注入到当前这一个标签页，运行一次，把结果回报给弹窗。
 */
export default defineContentScript({
  registration: "runtime",
  matches: ["*://*/*"],
  async main() {
    const { profile } = await browser.storage.local.get("profile");
    const parsed = Profile.safeParse(profile);

    let outcome: FillOutcome;
    if (!parsed.success) {
      outcome = { status: "failed", error: "还没有画像，请先在 OfferPilot 网页端同步" };
    } else {
      const adapter = findAdapter(location.href);
      outcome = adapter
        ? await adapter.fill(document, parsed.data).catch((e: Error) => ({ status: "failed", error: e.message }) as FillOutcome)
        : { status: "failed", error: "当前页面暂无适配器" };
    }
    await browser.runtime.sendMessage({ type: "offerpilot:result", outcome });
  },
});
