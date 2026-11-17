/** PWA 相关的纯逻辑：判断设备、决定要不要提示“添加到主屏幕”。浏览器 API 的读取放在 PwaClient 里。 */

/** 关掉“添加到主屏幕”提示后记在 localStorage 里，之后不再出现 */
export const INSTALL_HINT_KEY = "offerpilot.pwa.installHint.v1";

export interface DeviceInfo {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** iPhone / iPad / iPod。iPadOS 13 起 Safari 默认伪装成 Mac，要靠触点数区分。 */
export function isIos(d: DeviceInfo): boolean {
  if (/iPhone|iPad|iPod/i.test(d.userAgent)) return true;
  return d.platform === "MacIntel" && (d.maxTouchPoints ?? 0) > 1;
}

/** 微信内置浏览器：iOS 上不能直接添加到主屏幕，要先“在 Safari 中打开” */
export function isWeChat(userAgent: string): boolean {
  return /MicroMessenger/i.test(userAgent);
}

export type InstallHint = "none" | "ios" | "prompt";

export interface HintState {
  /** 已经是从主屏幕打开的（display-mode: standalone 或 iOS 的 navigator.standalone） */
  standalone: boolean;
  /** 用户之前关掉过提示 */
  dismissed: boolean;
  ios: boolean;
  /** 浏览器给了 beforeinstallprompt 事件（Chrome / Edge / 三星浏览器等） */
  canPrompt: boolean;
  /** 触屏设备。电脑上主要靠扩展投递，不打扰 */
  touch: boolean;
}

/**
 * 要显示哪种提示：
 * - 已安装或关过：不显示；
 * - iOS 没有安装事件：显示“分享 → 添加到主屏幕”的引导；
 * - 其它浏览器在触屏设备上拿到 beforeinstallprompt 时显示“安装”按钮。
 */
export function installHint(s: HintState): InstallHint {
  if (s.standalone || s.dismissed) return "none";
  if (s.ios) return "ios";
  if (s.canPrompt && s.touch) return "prompt";
  return "none";
}
