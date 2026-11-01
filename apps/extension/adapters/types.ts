import type { Profile } from "@offerpilot/shared";

export type FillOutcome =
  | { status: "filled"; filledFields: string[] }
  /** 遇到验证码、短信验证、无法确定的必填项等，必须交回用户处理 */
  | { status: "needs_user"; reason: string; filledFields: string[] }
  | { status: "failed"; error: string };

/**
 * 每个投递站点一个适配器。适配器只负责“填”，
 * 提交由用户点击，或在自动模式下由调用方按上限与熔断规则触发。
 */
export interface SiteAdapter {
  id: string;
  /** 匹配的页面 URL 正则 */
  matches: RegExp[];
  /** 检测当前页面是否出现验证码等阻断项 */
  detectBlocker(doc: Document): string | null;
  fill(doc: Document, profile: Profile): Promise<FillOutcome>;
}

/** 在 input/textarea 上写值并触发框架可感知的事件。 */
export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
