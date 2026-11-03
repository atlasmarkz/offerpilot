import { beforeEach, describe, expect, it } from "vitest";
import { ResumeData } from "@offerpilot/shared";
import { fillSections, normMonth } from "./sections";
import { TEMPLATES } from "./templates";

const feishu = TEMPLATES.find((t) => t.id === "feishu")!;

/** 按真实飞书招聘（蔚来校招简历编辑页）的结构搭的页面：区块 -> array-card 行 -> ud-formily-item，“添加”按钮追加一行。 */
const text = (label: string, extra = "") =>
  `<div class="ud-formily-item"><div class="ud-formily-item-label"><label>${label}*</label></div><div class="ud-formily-item-control"><div class="ud__input"><input class="ud__native-input" ${extra}></div></div></div>`;
const area = (label: string) =>
  `<div class="ud-formily-item"><div class="ud-formily-item-label"><label>${label}</label></div><div class="ud-formily-item-control"><textarea></textarea></div></div>`;
const select = (label: string, readonly = true) =>
  `<div class="ud-formily-item"><div class="ud-formily-item-label"><label>${label}*</label></div><div class="ud-formily-item-control"><div class="ud__select"><div class="ud__select__selector" data-label="${label}"><span class="ud__select__selector__content"></span><span class="ud__select__selector__search"><input class="ud__select__selector__search__input" ${readonly ? "readonly" : ""}></span></div></div></div></div>`;
const range = (label: string) =>
  `<div class="ud-formily-item"><div class="ud-formily-item-label"><label>${label}*</label></div><div class="ud-formily-item-control"><div class="ud__picker"><input placeholder="YYYY-MM"><input placeholder="YYYY-MM"></div></div></div>`;

const CARDS: Record<string, () => string> = {
  教育经历: () => `<div class="apply-form-array-card__1">${select("学校名称", false)}${select("学历")}${text("专业")}${range("起止时间")}${select("学历类型")}</div>`,
  实习经历: () => `<div class="apply-form-array-card__1">${text("公司名称")}${text("职位名称")}${range("起止时间")}${area("描述")}</div>`,
  项目经历: () => `<div class="apply-form-array-card__1">${text("项目名称")}${text("项目角色")}${range("起止时间")}${area("描述")}</div>`,
};

function section(title: string, rows = 1): string {
  return `<div class="applyFormModuleWrapper-windows"><div class="applyFormModuleWrapper-title">${title}</div><div class="applyFormModuleWrapper-right" data-section="${title}">${Array.from({ length: rows }, () => CARDS[title]!()).join("")}<button class="ud__button">添加</button></div></div>`;
}

const OPTIONS: Record<string, string[]> = { 学校名称: ["华北电力大学", "香港科技大学"], 学历: ["本科", "硕士", "博士"], 学历类型: ["统招全日制", "海外及港澳台"] };

/** 模拟页面脚本：“添加”追加行；点开下拉弹出选项，点选项写回选中文字。 */
function wire() {
  document.body.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (btn?.textContent === "添加") {
      const host = btn.closest<HTMLElement>("[data-section]")!;
      btn.insertAdjacentHTML("beforebegin", CARDS[host.dataset.section!]!());
    }
  });
  document.body.addEventListener("mousedown", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLElement>(".ud__select__selector");
    if (!sel) return;
    document.querySelectorAll(".pop").forEach((p) => p.remove());
    const pop = document.createElement("div");
    pop.className = "pop";
    for (const o of OPTIONS[sel.dataset.label!] ?? []) {
      const d = document.createElement("div");
      d.className = "ud__select__option";
      d.textContent = o;
      d.addEventListener("click", () => {
        sel.querySelector(".ud__select__selector__content")!.textContent = o;
        sel.querySelector("input")!.value = "";
        pop.remove();
      });
      pop.append(d);
    }
    document.body.append(pop);
  });
}

const resume = ResumeData.parse({
  contact: { name: "张三" },
  summary: "热爱技术",
  education: [
    { school: "华北电力大学", major: "智能科学与技术", degree: "本科", start: "2022.09", end: "2026-06" },
    { school: "香港科技大学", major: "计算机科学与技术", degree: "硕士", start: "2026/9", end: "2027.07" },
  ],
  experiences: [
    { kind: "internship", title: "Agent 工程师", org: "北京快手有限公司", start: "2026-03", end: "2026-07", bullets: ["调研推理范式", "自研权限引擎"], skills: [] },
    { kind: "project", title: "文本检测竞赛", org: "项目负责人", start: "2025-03", end: "2025-06", bullets: ["F1 提升至 92.93%"], skills: [] },
  ],
});

const valuesIn = (title: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-section="${title}"] [class*=apply-form-array-card__]`)].map((c) =>
    [...c.querySelectorAll<HTMLElement>(".ud-formily-item")].map((i) => {
      const vals = [...i.querySelectorAll<HTMLInputElement>("input,textarea")].map((x) => x.value).filter(Boolean).join("~");
      return vals || i.querySelector(".ud__select__selector__content")?.textContent || "";
    }),
  );

wire(); // body 在各用例间是同一个节点，监听只挂一次
beforeEach(() => {
  document.body.innerHTML = "";
});

describe("normMonth", () => {
  it("normalises assorted date spellings", () => {
    expect([normMonth("2022.09"), normMonth("2026/9"), normMonth("2026-06"), normMonth("2025"), normMonth("至今"), normMonth(undefined)]).toEqual(["2022-09", "2026-09", "2026-06", "2025", "", ""]);
  });
});

describe("fillSections on Feishu-style markup", () => {
  it("adds rows as needed, fills every field and reads each back", async () => {
    document.body.innerHTML = section("教育经历") + section("实习经历") + section("项目经历");
    const { sections } = await fillSections(document, resume, feishu);
    expect(valuesIn("教育经历")).toEqual([
      ["华北电力大学", "本科", "智能科学与技术", "2022-09~2026-06", ""],
      ["香港科技大学", "硕士", "计算机科学与技术", "2026-09~2027-07", ""],
    ]);
    expect(valuesIn("实习经历")[0]).toEqual(["北京快手有限公司", "Agent 工程师", "2026-03~2026-07", "调研推理范式\n自研权限引擎"]);
    expect(valuesIn("项目经历")[0]).toEqual(["文本检测竞赛", "项目负责人", "2025-03~2025-06", "F1 提升至 92.93%"]);

    const edu = sections.find((s) => s.title === "教育经历")!;
    expect(edu).toMatchObject({ wanted: 2, kept: 0, filled: 2 });
    // 学历类型简历里没有：不乱填，列给用户
    expect(edu.fields.filter((f) => f.status === "manual").map((f) => f.label)).toEqual(["教育经历「华北电力大学」学历类型", "教育经历「香港科技大学」学历类型"]);
    expect(edu.fields.filter((f) => f.status === "mismatch")).toEqual([]);
  }, 15000);

  it("leaves existing rows alone and is idempotent on a second run", async () => {
    document.body.innerHTML = section("教育经历", 1);
    const first = document.querySelector<HTMLInputElement>('[data-section="教育经历"] .ud__native-input')!;
    first.value = "我手填的专业";
    await fillSections(document, resume, feishu);
    expect(valuesIn("教育经历")).toHaveLength(3); // 已有内容但对不上简历任何一条的行原样保留，新增两行
    expect(valuesIn("教育经历")[0]![2]).toBe("我手填的专业");

    const again = (await fillSections(document, resume, feishu)).sections[0]!;
    expect(again).toMatchObject({ kept: 2, filled: 0 });
    expect(valuesIn("教育经历")).toHaveLength(3); // 再跑一次不会重复添加
  }, 20000);

  it("reports a mismatch when the page refuses a value", async () => {
    document.body.innerHTML = section("实习经历");
    // 这个页面把日期输入清空，模拟日期控件不接受直接输入
    document.querySelectorAll<HTMLInputElement>("input[placeholder=YYYY-MM]").forEach((i) => i.addEventListener("input", () => (i.value = "")));
    const { sections } = await fillSections(document, resume, feishu);
    const bad = sections[0]!.fields.filter((f) => f.status === "mismatch");
    expect(bad.map((f) => f.label.endsWith("起止时间"))).toEqual([true]);
  }, 15000);

  it("skips sections the page does not have, and notes empty ones", async () => {
    document.body.innerHTML = section("教育经历");
    const { sections } = await fillSections(document, ResumeData.parse({}), feishu);
    expect(sections).toEqual([expect.objectContaining({ title: "教育经历", wanted: 0, note: "简历里没有这一类内容" })]);
  });

  it("fills the single self-evaluation box", async () => {
    document.body.innerHTML = `<div class="applyFormModuleWrapper-windows"><div class="applyFormModuleWrapper-title">自我评价</div><div>${area("自我评价")}</div></div>`;
    const { sections } = await fillSections(document, resume, feishu);
    expect(document.querySelector("textarea")!.value).toBe("热爱技术");
    expect(sections[0]).toMatchObject({ title: "自我评价", filled: 1 });
  });
});
