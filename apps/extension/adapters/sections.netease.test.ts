import { beforeEach, describe, expect, it, vi } from "vitest";

// 每行要等下拉、日期弹层，多行的用例会超过默认的 5 秒
vi.setConfig({ testTimeout: 30_000 });
import { ResumeData } from "@offerpilot/shared";
import { fillSections } from "./sections";
import { layoutOf } from "./sectionLayouts";
import { TEMPLATES, detectTemplate } from "./templates";

const netease = TEMPLATES.find((t) => t.id === "netease")!;

/** 按真实网易校招简历页（campus.163.com/app/personal/resume）的结构搭：编号标题 + .ant-row.u-wraps 行 + Ant Design 3 控件。 */
const item = (label: string, control: string) =>
  `<div class="ant-row ant-form-item"><div class="ant-form-item-label"><label>${label}</label></div><div class="ant-form-item-control-wrapper">${control}</div></div>`;
const input = (ph = "") => `<span class="ant-form-item-children"><input class="ant-input" placeholder="${ph}"></span>`;
const area = () => `<span class="ant-form-item-children"><textarea class="ant-input"></textarea></span>`;
const search = () =>
  `<div class="ant-select"><div class="ant-select-selection"><div class="ant-select-selection__rendered"><div class="ant-select-search"><div class="ant-select-search__field__wrap"><input class="ant-select-search__field"></div></div></div></div></div>`;
const date = (kind: "month" | "day") =>
  `<span class="ant-calendar-picker" data-kind="${kind}"><div><input class="ant-calendar-picker-input ant-input" readonly></div></span>`;

const CARD: Record<string, () => string> = {
  教育: () => `<div class="ant-row u-wraps">${item("入校时间", date("month"))}${item("获得学位证时间", date("day"))}${item("学校", search())}${item("所在学院", input())}${item("专业", input())}${item("实验室", input())}${item("导师", input())}${item("荣誉奖项", area())}</div>`,
  工作: () => `<div class="ant-row u-wraps">${item("工作时间", date("month"))}${item("工作时间", date("month"))}${item("公司名称", search())}${item("所在部门", input())}${item("岗位名称", input())}${item("工作职责", area())}</div>`,
  项目: () => `<div class="ant-row u-wraps">${item("项目时间", date("month"))}${item("项目时间", date("month"))}${item("项目名称", input())}${item("项目描述", area())}</div>`,
};

function module(heading: string, kind: string, rows: number): string {
  const body = Array.from({ length: rows }, () => CARD[kind]!()).join("");
  return `<div class="u-module" data-kind="${kind}"><div class="u-title">${heading}</div><div class="u-body">${body}<span class="u-add">+ 添加</span></div></div>`;
}

const SCHOOLS = ["华北电力大学", "香港科技大学"];
const COMPANIES = ["网易", "腾讯"];

/** 模拟页面脚本：“添加”追加行；搜索下拉输入后弹出匹配项；日期选择器弹层里有可输入的框。 */
let wired = false;
function wire() {
  if (wired) return; // document.body 在用例之间是同一个，监听器只挂一次
  wired = true;
  document.body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("u-add")) {
      const mod = t.closest<HTMLElement>(".u-module")!;
      t.insertAdjacentHTML("beforebegin", CARD[mod.dataset.kind!]!());
    }
    if (t.classList.contains("anticon-plus-circle")) {
      const cards = t.parentElement!.querySelectorAll(".u-wraps");
      cards[cards.length - 1]!.insertAdjacentHTML("afterend", CARD[t.dataset.kind!]!());
    }
    const opt = t.closest<HTMLElement>(".ant-select-dropdown-menu-item");
    if (opt) {
      const target = document.querySelector<HTMLInputElement>("input[data-open=true]")!;
      const holder = target.closest(".ant-select-selection")!;
      holder.insertAdjacentHTML("afterbegin", `<div class="ant-select-selection-selected-value">${opt.textContent}</div>`);
      document.querySelectorAll(".ant-select-dropdown").forEach((d) => d.remove());
      target.removeAttribute("data-open");
    }
    const pickerInput = t.closest<HTMLInputElement>(".ant-calendar-picker-input");
    if (pickerInput) {
      document.querySelectorAll(".ant-calendar-input").forEach((i) => i.remove());
      const typed = document.createElement("input");
      typed.className = "ant-calendar-input";
      const kind = pickerInput.closest<HTMLElement>("[data-kind]")!.dataset.kind;
      typed.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        const ok = kind === "month" ? /^\d{4}-\d{2}$/.test(typed.value) : kind === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(typed.value) : false;
        if (ok) {
          pickerInput.value = typed.value;
          typed.remove();
        }
      });
      document.body.append(typed);
    }
  });
  document.body.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains("ant-select-search__field") || !t.value) return;
    t.setAttribute("data-open", "true");
    document.querySelectorAll(".ant-select-dropdown").forEach((d) => d.remove());
    const list = (t.closest("[data-kind].u-module, [data-kind].content")?.getAttribute("data-kind") === "教育" ? SCHOOLS : COMPANIES).filter((n) => n.includes(t.value));
    const dd = document.createElement("div");
    dd.className = "ant-select-dropdown";
    dd.innerHTML = `<ul>${list.map((n) => `<li class="ant-select-dropdown-menu-item">${n}</li>`).join("")}</ul>`;
    document.body.append(dd);
  });
  document.body.addEventListener("mousedown", () => {});
}

const resume = ResumeData.parse({
  education: [{ school: "华北电力大学", major: "智能科学与技术", degree: "本科", start: "2022-09", end: "2026-06" }],
  experiences: [
    { kind: "internship", title: "后端开发实习生", org: "网易", start: "2025-07", end: "2025-10", bullets: ["重构订单服务"] },
    { kind: "project", title: "分布式 KV 存储", start: "2025-03", end: "2025-08", bullets: ["实现 Raft"] },
  ],
});

beforeEach(() => {
  document.body.innerHTML = "";
  wire();
});

describe("netease template detection and layout", () => {
  it("is picked by host", () => {
    document.body.innerHTML = module("2. 教育背景（必填）", "教育", 1);
    expect(detectTemplate(document, "https://campus.163.com/app/personal/resume").template.id).toBe("netease");
  });

  it("finds each numbered section without bleeding into its neighbours", () => {
    document.body.innerHTML = `<div class="wrap">${module("2. 教育背景（必填）", "教育", 2)}${module("3. 工作/实习经历", "工作", 1)}${module("4. 项目/活动经历", "项目", 3)}</div>`;
    const layout = layoutOf(netease);
    expect(layout.cards(layout.findSection(document, /教育/)!)).toHaveLength(2);
    expect(layout.cards(layout.findSection(document, /实习/)!)).toHaveLength(1);
    expect(layout.cards(layout.findSection(document, /项目/)!)).toHaveLength(3);
    expect(layout.findSection(document, /不存在/)).toBeUndefined();
  });
});

describe("fillSections on Netease-style markup", () => {
  it("fills search selects, typed dates (month or full date) and texts, adding rows as needed", async () => {
    document.body.innerHTML = `<div>${module("2. 教育背景（必填）", "教育", 1)}${module("3. 工作/实习经历", "工作", 1)}${module("4. 项目/活动经历", "项目", 1)}</div>`;
    const { sections } = await fillSections(document, resume, netease);
    const by = Object.fromEntries(sections.map((s) => [s.title, s]));

    const edu = document.querySelector('[data-kind="教育"]')!;
    expect(edu.querySelector(".ant-select-selection-selected-value")?.textContent).toBe("华北电力大学");
    const eduDates = [...edu.querySelectorAll<HTMLInputElement>(".ant-calendar-picker-input")].map((i) => i.value);
    expect(eduDates[0]).toBe("2022-09"); // 月份格式被接受
    expect(eduDates[1]).toBe("2026-06-01"); // 只接受完整日期：自动换格式重试
    expect(edu.querySelectorAll<HTMLInputElement>("input.ant-input:not(.ant-calendar-picker-input)")[1]!.value).toBe("智能科学与技术");

    const work = document.querySelector('[data-kind="工作"]')!;
    const workDates = [...work.querySelectorAll<HTMLInputElement>(".ant-calendar-picker-input")].map((i) => i.value);
    expect(workDates).toEqual(["2025-07", "2025-10"]); // 同名的“工作时间”分别是开始和结束
    expect(work.querySelector(".ant-select-selection-selected-value")?.textContent).toBe("网易");
    expect(work.querySelector("textarea")!.value).toBe("重构订单服务");

    const proj = document.querySelector('[data-kind="项目"]')!;
    expect(proj.querySelectorAll<HTMLInputElement>(".ant-calendar-picker-input")[1]!.value).toBe("2025-08");
    expect(proj.querySelector("textarea")!.value).toBe("实现 Raft");

    expect(by["教育经历"]!.filled).toBe(1);
    expect(by["实习经历"]!.fields.every((f) => f.status === "ok" || f.status === "manual")).toBe(true);
  });

  it("clicks the add link when the page has fewer rows than the resume", async () => {
    document.body.innerHTML = `<div>${module("2. 教育背景（必填）", "教育", 1)}</div>`;
    const r = ResumeData.parse({
      education: [
        { school: "华北电力大学", major: "智能科学与技术", degree: "本科", start: "2018-09", end: "2022-06" },
        { school: "香港科技大学", major: "计算机科学与技术", degree: "硕士", start: "2022-09", end: "2024-06" },
      ],
    });
    // 让第一行已经有内容，这样第二条必须新增一行
    document.querySelector<HTMLInputElement>(".ant-form-item input.ant-input:not(.ant-calendar-picker-input)")!.value = "x";
    await fillSections(document, r, netease);
    expect(document.querySelectorAll(".u-wraps").length).toBeGreaterThanOrEqual(2);
  });

  it("leaves rows alone that already hold the same school, and reports manual when the date picker refuses input", async () => {
    document.body.innerHTML = `<div>${module("2. 教育背景（必填）", "教育", 1)}</div>`;
    document.querySelectorAll(".ant-calendar-picker-input").forEach((i) => ((i.closest("[data-kind]") as HTMLElement).dataset.kind = "never"));
    const { sections } = await fillSections(document, resume, netease);
    const dates = sections[0]!.fields.filter((f) => f.label.includes("时间"));
    expect(dates.every((f) => f.status === "manual")).toBe(true);
  });
});

describe("netease: flat page, left nav, plus icon, highest degree first, extra education fields", () => {
  const flat = (eduRows: number) => `
    <ul class="nav"><li>1. 个人信息（必填）</li><li>2. 教育背景（必填）</li><li>3. 工作/实习经历</li></ul>
    <div class="content" data-kind="教育">
      <div class="u-title">2. 教育背景（必填）</div>
      ${Array.from({ length: eduRows }, () => CARD["教育"]!()).join("")}
      <i class="anticon anticon-plus-circle" data-kind="教育"></i>
    </div>
    <div class="content" data-kind="工作"><div class="u-title">3. 工作/实习经历</div>${CARD["工作"]!()}<span class="u-add">+ 添加</span></div>`;

  it("ignores the nav entries and bounds each section by the next numbered heading", () => {
    document.body.innerHTML = flat(2);
    const layout = layoutOf(netease);
    const edu = layout.findSection(document, /教育/)!;
    expect(layout.cards(edu)).toHaveLength(2);
    expect(layout.cards(layout.findSection(document, /实习/)!)).toHaveLength(1);
    expect(layout.addButton(edu)?.className).toContain("anticon-plus-circle");
  });

  it("fills the highest degree first, adds a row with the plus icon, and fills college / lab / advisor / honours", async () => {
    document.body.innerHTML = flat(1);
    const r = ResumeData.parse({
      education: [
        { school: "华北电力大学", major: "智能科学与技术", degree: "本科", start: "2018-09", end: "2022-06", college: "控制与计算机工程学院", honors: "2021 国家奖学金" },
        { school: "香港科技大学", major: "计算机科学与技术", degree: "硕士", start: "2022-09", end: "2024-06", lab: "NLP 实验室", advisor: "李老师" },
      ],
    });
    await fillSections(document, r, netease);
    const rows = [...document.querySelectorAll('[data-kind="教育"] .u-wraps')];
    expect(rows).toHaveLength(2);
    const school = (row: Element) => row.querySelector(".ant-select-selection-selected-value")?.textContent;
    expect(school(rows[0]!)).toBe("香港科技大学"); // 硕士在前
    expect(school(rows[1]!)).toBe("华北电力大学");
    const text = (row: Element, label: string) => {
      const it = [...row.querySelectorAll(".ant-form-item")].find((x) => x.querySelector(".ant-form-item-label")?.textContent === label)!;
      return (it.querySelector("input, textarea") as HTMLInputElement).value;
    };
    expect(text(rows[0]!, "实验室")).toBe("NLP 实验室");
    expect(text(rows[0]!, "导师")).toBe("李老师");
    expect(text(rows[1]!, "所在学院")).toBe("控制与计算机工程学院");
    expect(text(rows[1]!, "荣誉奖项")).toBe("2021 国家奖学金");
  });
});

describe("rows already on the page (e.g. the site's own resume parser filled them)", () => {
  const prefilled = () => {
    document.body.innerHTML = `<div>${module("2. 教育背景（必填）", "教育", 1)}</div>`;
    const card = document.querySelector(".u-wraps")!;
    card.querySelector(".ant-select-selection")!.insertAdjacentHTML("afterbegin", '<div class="ant-select-selection-selected-value">香港科技大学</div>');
    const byLabel = (l: string) =>
      [...card.querySelectorAll(".ant-form-item")].find((x) => x.querySelector(".ant-form-item-label")?.textContent === l)!.querySelector("input, textarea") as HTMLInputElement;
    byLabel("专业").value = "错误的专业名";
    return { card, byLabel };
  };
  const r = ResumeData.parse({
    education: [{ school: "香港科技大学", major: "计算机科学与技术", degree: "硕士", start: "2022-09", end: "2024-06", college: "工学院", lab: "NLP 实验室" }],
  });

  it("completes the empty fields of an existing row but never overwrites what is there", async () => {
    const { byLabel } = prefilled();
    const { sections } = await fillSections(document, r, netease);
    expect(byLabel("所在学院").value).toBe("工学院"); // 空着的补上
    expect(byLabel("实验室").value).toBe("NLP 实验室");
    expect(byLabel("专业").value).toBe("错误的专业名"); // 已有内容不动
    const f = sections[0]!.fields.find((x) => x.label.endsWith("专业"))!;
    expect(f).toMatchObject({ status: "mismatch", actual: "错误的专业名", expected: "计算机科学与技术" });
    expect(sections[0]!.kept).toBe(1);
    expect(document.querySelectorAll(".u-wraps")).toHaveLength(1);
  });

  it("check mode compares only: nothing is written, empty and differing fields are reported", async () => {
    const { byLabel } = prefilled();
    const { sections } = await fillSections(document, r, netease, "check");
    expect(byLabel("所在学院").value).toBe("");
    expect(byLabel("实验室").value).toBe("");
    expect(byLabel("专业").value).toBe("错误的专业名");
    const status = Object.fromEntries(sections[0]!.fields.map((x) => [x.label.replace(/^.*」/, ""), x.status]));
    expect(status["专业"]).toBe("mismatch");
    expect(status["所在学院"]).toBe("manual");
  });

  it("check mode reports a school the page does not have instead of adding a row", async () => {
    document.body.innerHTML = `<div>${module("2. 教育背景（必填）", "教育", 1)}</div>`;
    const { sections } = await fillSections(document, r, netease, "check");
    expect(document.querySelectorAll(".u-wraps")).toHaveLength(1);
    expect(sections[0]!.fields[0]).toMatchObject({ status: "mismatch", actual: "页面上没有这一条" });
  });
});
