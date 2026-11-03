import type { DegreeLevel, Profile } from "@offerpilot/shared";
import { setInputValue } from "./types";

export const DEGREE_LABEL: Record<DegreeLevel, string> = { bachelor: "本科", master: "硕士", phd: "博士" };
/** 下拉里常见的写法，用来在选项文字里匹配 */
const DEGREE_WORDS: Record<DegreeLevel, string[]> = {
  bachelor: ["本科", "学士", "bachelor"],
  master: ["硕士", "研究生", "master"],
  phd: ["博士", "doctor", "phd"],
};

interface Rule {
  key: string;
  /** 字段标签上出现这些词才算命中 */
  label: RegExp;
  /** 标签里出现这些词就不是这个字段（如“学校邮箱”） */
  not?: RegExp;
  value(p: Profile): string | undefined;
}

/**
 * 只填画像里有、且无歧义的基础字段。手机、邮箱、证件号等敏感信息画像里没有，
 * 这里也不碰；验证码、文件上传、密码一律跳过。
 */
const RULES: Rule[] = [
  { key: "姓名", label: /姓名|^name$/i, not: /用户名|公司|学校|昵称/, value: (p) => (p.name === "未命名" ? undefined : p.name) },
  { key: "学校", label: /毕业院校|学校|院校|school|university/i, not: /邮箱|类型|标签|所在地/, value: (p) => (p.school === "-" ? undefined : p.school) },
  { key: "专业", label: /专业|major/i, not: /类别|方向类/, value: (p) => (p.major === "-" ? undefined : p.major) },
  { key: "毕业年份", label: /毕业(年份|年度|时间|日期)|expected graduation/i, value: (p) => `${p.graduationYear}` },
  { key: "学历", label: /学历|学位|degree|education level/i, not: /证书|证明/, value: (p) => DEGREE_LABEL[p.degree] },
];

const SKIP_TYPES = new Set(["hidden", "file", "password", "checkbox", "radio", "submit", "button", "image", "email", "tel"]);

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s*＊:：]+/g, " ").trim();

/** 找出控件的标签文字：label[for] / 外层 label / aria / placeholder / 同一表单项里的说明文字。 */
export function labelOf(el: HTMLElement): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  if (el.id) {
    // 不用 CSS.escape：id 里有特殊字符时选择器会出错，直接比对 htmlFor
    for (const l of doc.querySelectorAll("label")) if (l.htmlFor === el.id) parts.push(l.textContent ?? "");
  }
  const wrap = el.closest("label");
  if (wrap) parts.push(wrap.textContent ?? "");
  parts.push(el.getAttribute("aria-label") ?? "", el.getAttribute("placeholder") ?? "", el.getAttribute("name") ?? "");
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) for (const id of labelledBy.split(/\s+/)) parts.push(doc.getElementById(id)?.textContent ?? "");

  // 表单项容器：UI 库里标签通常是控件的兄弟或叔伯节点
  // 始终读一遍：placeholder 常是“请输入/请选择”这种没有信息量的文字
  {
    const item = el.closest("[class*=form-item], [class*=FormItem], [class*=field], [class*=form_item], [class*=form__item], .el-form-item, .ant-form-item");
    if (item) {
      const lab = item.querySelector("label, [class*=label], [class*=title]");
      if (lab) parts.push(lab.textContent ?? "");
    }
  }
  return parts.map(clean).filter(Boolean).join(" ").slice(0, 80);
}

/**
 * 兜底：有些站点（自研组件库）的标签既不是 label 也不在名字带 label 的节点里。
 * 往上最多找 4 层，只看“里面只有这一个控件”的祖先，取它的文字当标签；文字太长说明是整段内容，不用。
 */
export function ancestorLabel(el: HTMLElement): string {
  let node: HTMLElement | null = el.parentElement;
  let best = "";
  for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
    if (node.querySelectorAll("input, textarea, select").length !== 1) break;
    const text = clean(node.textContent);
    if (text && text.length <= 30) best = text;
  }
  return best;
}

function visible(el: HTMLElement): boolean {
  // jsdom 没有布局：offsetParent 恒为 null，所以只看显式隐藏
  const s = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !(s && (s.display === "none" || s.visibility === "hidden")) && !el.hasAttribute("hidden");
}

function ruleFor(label: string): Rule | undefined {
  return RULES.find((r) => r.label.test(label) && !(r.not && r.not.test(label)));
}

function pickOption(select: HTMLSelectElement, words: string[]): boolean {
  const opt = [...select.options].find((o) => words.some((w) => `${o.text}${o.value}`.toLowerCase().includes(w)));
  if (!opt) return false;
  select.value = opt.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export interface FormFillReport {
  filled: string[];
  /** 识别出是我们能填的字段，但控件是自定义下拉/日期选择器等，需要用户自己选 */
  manual: string[];
  /** 控件本身已有内容，没有覆盖 */
  kept: string[];
  /** 只读的输入框外壳（自定义下拉）：可以试着点开、选对应选项，见 fillCustomSelects */
  pending: { key: string; el: HTMLElement; words: string[] }[];
}

/** 扫描页面上的表单控件并按标签填写。不提交、不点击任何按钮。 */
export function fillForm(doc: Document, profile: Profile): FormFillReport {
  const report: FormFillReport = { filled: [], manual: [], kept: [], pending: [] };
  const done = new Set<string>();
  const controls = doc.querySelectorAll<HTMLElement>("input, textarea, select");

  for (const el of controls) {
    if (!visible(el)) continue;
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    const rule = ruleFor(labelOf(el)) ?? ruleFor(ancestorLabel(el));
    if (!rule || done.has(rule.key)) continue;
    const value = rule.value(profile);
    if (!value) continue;

    if (el instanceof HTMLSelectElement) {
      const words = rule.key === "学历" ? DEGREE_WORDS[profile.degree] : [value.toLowerCase()];
      if (pickOption(el, words)) {
        report.filled.push(rule.key);
        done.add(rule.key);
      } else report.manual.push(rule.key);
      continue;
    }
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (input.value.trim()) {
      report.kept.push(rule.key);
      done.add(rule.key);
      continue;
    }
    // 只读输入框通常是自定义下拉/日期选择器的外壳，直接写值没有用
    if (input.readOnly) {
      report.manual.push(rule.key);
      report.pending.push({ key: rule.key, el: input, words: rule.key === "学历" ? DEGREE_WORDS[profile.degree] : [value.toLowerCase()] });
      continue;
    }
    setInputValue(input, value);
    report.filled.push(rule.key);
    done.add(rule.key);
  }
  report.manual = report.manual.filter((k) => !done.has(k));
  return report;
}

/** 验证码、短信验证等：检测到就停下交给用户，不尝试绕过。 */
export function detectBlocker(doc: Document): string | null {
  if (doc.querySelector("[class*=captcha i], [id*=captcha i], iframe[src*=captcha i], [class*=geetest i], [class*=slider-verify i]"))
    return "页面出现验证码，请手动完成";
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fire(el: Element, type: string) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

/**
 * 自定义下拉（飞书招聘 ud__select、Ant Design Select 等）：点开，在弹出的选项里找文字匹配的点一下。
 * 找不到就按 Esc 关掉，交给用户手动选；不会碰任何提交按钮。
 */
export async function pickCustomSelect(input: HTMLElement, words: string[]): Promise<boolean> {
  const doc = input.ownerDocument;
  const opener = input.closest<HTMLElement>("[class*=select__selector], [class*=select-selector], [class*=select]") ?? input;
  for (const t of ["mousedown", "mouseup", "click"]) fire(opener, t);
  for (let i = 0; i < 6; i++) {
    await wait(120);
    const options = [...doc.querySelectorAll<HTMLElement>("[role=option], [class*=select__option], [class*=select-option], [class*=option-item]")].filter(visible);
    const hit = options.find((o) => words.some((w) => (o.textContent ?? "").toLowerCase().includes(w)));
    if (hit) {
      for (const t of ["mousedown", "mouseup", "click"]) fire(hit, t);
      return true;
    }
  }
  doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return false;
}

/** 依次尝试自定义下拉；选上了的从“需手动”移到“已填写”。 */
export async function fillCustomSelects(report: FormFillReport): Promise<void> {
  for (const p of report.pending) {
    if (report.filled.includes(p.key)) continue;
    if (await pickCustomSelect(p.el, p.words)) {
      report.filled.push(p.key);
      report.manual = report.manual.filter((k) => k !== p.key);
    }
  }
}
