import { PRIVATE_FIELDS, type DegreeLevel, type Profile } from "@offerpilot/shared";
import { NATIVE_TEMPLATE, type SiteTemplate } from "./templates";
import { setInputValue } from "./types";

/** 用户在扩展里补充的信息（画像里没有的，如手机、邮箱），按字段名存，只保存在本机。优先于画像。 */
export type Extras = Record<string, string>;

export interface FillOptions {
  /** 核对模式：只比对页面上已有的内容，不写任何东西 */
  check?: boolean;
  extras?: Extras;
  template?: SiteTemplate;
}

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
/** 隐私字段里，画像里本来就有的那几个：用户没单独填时用画像的值 */
const PROFILE_FALLBACK: Record<string, (p: Profile) => string | undefined> = {
  姓名: (p) => (p.name === "未命名" ? undefined : p.name),
  政治面貌: (p) => p.politicalStatus,
  现居城市: (p) => p.cities[0],
};

const RULES: Rule[] = [
  { key: "学校", label: /毕业院校|学校|院校|school|university/i, not: /邮箱|类型|标签|所在地/, value: (p) => (p.school === "-" ? undefined : p.school) },
  { key: "专业", label: /专业|major/i, not: /类别|方向类/, value: (p) => (p.major === "-" ? undefined : p.major) },
  { key: "毕业年份", label: /毕业(年份|年度|时间|日期)|expected graduation/i, value: (p) => `${p.graduationYear}` },
  { key: "学历", label: /学历|学位|degree|education level/i, not: /证书|证明/, value: (p) => DEGREE_LABEL[p.degree] },
  // 姓名、手机、邮箱、证件号、出生日期……：来自“个人隐私信息”目录（只存本机）；画像里有的（姓名、政治面貌、现居城市）作后备
  ...PRIVATE_FIELDS.map((f): Rule => ({ key: f.key, label: f.label, not: f.not, value: PROFILE_FALLBACK[f.key] ?? (() => undefined) })),
];

/** 缺少信息时，弹窗里给用户补充的输入项；options 表示用下拉选。 */
export const EXTRA_FIELDS: { key: string; hint: string; options?: string[] }[] = [
  { key: "学校", hint: "毕业院校" },
  { key: "专业", hint: "所学专业" },
  ...PRIVATE_FIELDS.map((f) => ({ key: f.key, hint: f.hint, options: f.options })),
];

/** 画像里的占位值（“未命名”“-”）不算有值 */
const real = (v: string | undefined) => (v && v !== "未命名" && v !== "-" ? v : undefined);

function resolveValue(rule: Rule, profile: Profile, extras: Extras): string | undefined {
  return real(extras[rule.key]?.trim()) ?? real(rule.value(profile));
}

const SKIP_TYPES = new Set(["hidden", "file", "password", "checkbox", "radio", "submit", "button", "image"]);

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s*＊:：]+/g, " ").trim();

/** 找出控件的标签文字：label[for] / 外层 label / aria / placeholder / 同一表单项里的说明文字。 */
export function labelOf(el: HTMLElement, template: SiteTemplate = NATIVE_TEMPLATE): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  if (el.id) {
    // 不用 CSS.escape：id 里有特殊字符时选择器会出错，直接比对 htmlFor
    for (const l of doc.querySelectorAll("label")) if (l.htmlFor === el.id) parts.push(l.textContent ?? "");
  }
  const wrap = el.closest("label");
  if (wrap) parts.push(wrap.textContent ?? "");
  parts.push(el.getAttribute("aria-label") ?? "", el.getAttribute("placeholder") ?? "", el.getAttribute("name") ?? "");
  // 浏览器标准的自动填充提示（tel / email）和 Workday 的 data-automation-id，比文字更稳
  const ac = el.getAttribute("autocomplete");
  if (ac === "tel" || ac === "tel-national") parts.push("手机");
  else if (ac === "email") parts.push("邮箱");
  parts.push(el.getAttribute("data-automation-id") ?? "");
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) for (const id of labelledBy.split(/\s+/)) parts.push(doc.getElementById(id)?.textContent ?? "");

  // 表单项容器：UI 库里标签通常是控件的兄弟或叔伯节点
  // 始终读一遍：placeholder 常是“请输入/请选择”这种没有信息量的文字
  {
    const generic = "[class*=form-item], [class*=FormItem], [class*=field], [class*=form_item], [class*=form__item], .el-form-item, .ant-form-item";
    const item = (template.itemSelector ? el.closest(template.itemSelector) : null) ?? el.closest(generic);
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

export function visible(el: HTMLElement): boolean {
  // jsdom 没有布局：offsetParent 恒为 null，所以只看显式隐藏
  const s = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !(s && (s.display === "none" || s.visibility === "hidden")) && !el.hasAttribute("hidden");
}

function ruleFor(label: string): Rule | undefined {
  return RULES.find((r) => r.label.test(label) && !(r.not && r.not.test(label)));
}

/** 页面上的值和我们的值是不是同一个意思：忽略空白标点，互相包含即算一致；手机、证件号、日期只比数字。 */
export function sameValue(key: string, expected: string, actual: string): boolean {
  const digitsOnly = /手机|证件号码|紧急联系人电话|出生日期/.test(key);
  const norm = (s: string) => (digitsOnly ? s.replace(/\D/g, "") : s.replace(/[\s*＊:：,，.。、\-_/]+/g, "").toLowerCase());
  const e = norm(expected);
  const a = norm(actual);
  return !e || !a || e === a || a.includes(e) || e.includes(a);
}

/** 在下拉选项文字里匹配用的词：学历有多种写法，其余就用值本身 */
function wordsFor(key: string, value: string, profile: Profile): string[] {
  return key === "学历" && value === DEGREE_LABEL[profile.degree] ? DEGREE_WORDS[profile.degree] : [value.toLowerCase()];
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
  /** 页面上有这个字段，但画像和补充信息里都没有值：交给用户补充 */
  missing: string[];
  /** 页面上有、但目录里没有对应字段的空控件的标签（最多 12 个） */
  unrecognized: string[];
  /** 页面上已有的内容和我们的信息对不上 */
  differs: { label: string; expected: string; actual: string }[];
  /** 核对模式下：页面上是空的、我们有值的字段 */
  empty: string[];
}

/** 扫描页面上的表单控件并按标签填写。不提交、不点击任何按钮。 */
export function fillForm(doc: Document, profile: Profile, opts: FillOptions = {}): FormFillReport {
  const extras = opts.extras ?? {};
  const template = opts.template ?? NATIVE_TEMPLATE;
  const report: FormFillReport = { filled: [], manual: [], kept: [], pending: [], missing: [], unrecognized: [], differs: [], empty: [] };
  const done = new Set<string>();
  const controls = doc.querySelectorAll<HTMLElement>("input, textarea, select");

  for (const el of controls) {
    if (!visible(el)) continue;
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    const label = labelOf(el, template);
    const rule = ruleFor(label) ?? ruleFor(ancestorLabel(el));
    if (!rule) {
      // 没认出的空控件（可重复区块里的由分区块填写处理，这里不算）：列给用户看，也方便把新字段补进目录
      const shortLabel = label.split(" ").find((w) => w.length >= 2 && !/^(请|点击|按)/.test(w)) ?? "";
      const empty = el instanceof HTMLSelectElement ? el.value === "" : !(el as HTMLInputElement).value.trim();
      if (shortLabel && empty && !el.closest("[class*=apply-form-array-card], .u-wraps") && !report.unrecognized.includes(shortLabel) && report.unrecognized.length < 12)
        report.unrecognized.push(shortLabel);
      continue;
    }
    if (done.has(rule.key)) continue;
    const value = resolveValue(rule, profile, extras);
    if (!value) {
      // 控件里已经有内容就不用补；否则记为缺少
      const hasContent = !(el instanceof HTMLSelectElement) && (el as HTMLInputElement).value.trim() !== "";
      if (!hasContent && !report.missing.includes(rule.key)) report.missing.push(rule.key);
      continue;
    }

    // 页面上已经有内容（比如网站自己的简历解析填的）：比对一下，不一致的列给用户，绝不覆盖
    const current = (el instanceof HTMLSelectElement ? (el.value ? (el.selectedOptions[0]?.text ?? "") : "") : (el as HTMLInputElement).value).trim();
    if (current) {
      if (!sameValue(rule.key, value, current)) report.differs.push({ label: rule.key, expected: value, actual: current });
      if (opts.check || !(el instanceof HTMLSelectElement)) {
        report.kept.push(rule.key);
        done.add(rule.key);
        continue;
      }
    } else if (opts.check) {
      report.empty.push(rule.key);
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      const words = wordsFor(rule.key, value, profile);
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
      report.pending.push({ key: rule.key, el: input, words: wordsFor(rule.key, value, profile) });
      continue;
    }
    // 搜索下拉的输入框（Ant Design 的 select-search、飞书的学校搜索）：只往里打字不会选中，反而留下一个没选的状态。
    // 交给分区块填写（会点选项并核对）；那里没处理的，提示用户自己选
    if (input.matches("[class*=select-search__field], [class*=select__selector__search__input]")) {
      report.manual.push(rule.key);
      continue;
    }
    setInputValue(input, value);
    report.filled.push(rule.key);
    done.add(rule.key);
  }
  report.manual = report.manual.filter((k) => !done.has(k));
  report.missing = report.missing.filter((k) => !done.has(k));
  if (!opts.check) fillGenderRadios(doc, real(extras["性别"]?.trim()), report);
  return report;
}

/** 性别通常是“男/女”两个单选：只认选项恰好是男、女的那一组，选中与补充信息一致的。 */
function fillGenderRadios(doc: Document, gender: string | undefined, report: FormFillReport): void {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const r of doc.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
    if (!visible(r)) continue;
    const key = r.name || r.closest("[role=radiogroup], [class*=radio-group]")?.className || "";
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const text = (r: HTMLInputElement) => {
    const byFor = r.id ? [...doc.querySelectorAll("label")].find((l) => l.htmlFor === r.id) : undefined;
    const wrap = r.closest("label");
    const parent = r.parentElement && r.parentElement.querySelectorAll("input").length === 1 ? r.parentElement : null;
    return clean(byFor?.textContent ?? wrap?.textContent ?? parent?.textContent ?? r.nextElementSibling?.textContent ?? r.value);
  };
  for (const radios of groups.values()) {
    const labels = radios.map(text);
    if (!(labels.length === 2 && labels.includes("男") && labels.includes("女"))) continue;
    if (radios.some((r) => r.checked)) continue;
    if (!gender) {
      if (!report.missing.includes("性别")) report.missing.push("性别");
      continue;
    }
    const hit = radios.find((r) => text(r).startsWith(gender));
    if (hit) {
      hit.click();
      if (!hit.checked) hit.checked = true;
      hit.dispatchEvent(new Event("change", { bubbles: true }));
      if (!report.filled.includes("性别")) report.filled.push("性别");
      report.missing = report.missing.filter((k) => k !== "性别");
    }
  }
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
export async function pickCustomSelect(input: HTMLElement, words: string[], template: SiteTemplate = NATIVE_TEMPLATE): Promise<boolean> {
  const doc = input.ownerDocument;
  const generic = "[class*=select__selector], [class*=select-selector], [class*=select]";
  const opener = (template.select && input.closest<HTMLElement>(template.select.opener)) || input.closest<HTMLElement>(generic) || input;
  const optionSel = template.select ? `${template.select.option}, ` : "";
  for (const t of ["mousedown", "mouseup", "click"]) fire(opener, t);
  for (let i = 0; i < 6; i++) {
    await wait(120);
    const options = [...doc.querySelectorAll<HTMLElement>(`${optionSel}[role=option], [class*=select__option], [class*=select-option], [class*=option-item]`)].filter(visible);
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
export async function fillCustomSelects(report: FormFillReport, template: SiteTemplate = NATIVE_TEMPLATE): Promise<void> {
  for (const p of report.pending) {
    if (report.filled.includes(p.key)) continue;
    if (await pickCustomSelect(p.el, p.words, template)) {
      report.filled.push(p.key);
      report.manual = report.manual.filter((k) => k !== p.key);
    }
  }
}
