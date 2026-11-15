import type { BoardJob, Channel } from "@offerpilot/shared";

/** 一次投递的结果。 */
export type ApplyResult =
  /** 已发出（Boss：已打招呼；猎聘：已沟通 / 已投递） */
  | { kind: "sent" }
  /** 以前已经沟通过（平台显示“继续沟通”），不算这次的 */
  | { kind: "already" }
  /** 平台提示今天的次数用完了 */
  | { kind: "limit"; text: string }
  /** 验证码、安全验证、账号异常：必须交给用户 */
  | { kind: "blocked"; text: string }
  /** 没找到按钮、没反应等，计入连续失败 */
  | { kind: "failed"; text: string };

/**
 * 招聘平台适配器：只在用户自己已登录的平台标签页里运行，读页面、点按钮，不调用平台的私有接口。
 * 选择器集中写在每个适配器文件顶部，平台改版时只改那里。
 */
export interface JobBoardAdapter {
  channel: Channel;
  /** 能运行的页面（职位搜索列表页） */
  matches: RegExp[];
  /** 验证码、安全验证、登录失效等阻断项；没有返回 null */
  detectBlocker(doc: Document): string | null;
  /** 当前页面列表里的职位（只读卡片，不点开） */
  listJobs(doc: Document): BoardJob[];
  /** 点开一个职位，读详情（描述、HR 活跃度）；读不到的字段保持卡片上的值 */
  openJob(doc: Document, job: BoardJob): Promise<BoardJob>;
  /** 投递 / 打招呼。greeting 为空时用平台自己设置的招呼语 */
  apply(doc: Document, job: BoardJob, greeting: string): Promise<ApplyResult>;
  /** 翻到下一页或滚动加载更多；没有更多返回 false */
  nextPage(doc: Document): Promise<boolean>;
}

/** 在页面里等某个条件成立（轮询），超时返回 null。 */
export async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs = 5000, stepMs = 150): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() >= end) return null;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** 像真人一样点击：先 mousedown / mouseup，再 click（部分组件只认前两个）。 */
export function humanClick(el: Element): void {
  const opts = { bubbles: true, cancelable: true };
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  (el as HTMLElement).click();
}

export const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
