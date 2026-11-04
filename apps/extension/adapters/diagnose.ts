import { labelOf, visible } from "./formFill";
import { detectTemplate } from "./templates";

/**
 * 页面结构诊断：给还没适配的投递网站收集“表单长什么样”，用来写适配器。
 * 只收结构，不收你填的内容：每个控件只记标签、类型、类名、是否已有内容（是/否），不记值；
 * 网址只保留域名和路径，去掉 ? 后面的参数。结果只复制到剪贴板，由你自己决定发给谁。
 */
export interface FieldInfo {
  label: string;
  tag: string;
  type: string;
  readonly: boolean;
  required: boolean;
  filled: boolean;
  placeholder: string;
  cls: string;
  item: string;
  path: string;
  /** 在可重复区块（如多段教育经历）里：区块类名和这是第几个 */
  repeat?: { cls: string; index: number; of: number };
  /** 自定义下拉的外壳类名 */
  customSelect?: string;
  /** 原生下拉的选项文字 */
  options?: string[];
}

export interface StructureReport {
  url: string;
  template: string;
  headings: string[];
  buttons: Record<string, number>;
  iframes: number;
  fields: FieldInfo[];
  truncated: boolean;
}

const MAX_FIELDS = 150;
const short = (s: string | null | undefined, n = 60) => (s ?? "").trim().replace(/\s+/g, " ").slice(0, n);
const firstClass = (el: Element) => short(typeof el.className === "string" ? el.className.split(/\s+/)[0] : "", 40);

function repeatInfo(el: Element): FieldInfo["repeat"] {
  let node: Element | null = el.parentElement;
  for (let i = 0; i < 10 && node?.parentElement; i++, node = node.parentElement) {
    const cls = typeof node.className === "string" ? node.className : "";
    if (!cls) continue;
    const same = [...node.parentElement.children].filter((c) => c.className === cls);
    if (same.length >= 2 && node.querySelectorAll("input, textarea, select").length >= 2)
      return { cls: short(cls, 80), index: same.indexOf(node), of: same.length };
  }
  return undefined;
}

export function collectStructure(doc: Document, url: string): StructureReport {
  let shown = url;
  try {
    const u = new URL(url);
    shown = `${u.origin}${u.pathname}`;
  } catch {
    /* 保持原样 */
  }

  const det = detectTemplate(doc, url);
  const controls = [...doc.querySelectorAll<HTMLElement>("input, textarea, select")].filter(
    (el) => visible(el) && !(el instanceof HTMLInputElement && ["hidden", "submit", "button", "image"].includes(el.type)),
  );
  const fields: FieldInfo[] = controls.slice(0, MAX_FIELDS).map((el) => {
    const input = el as HTMLInputElement;
    const item = el.closest("[class*=form-item], [class*=formily-item], [class*=form__item], [class*=FormItem], [class*=field]");
    const custom = el.closest("[class*=select]");
    const chain: string[] = [];
    for (let n: Element | null = el, i = 0; n && i < 4; n = n.parentElement, i++) chain.push(`${n.tagName.toLowerCase()}.${firstClass(n)}`);
    const info: FieldInfo = {
      label: labelOf(el, det.template),
      tag: el.tagName.toLowerCase(),
      type: input.type ?? "",
      readonly: !!input.readOnly,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true" || !!item?.querySelector("[class*=required], [class*=asterisk]"),
      filled: el instanceof HTMLSelectElement ? el.value !== "" : !!input.value?.trim(),
      placeholder: short(input.placeholder, 30),
      cls: short(typeof el.className === "string" ? el.className : "", 80),
      item: item ? short(typeof item.className === "string" ? item.className : "", 80) : "",
      path: chain.join(" < "),
    };
    const rep = repeatInfo(el);
    if (rep) info.repeat = rep;
    if (custom && custom !== el) info.customSelect = short(typeof custom.className === "string" ? custom.className : "", 80);
    if (el instanceof HTMLSelectElement) info.options = [...el.options].slice(0, 40).map((o) => short(o.text, 20));
    return info;
  });

  const headings = new Set<string>();
  for (const h of doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, [class*=title], [class*=heading]")) {
    const t = short(h.textContent, 24);
    if (t && t.length <= 20 && h.children.length <= 2 && visible(h)) headings.add(t);
    if (headings.size >= 40) break;
  }
  const buttons: Record<string, number> = {};
  for (const b of doc.querySelectorAll<HTMLElement>("button, [role=button]")) {
    const t = short(b.textContent, 12);
    if (t && t.length <= 8) buttons[t] = (buttons[t] ?? 0) + 1;
  }

  return {
    url: shown,
    template: det.template.id,
    headings: [...headings],
    buttons,
    iframes: doc.querySelectorAll("iframe").length,
    fields,
    truncated: controls.length > MAX_FIELDS,
  };
}
