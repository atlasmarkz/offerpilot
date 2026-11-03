import type { Profile, ResumeData } from "@offerpilot/shared";
import type { Extras } from "./formFill";
import type { SectionResult } from "./sections";

/** 识别到的站点模板名（如“飞书招聘”），展示给用户；缺少的字段交给用户在弹窗里补充。 */
export interface FillMeta {
  template?: string;
  missing?: string[];
  /** 分区块填写（教育、实习、项目等）的逐项核对结果 */
  sections?: SectionResult[];
}

export type FillOutcome =
  | ({ status: "filled"; filledFields: string[] } & FillMeta)
  /** 遇到验证码、短信验证、无法确定的必填项等，必须交回用户处理 */
  | ({ status: "needs_user"; reason: string; filledFields: string[] } & FillMeta)
  | ({ status: "failed"; error: string } & FillMeta);

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
  fill(doc: Document, profile: Profile, extras?: Extras, resume?: ResumeData): Promise<FillOutcome>;
}

/** 在 input/textarea 上写值并触发框架可感知的事件。 */
export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
