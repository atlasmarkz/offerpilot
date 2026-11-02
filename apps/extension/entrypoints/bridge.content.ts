import { Profile } from "@offerpilot/shared";

/**
 * 只在 OfferPilot 网页端运行：把网页里“同步到扩展”发来的画像存进扩展本地存储。
 * 只接受本页面自己发的消息（同源、同窗口），并重新校验画像结构。
 */
export default defineContentScript({
  matches: ["http://localhost:3000/*"],
  main() {
    window.addEventListener("message", async (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const data = e.data as { source?: string; type?: string; profile?: unknown } | null;
      if (data?.source !== "offerpilot-web" || data.type !== "profile") return;

      const parsed = Profile.safeParse(data.profile);
      if (parsed.success) await browser.storage.local.set({ profile: parsed.data });
      window.postMessage(
        { source: "offerpilot-ext", type: "profile-saved", ok: parsed.success },
        location.origin,
      );
    });
    // 让网页知道扩展已安装
    window.postMessage({ source: "offerpilot-ext", type: "ready" }, location.origin);
  },
});
