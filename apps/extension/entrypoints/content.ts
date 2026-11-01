import type { Profile } from "@offerpilot/shared";
import { findAdapter } from "../adapters";
import type { FillOutcome } from "../adapters/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as { type?: string; profile?: Profile };
      const adapter = findAdapter(location.href);
      if (msg.type !== "offerpilot:fill" || !msg.profile) {
        sendResponse({ status: "failed", error: "无效的消息" } satisfies FillOutcome);
      } else if (!adapter) {
        sendResponse({ status: "failed", error: "当前页面暂无适配器" } satisfies FillOutcome);
      } else {
        adapter.fill(document, msg.profile).then(sendResponse);
      }
      return true; // 异步响应
    });
  },
});
