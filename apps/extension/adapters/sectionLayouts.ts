import { visible } from "./formFill";
import type { SiteTemplate } from "./templates";

/** 一个区块：el 是它所在的容器（飞书是区块自己的容器；网易是整页，靠 head~next 之间的范围界定）。 */
export interface Section {
  el: HTMLElement;
  /** 区块标题和下一个区块的标题：只取这两者之间的内容（容器里混着多个区块时用） */
  head?: Element;
  next?: Element;
}

/**
 * 区块布局：不同招聘系统里“区块容器、可重复的行、字段标签、添加按钮”的写法不一样。
 * sections.ts 只认这个接口；新增一个站点，只要在这里加一套布局，再在 templates.ts 里指定 layout。
 */
export interface SectionLayout {
  findSection(doc: Document, title: RegExp): Section | undefined;
  cards(sec: Section): HTMLElement[];
  /** 表单项上的字段名（去掉星号和空白前的原文） */
  label(item: HTMLElement): string;
  addButton(sec: Section): HTMLElement | undefined;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s*＊:：]+/g, "");

const FEISHU: SectionLayout = {
  findSection(doc, title) {
    for (const w of doc.querySelectorAll<HTMLElement>("[class*=applyFormModuleWrapper-windows]")) {
      const t = w.querySelector("[class*=applyFormModuleWrapper-title]")?.textContent ?? "";
      if (title.test(t.trim())) return { el: w };
    }
    return undefined;
  },
  cards: (sec) => [...sec.el.querySelectorAll<HTMLElement>("[class*=apply-form-array-card__]")],
  label: (item) => item.querySelector("[class*=formily-item-label], label")?.textContent ?? "",
  addButton: (sec) => [...sec.el.querySelectorAll<HTMLElement>("button, [role=button]")].find((b) => clean(b.textContent) === "添加"),
};

/** 编号标题，如“2. 教育背景（必填）”“3. 工作/实习经历” */
const NUMBERED = /^\d+\s*[.、．]\s*\S/;

/** el 是否在 head 之后、next 之前（文档顺序） */
function between(sec: Section, el: Element): boolean {
  if (sec.head && !(sec.head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
  if (sec.next && !(sec.next.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) return false;
  return true;
}

const ADD_ICONS = ".anticon-plus-circle, .anticon-plus, [class*=plus], [class*=add-icon], [class*=icon-add]";

const NETEASE: SectionLayout = {
  findSection(doc, title) {
    // 页面左侧的导航里也有同样的编号文字，但它们之间没有表单行：所有同名标题都试一遍，取范围内有行的那个
    const heads = [...doc.querySelectorAll<HTMLElement>("[class*=title], h1, h2, h3, h4, a, li, span, div")].filter((h) => {
      const t = h.textContent?.trim() ?? "";
      return t.length <= 30 && NUMBERED.test(t) && h.children.length <= 1;
    });
    for (const [i, head] of heads.entries()) {
      if (!title.test(head.textContent ?? "")) continue;
      // 下一个编号标题：文档顺序里排在它后面、且不在它里面的第一个
      const next = heads.slice(i + 1).find((h) => !head.contains(h) && head.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING);
      const sec: Section = { el: doc.body, head, next };
      if (NETEASE.cards(sec).length) return sec;
    }
    return undefined;
  },
  cards: (sec) =>
    [...sec.el.querySelectorAll<HTMLElement>(".ant-row.u-wraps")].filter((c) => between(sec, c) && c.querySelectorAll(".ant-form-item").length >= 2),
  label: (item) => item.querySelector(".ant-form-item-label")?.textContent ?? "",
  addButton(sec) {
    // 添加入口：“+”图标按钮（实测是行右侧的蓝色圆形加号），或文字为“添加/新增”的 a / span / button
    const inRange = (sel: string) => [...sec.el.querySelectorAll<HTMLElement>(sel)].filter((e) => between(sec, e) && visible(e));
    const icon = inRange(ADD_ICONS).at(-1);
    if (icon) return icon.closest<HTMLElement>("button, a, [role=button], [class*=btn]") ?? icon;
    const text = inRange("button, a, span, div, li").filter(
      (e) => e.children.length <= 1 && /^[+＋]?\s*(添加|新增|继续添加)/.test(e.textContent?.trim() ?? "") && (e.textContent?.trim().length ?? 99) <= 8,
    );
    return text.at(-1);
  },
};

export function layoutOf(tpl: SiteTemplate): SectionLayout {
  return tpl.layout === "netease" ? NETEASE : FEISHU;
}
