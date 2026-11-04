import { visible } from "./formFill";
import type { SiteTemplate } from "./templates";

/**
 * 区块布局：不同招聘系统里“区块容器、可重复的行、字段标签、添加按钮”的写法不一样。
 * sections.ts 只认这个接口；新增一个站点，只要在这里加一套布局，再在 templates.ts 里指定 layout。
 */
export interface SectionLayout {
  findSection(doc: Document, title: RegExp): HTMLElement | undefined;
  cards(sec: HTMLElement): HTMLElement[];
  /** 表单项上的字段名（去掉星号和空白前的原文） */
  label(item: HTMLElement): string;
  addButton(sec: HTMLElement): HTMLElement | undefined;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s*＊:：]+/g, "");

const FEISHU: SectionLayout = {
  findSection(doc, title) {
    for (const w of doc.querySelectorAll<HTMLElement>("[class*=applyFormModuleWrapper-windows]")) {
      const t = w.querySelector("[class*=applyFormModuleWrapper-title]")?.textContent ?? "";
      if (title.test(t.trim())) return w;
    }
    return undefined;
  },
  cards: (sec) => [...sec.querySelectorAll<HTMLElement>("[class*=apply-form-array-card__]")],
  label: (item) => item.querySelector("[class*=formily-item-label], label")?.textContent ?? "",
  addButton: (sec) => [...sec.querySelectorAll<HTMLElement>("button, [role=button]")].find((b) => clean(b.textContent) === "添加"),
};

/** 编号标题，如“2. 教育背景（必填）”“3. 工作/实习经历” */
const NUMBERED = /^\d+\s*[.、．]\s*\S/;

const NETEASE: SectionLayout = {
  findSection(doc, title) {
    // 找标题文字：以编号开头、内容匹配 title 的最内层节点
    const heads = [...doc.querySelectorAll<HTMLElement>("[class*=title], h1, h2, h3, h4")].filter((h) => {
      const t = h.textContent?.trim() ?? "";
      return t.length <= 30 && NUMBERED.test(t) && h.children.length <= 2;
    });
    const head = heads.find((h) => title.test(h.textContent ?? ""));
    if (!head) return undefined;
    // 往上找第一个包含可重复行、且不包含其他编号标题的祖先
    for (let n: HTMLElement | null = head.parentElement; n; n = n.parentElement) {
      if (!n.querySelector(".u-wraps")) continue;
      const others = heads.filter((h) => h !== head && n!.contains(h));
      return others.length ? undefined : n;
    }
    return undefined;
  },
  cards: (sec) => [...sec.querySelectorAll<HTMLElement>(".ant-row.u-wraps")].filter((c) => c.querySelectorAll(".ant-form-item").length >= 2),
  label: (item) => item.querySelector(".ant-form-item-label")?.textContent ?? "",
  addButton(sec) {
    // 添加入口可能是 a / span / div / button，文字是“添加”“新增”“+ 添加”之类
    const all = [...sec.querySelectorAll<HTMLElement>("button, a, span, div, li")].filter(visible);
    const hit = all.filter((e) => e.children.length <= 1 && /^[+＋]?\s*(添加|新增|继续添加)/.test(e.textContent?.trim() ?? "") && (e.textContent?.trim().length ?? 99) <= 8);
    return hit.at(-1);
  },
};

export function layoutOf(tpl: SiteTemplate): SectionLayout {
  return tpl.layout === "netease" ? NETEASE : FEISHU;
}
