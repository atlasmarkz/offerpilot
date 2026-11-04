import type { ResumeData } from "@offerpilot/shared";
import { pickCustomSelect, visible } from "./formFill";
import type { SiteTemplate } from "./templates";
import { layoutOf } from "./sectionLayouts";
import { setInputValue } from "./types";

/**
 * 分区块填写：教育经历、实习经历、项目经历、获奖、自我评价这类“可重复区块”。
 * 做法：找到区块 -> 已有内容的行一律不动 -> 缺几条就点“添加”补几行 -> 逐项填 -> 读回页面上的值逐项核对。
 * 核对不上的不会算成功，原样列给用户。现在只适配飞书招聘（.apply-form-array-card / .ud-formily-item）。
 */

export interface FieldResult {
  label: string;
  status: "ok" | "mismatch" | "manual";
  expected?: string;
  actual?: string;
  note?: string;
}

export interface SectionResult {
  title: string;
  /** 简历里有几条 */
  wanted: number;
  /** 页面上已经有内容、没有动的条数 */
  kept: number;
  /** 这次新填的条数 */
  filled: number;
  fields: FieldResult[];
  note?: string;
}

type Control = "text" | "select" | "search" | "range" | "month" | "date";

interface FieldSpec {
  /** 页面上的标签（去掉星号和空白后）匹配这个 */
  label: RegExp;
  /** 展示用名字 */
  name: string;
  control: Control;
  value?: string;
  /** 下拉里匹配用的词 */
  words?: string[];
  /** 起止时间：[开始, 结束] */
  range?: [string, string];
  /** 简历里没有这一项，需要用户自己选 */
  manualReason?: string;
  /** 同一个标签在一行里出现多次时取第几个（0 开始），如网易的“工作时间”是开始、结束两个表单项 */
  nth?: number;
}

interface RowSpec {
  /** 用来判断页面上是不是已经有这一条：主字段的值 */
  key: string;
  fields: FieldSpec[];
}

interface SectionSpec {
  name: string;
  title: RegExp;
  rows: (r: ResumeData) => RowSpec[];
}

const DEGREE_WORDS: [RegExp, string[]][] = [
  [/博士|phd|doctor/i, ["博士", "doctor", "phd"]],
  [/硕士|研究生|master/i, ["硕士", "研究生", "master"]],
  [/本科|学士|bachelor/i, ["本科", "学士", "bachelor"]],
];

/** 各种写法的年月统一成 YYYY-MM；认不出（含“至今”）返回空串。 */
export function normMonth(v: string | undefined): string {
  const m = (v ?? "").match(/(\d{4})\D{0,3}(\d{1,2})?/);
  if (!m) return "";
  return m[2] ? `${m[1]}-${m[2].padStart(2, "0")}` : m[1]!;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s*＊:：]+/g, "");
const bullets = (b: string[]) => b.map((x) => x.trim()).filter(Boolean).join("\n");

const range = (start?: string, end?: string): FieldSpec["range"] => [normMonth(start), normMonth(end)];

const SECTIONS: SectionSpec[] = [
  {
    name: "教育经历",
    title: /教育/,
    rows: (r) =>
      r.education
        .filter((e) => e.school)
        .map((e) => ({
          key: e.school,
          fields: [
            { label: /^(学校名称|学校|院校|毕业院校)$/, name: "学校名称", control: "search", value: e.school },
            { label: /^(学历|学位)$/, name: "学历", control: "select", value: e.degree, words: DEGREE_WORDS.find(([re]) => re.test(e.degree))?.[1] ?? [e.degree] },
            { label: /^(专业|所学专业)$/, name: "专业", control: "text", value: e.major },
            { label: /^(起止时间|就读时间|在校时间)$/, name: "起止时间", control: "range", range: range(e.start, e.end) },
            { label: /^入校时间$/, name: "入校时间", control: "date", value: normMonth(e.start) },
            { label: /^(获得学位证时间|毕业时间)$/, name: "毕业时间", control: "date", value: normMonth(e.end) },
            { label: /^学历类型$/, name: "学历类型", control: "select", manualReason: "简历里没有这一项" },
            ...(e.gpa ? [{ label: /^(GPA|成绩|绩点|排名)/i, name: "成绩", control: "text" as const, value: e.gpa }] : []),
          ],
        })),
  },
  ...(
    [
      { name: "实习经历", title: /实习/, kind: "internship" as const },
      { name: "科研经历", title: /科研|研究/, kind: "research" as const },
      { name: "校园经历", title: /校园|社团|学生/, kind: "campus" as const },
    ] as const
  ).map(
    (s): SectionSpec => ({
      name: s.name,
      title: s.title,
      rows: (r) =>
        r.experiences
          .filter((x) => x.kind === s.kind && x.org)
          .map((x) => ({
            key: x.org!,
            fields: [
              { label: /^(公司名称|单位名称|机构名称|实习单位)$/, name: "公司名称", control: "text", value: x.org },
              { label: /^(职位名称|岗位名称|职位|岗位|担任角色|角色)$/, name: "职位名称", control: "text", value: x.title },
              { label: /^(起止时间|实习时间|时间)$/, name: "起止时间", control: "range", range: range(x.start, x.end) },
              { label: /^(工作时间|实习时间)$/, name: "开始时间", control: "date", value: normMonth(x.start), nth: 0 },
              { label: /^(工作时间|实习时间)$/, name: "结束时间", control: "date", value: normMonth(x.end), nth: 1 },
              { label: /^(所在部门)$/, name: "所在部门", control: "text", manualReason: "简历里没有这一项" },
              { label: /^(描述|工作内容|工作描述|经历描述|工作职责)$/, name: "描述", control: "text", value: bullets(x.bullets) },
            ],
          })),
    }),
  ),
  {
    name: "项目经历",
    title: /项目/,
    rows: (r) =>
      r.experiences
        .filter((x) => x.kind === "project")
        .map((x) => ({
          key: x.title,
          fields: [
            { label: /^(项目名称|项目)$/, name: "项目名称", control: "text", value: x.title },
            ...(x.org ? [{ label: /^(项目角色|角色|担任角色)$/, name: "项目角色", control: "text" as const, value: x.org }] : []),
            { label: /^(起止时间|项目时间|时间)$/, name: "起止时间", control: "range", range: range(x.start, x.end) },
            { label: /^项目时间$/, name: "开始时间", control: "date", value: normMonth(x.start), nth: 0 },
            { label: /^项目时间$/, name: "结束时间", control: "date", value: normMonth(x.end), nth: 1 },
            { label: /^(描述|项目描述|项目内容)$/, name: "描述", control: "text", value: bullets(x.bullets) },
          ],
        })),
  },
  {
    name: "获奖",
    title: /获奖|奖项|荣誉/,
    rows: (r) =>
      r.experiences
        .filter((x) => x.kind === "award")
        .map((x) => ({
          key: x.title,
          fields: [
            { label: /^(获奖名称|奖项名称|荣誉名称|奖项)$/, name: "获奖名称", control: "text", value: x.title },
            { label: /^(获奖时间|时间)$/, name: "获奖时间", control: "month", value: normMonth(x.start ?? x.end) },
            { label: /^(描述|获奖描述)$/, name: "描述", control: "text", value: bullets(x.bullets) },
          ],
        })),
  },
];

/** 自我评价：单条，没有“添加”按钮 */
const SUMMARY: { title: RegExp; label: RegExp } = { title: /自我评价|个人总结|个人优势/, label: /^(自我评价|个人总结|个人优势|自我描述)$/ };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | undefined | false, ms = 2000, step = 100): Promise<T | undefined> {
  for (let t = 0; t <= ms; t += step) {
    const v = fn();
    if (v) return v as T;
    await wait(step);
  }
  return undefined;
}

const fire = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

const itemsOf = (row: HTMLElement, tpl: SiteTemplate) => [...row.querySelectorAll<HTMLElement>(tpl.itemSelector ?? ".ud-formily-item")];
const labelText = (item: HTMLElement, tpl: SiteTemplate) => clean(layoutOf(tpl).label(item));

/** 这个表单项的控件：能写的输入框（排除只读外壳以外的文件、单选等） */
function controlsOf(item: HTMLElement): HTMLInputElement[] {
  return [...item.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].filter(
    (i) => !(i instanceof HTMLInputElement && ["hidden", "file", "checkbox", "radio"].includes(i.type)) && visible(i),
  ) as HTMLInputElement[];
}

/** 页面上显示的值：下拉读选中的文字，其余读 value。 */
function readItem(item: HTMLElement): string {
  const sel = item.querySelector("[class*=select__selector__content], [class*=select__selector-item], [class*=select-selection-item], .ant-select-selection-selected-value");
  const selText = clean(sel?.textContent);
  const vals = controlsOf(item).map((i) => i.value.trim()).filter(Boolean);
  return vals.length ? vals.join("~") : selText;
}

const rowHasContent = (row: HTMLElement, tpl: SiteTemplate) => itemsOf(row, tpl).some((it) => readItem(it) !== "");

/** 点“添加”，等新行出现，返回新行 */
async function addRow(sec: HTMLElement, tpl: SiteTemplate): Promise<HTMLElement | undefined> {
  const layout = layoutOf(tpl);
  const before = layout.cards(sec).length;
  const btn = layout.addButton(sec);
  if (!btn) return undefined;
  btn.click();
  return until(() => (layout.cards(sec).length > before ? layout.cards(sec).at(-1) : undefined), 2500);
}

async function writeText(input: HTMLInputElement, v: string): Promise<void> {
  input.focus();
  setInputValue(input, v);
  await wait(60);
  input.blur();
}

/** 搜索型下拉（学校）：点开、输入文字、点第一个文字吻合的选项。 */
async function pickSearch(input: HTMLInputElement, text: string, tpl: SiteTemplate): Promise<boolean> {
  const doc = input.ownerDocument;
  const opener = input.closest<HTMLElement>(tpl.select?.opener ?? "[class*=select__selector]") ?? input;
  for (const t of ["mousedown", "mouseup", "click"]) fire(opener, t);
  input.focus();
  setInputValue(input, text);
  const optSel = `${tpl.select?.option ?? ""}, [role=option]`;
  // 搜索结果会陆续刷新：优先完全一致的选项，其次包含
  const hit = await until(() => {
    const opts = [...doc.querySelectorAll<HTMLElement>(optSel)].filter(visible);
    return opts.find((o) => clean(o.textContent) === clean(text)) ?? opts.find((o) => clean(o.textContent).includes(clean(text)));
  }, 4000);
  if (!hit) {
    setInputValue(input, "");
    press(doc.body, "Escape");
    return false;
  }
  for (const t of ["mousedown", "mouseup", "click"]) fire(hit, t);
  await wait(150);
  return true;
}

async function writeMonth(input: HTMLInputElement, v: string): Promise<void> {
  input.focus();
  setInputValue(input, v);
  press(input, "Enter");
  await wait(80);
  input.blur();
}

const isSearchInput = (i: HTMLInputElement) => i.matches("[class*=select-search__field], [class*=select__selector__search__input]");

/**
 * Ant Design 3 的日期选择：输入框是只读的，点开后弹层顶部有一个可输入的框，输入后回车选中。
 * 月份、日期两种格式都试一遍，以读回输入框里的值为准。
 */
async function pickAntDate(item: HTMLElement, ym: string): Promise<{ ok: boolean; actual: string }> {
  const doc = item.ownerDocument;
  const picker = item.querySelector<HTMLInputElement>(".ant-calendar-picker-input, [class*=picker] input");
  if (!picker) return { ok: false, actual: "" };
  const read = () => picker.value.trim();
  for (const text of [ym, `${ym}-01`]) {
    for (const t of ["mousedown", "mouseup", "click"]) fire(picker, t);
    const typed = await until(() => [...doc.querySelectorAll<HTMLInputElement>(".ant-calendar-input")].find(visible), 1500);
    if (!typed) break;
    typed.focus();
    setInputValue(typed, text);
    press(typed, "Enter");
    await wait(150);
    if (read().startsWith(ym)) return { ok: true, actual: read() };
    press(doc.body, "Escape");
    await wait(80);
  }
  return { ok: read().startsWith(ym), actual: read() };
}

/** 填一个字段并读回核对。 */
async function fillField(item: HTMLElement, f: FieldSpec, tpl: SiteTemplate): Promise<FieldResult> {
  const base = { label: f.name };
  if (f.manualReason) return { ...base, status: "manual", note: f.manualReason };
  const inputs = controlsOf(item);
  if (!inputs.length) return { ...base, status: "manual", note: "页面上找不到这一项的输入框" };

  if (f.control === "range") {
    const [s, e] = f.range ?? ["", ""];
    if (!s) return { ...base, status: "manual", note: "简历里没有起始时间" };
    if (inputs[0]) await writeMonth(inputs[0], s);
    if (e && inputs[1]) await writeMonth(inputs[1], e);
    const got = controlsOf(item).map((i) => i.value.trim());
    const ok = got[0] === s && (!e || got[1] === e);
    return { ...base, status: ok ? "ok" : "mismatch", expected: e ? `${s} ~ ${e}` : s, actual: got.filter(Boolean).join(" ~ ") };
  }

  const value = f.value?.trim();
  if (!value) return { ...base, status: "manual", note: "简历里没有这一项" };
  const input = inputs[0]!;

  if (f.control === "date") {
    const r = await pickAntDate(item, value);
    return { ...base, status: r.ok ? "ok" : "manual", expected: value, actual: r.actual, note: r.ok ? undefined : "日期选择器没有接受输入，请手动选" };
  }
  // 页面上这个“文字框”其实是搜索下拉（如网易的公司名称）：按搜索下拉处理
  if (f.control === "text" && isSearchInput(input) && !input.readOnly) {
    const okPick = await pickSearch(input, value, tpl);
    const actual = readItem(item);
    return { ...base, status: okPick && clean(actual).includes(clean(value)) ? "ok" : "manual", expected: value, actual, note: okPick ? undefined : "下拉里没有匹配的选项，请手动选" };
  }

  if (f.control === "select") {
    const okPick = await pickCustomSelect(input, f.words ?? [value.toLowerCase()], tpl);
    const actual = readItem(item);
    return { ...base, status: okPick && actual !== "" ? "ok" : "mismatch", expected: value, actual };
  }
  if (f.control === "search") {
    const okPick = await pickSearch(input, value, tpl);
    const actual = readItem(item);
    return { ...base, status: okPick && clean(actual).includes(clean(value)) ? "ok" : "mismatch", expected: value, actual };
  }
  if (f.control === "month") {
    await writeMonth(input, value);
    return { ...base, status: input.value.trim() === value ? "ok" : "mismatch", expected: value, actual: input.value.trim() };
  }
  await writeText(input, value);
  const actual = input.value.trim();
  return { ...base, status: actual === value ? "ok" : "mismatch", expected: value.slice(0, 40), actual: actual.slice(0, 40) };
}

/** 一行里按标签找到各字段并填写。同一个标签出现多次时，用第一个有可见控件的。 */
async function fillRow(row: HTMLElement, spec: RowSpec, tpl: SiteTemplate): Promise<FieldResult[]> {
  const items = itemsOf(row, tpl);
  const out: FieldResult[] = [];
  for (const f of spec.fields) {
    const item = items.filter((it) => f.label.test(labelText(it, tpl)) && controlsOf(it).length > 0)[f.nth ?? 0];
    if (!item) {
      // 页面没有这个字段就不算问题（比如没有“项目角色”）；简历有值而页面没有，也不用打扰用户
      continue;
    }
    out.push(await fillField(item, f, tpl));
  }
  return out;
}

export interface SectionsReport {
  sections: SectionResult[];
}

/** 页面上是不是已经有这一条（主字段的值出现在某个已有内容的行里）。 */
function presentRow(rows: HTMLElement[], key: string, tpl: SiteTemplate): boolean {
  const k = clean(key);
  return k !== "" && rows.some((r) => itemsOf(r, tpl).some((it) => clean(readItem(it)).includes(k)));
}

export async function fillSections(doc: Document, resume: ResumeData, tpl: SiteTemplate): Promise<SectionsReport> {
  const sections: SectionResult[] = [];
  const layout = layoutOf(tpl);

  for (const spec of SECTIONS) {
    const sec = layout.findSection(doc, spec.title);
    if (!sec) continue;
    const wanted = spec.rows(resume);
    const result: SectionResult = { title: spec.name, wanted: wanted.length, kept: 0, filled: 0, fields: [] };
    if (!wanted.length) {
      result.note = "简历里没有这一类内容";
      sections.push(result);
      continue;
    }

    for (const row of wanted) {
      const existing = layout.cards(sec);
      if (presentRow(existing, row.key, tpl)) {
        result.kept++;
        continue;
      }
      // 优先用现成的空行，没有再点“添加”
      let target = existing.find((c) => !rowHasContent(c, tpl));
      if (!target) target = await addRow(sec, tpl);
      if (!target) {
        result.fields.push({ label: `${spec.name}「${row.key}」`, status: "manual", note: "找不到“添加”按钮或新行没有出现" });
        continue;
      }
      const fields = await fillRow(target, row, tpl);
      result.filled++;
      for (const f of fields) result.fields.push({ ...f, label: `${spec.name}「${row.key.slice(0, 12)}」${f.label}` });
    }
    sections.push(result);
  }

  // 自我评价：单个文本框
  if (resume.summary) {
    const sec = layout.findSection(doc, SUMMARY.title);
    if (sec) {
      const result: SectionResult = { title: "自我评价", wanted: 1, kept: 0, filled: 0, fields: [] };
      const item = itemsOf(sec, tpl).find((it) => SUMMARY.label.test(labelText(it, tpl)) && controlsOf(it).length > 0);
      if (item && readItem(item) !== "") result.kept = 1;
      else if (item) {
        result.filled = 1;
        result.fields.push(await fillField(item, { label: SUMMARY.label, name: "自我评价", control: "text", value: resume.summary }, tpl));
      }
      sections.push(result);
    }
  }
  return { sections };
}

/** 报告里每个区块一行的文字摘要。 */
export function summarize(s: SectionResult): string {
  const bad = s.fields.filter((f) => f.status !== "ok").length;
  const parts = [`${s.title}：简历 ${s.wanted} 条`];
  if (s.kept) parts.push(`页面已有 ${s.kept} 条未改动`);
  if (s.filled) parts.push(`新填 ${s.filled} 条`);
  if (bad) parts.push(`${bad} 项需确认`);
  return parts.join("，");
}
