"use client";

import { useEffect, useState } from "react";
import { INSTALL_HINT_KEY, installHint, isIos, isWeChat, type HintState, type InstallHint } from "../lib/pwa";
import { load, save } from "../lib/storage";

/** Chrome / Edge 等浏览器的安装事件，标准库里还没有类型 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** 只在产品页面上提示；隐私页、演示表单不打扰 */
const HINT_PAGES = ["/", "/app", "/board", "/resume", "/account"];

/**
 * 挂在根布局里：注册 Service Worker，并在手机上显示一次“添加到主屏幕”的提示。
 * Service Worker 只在生产构建里注册——开发时热更新的文件没有哈希，缓存了会拿到旧代码。
 */
export function PwaClient() {
  const [hint, setHint] = useState<InstallHint>("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent>();
  const [wechat, setWechat] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 注册失败（隐私模式、http 等）只是没有离线页，不影响使用 */
    });
  }, []);

  useEffect(() => {
    if (!HINT_PAGES.includes(window.location.pathname)) return;
    const state: HintState = {
      standalone:
        window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      dismissed: load(INSTALL_HINT_KEY, false),
      ios: isIos({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
      canPrompt: false,
      touch: window.matchMedia("(pointer: coarse)").matches,
    };
    setWechat(isWeChat(navigator.userAgent));
    setHint(installHint(state));

    const onPrompt = (e: Event) => {
      const next = installHint({ ...state, canPrompt: true });
      // 不打算显示自己的提示时，不拦浏览器自带的安装入口
      if (next !== "prompt") return;
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHint(next);
    };
    const onInstalled = () => setHint("none");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    save(INSTALL_HINT_KEY, true);
    setHint("none");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(undefined);
    if (outcome === "accepted") setHint("none");
    else dismiss();
  }

  if (hint === "none") return null;

  return (
    <aside className="pwa-hint" aria-label="添加到主屏幕">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="pwa-hint-text">
        <b>把 OfferPilot 添加到主屏幕</b>
        {hint === "ios" ? (
          wechat ? (
            <span>点右上角“···”选“在 Safari 中打开”，再点分享按钮，选“添加到主屏幕”。</span>
          ) : (
            <span>
              点浏览器的分享按钮
              <ShareIcon />
              ，再选“添加到主屏幕”，像 App 一样随时看投递进度。
            </span>
          )
        ) : (
          <span>像 App 一样从桌面打开，随时看投递进度。</span>
        )}
      </div>
      {hint === "prompt" && deferred && (
        <button className="btn sm" onClick={() => void install()}>
          安装
        </button>
      )}
      <button className="link-btn pwa-hint-close" onClick={dismiss} aria-label="关闭，不再提示">
        ✕
      </button>
    </aside>
  );
}

/** iOS 分享按钮的样子：方框加向上的箭头 */
function ShareIcon() {
  return (
    <svg className="pwa-share" viewBox="0 0 24 24" width="15" height="15" aria-label="分享" role="img" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M7 11H5v10h14V11h-2" />
    </svg>
  );
}
