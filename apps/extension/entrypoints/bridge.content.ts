import { Profile, normalizeResume } from "@offerpilot/shared";

/**
 * 只在 OfferPilot 网页端运行：把网页里“同步到扩展”发来的画像和在线简历存进扩展本地存储。
 * 只接受本页面自己发的消息（同源、同窗口），并重新校验画像结构。
 */
export default defineContentScript({
  // 商店版（构建时设置了 WXT_WEB_ORIGIN）只匹配你的正式域名，不含 localhost；
  // 本地开发（没设置）匹配 http://localhost:3000。能给扩展发画像的页面都在这里列出
  matches: import.meta.env.WXT_WEB_ORIGIN
    ? [`${String(import.meta.env.WXT_WEB_ORIGIN).replace(/\/$/, "")}/*`]
    : ["http://localhost:3000/*"],
  main() {
    window.addEventListener("message", async (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const data = e.data as { source?: string; type?: string; profile?: unknown; resume?: unknown } | null;
      if (data?.source !== "offerpilot-web") return;

      if (data.type === "profile") {
        const parsed = Profile.safeParse(data.profile);
        let ok = parsed.success;
        try {
          if (parsed.success) await browser.storage.local.set({ profile: parsed.data });
        } catch {
          ok = false; // 存储失败也要回执，网页才不会一直没反应
        }
        window.postMessage({ source: "offerpilot-ext", type: "profile-saved", ok }, location.origin);
      } else if (data.type === "resume") {
        // 在线简历（教育、经历、技能、联系方式）：逐段校验后存本机，填表时用
        let ok = true;
        try {
          await browser.storage.local.set({ resume: normalizeResume(data.resume) });
        } catch {
          ok = false;
        }
        window.postMessage({ source: "offerpilot-ext", type: "resume-saved", ok }, location.origin);
      }
    });
    // 让网页知道扩展已安装
    window.postMessage({ source: "offerpilot-ext", type: "ready" }, location.origin);
  },
});
