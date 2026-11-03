import { Profile } from "@offerpilot/shared";
import { EXTRA_FIELDS } from "../../adapters/formFill";
import type { FillOutcome } from "../../adapters/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fillBtn = $<HTMLButtonElement>("fill");
const demoBtn = $<HTMLButtonElement>("demo");
const resultBox = $("result");

// 网站地址：商店版构建时由 WXT_WEB_ORIGIN 指定，本地开发默认 localhost
const SITE = String(import.meta.env.WXT_WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
$<HTMLAnchorElement>("site").href = `${SITE}/app`;
$<HTMLAnchorElement>("sync").href = `${SITE}/app`;

/** 体验用的示例画像：明显是虚构的，不要拿去填真实的投递页。 */
const DEMO_NAME = "张三（示例）";
const DEMO_PROFILE: Profile = {
  name: DEMO_NAME,
  school: "示例大学",
  schoolTags: [],
  major: "计算机科学与技术",
  degree: "bachelor",
  graduationYear: 2027,
  cities: [],
  targetCompanyTypes: [],
  targetRoles: [],
  experiences: [],
};

async function loadProfile(): Promise<Profile | null> {
  const { profile } = await browser.storage.local.get("profile");
  const parsed = Profile.safeParse(profile);
  return parsed.success ? parsed.data : null;
}

function setText(id: string, text: string) {
  $(id).textContent = text;
}

async function refresh() {
  const p = await loadProfile();
  $("profile").hidden = !p;
  $("empty").hidden = !!p;
  if (!p) return;
  const isDemo = p.name === DEMO_NAME;
  setText("avatar", (p.school[0] ?? "?").toUpperCase());
  const school = $("school");
  school.textContent = p.school;
  if (isDemo) {
    const tag = document.createElement("span");
    tag.className = "demo-tag";
    tag.textContent = "示例";
    school.append(tag);
  }
  setText("major", [p.major, `${p.graduationYear} 届`].filter(Boolean).join(" · "));
}

/** 把填表结果画成状态卡片：成功 / 需要你处理 / 没有填写。 */
function render(o: FillOutcome) {
  resultBox.hidden = false;
  resultBox.className = `result ${o.status === "filled" ? "ok" : o.status === "needs_user" ? "warn" : "err"}`;
  resultBox.replaceChildren();

  const h = document.createElement("h2");
  h.textContent = o.status === "filled" ? "✓ 已填写" : o.status === "needs_user" ? "! 已填写，还需要你处理" : "✕ 没有填写";
  resultBox.append(h);

  if (o.status !== "failed" && o.filledFields.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const f of o.filledFields) {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = f;
      chips.append(c);
    }
    resultBox.append(chips);
  }
  const note = document.createElement("p");
  note.textContent =
    o.status === "filled" ? "请检查填好的内容，然后自己点击提交。" : o.status === "needs_user" ? o.reason : o.error;
  resultBox.append(note);
  if (o.template) {
    const t = document.createElement("p");
    t.className = "tpl";
    t.textContent = `识别为：${o.template}`;
    resultBox.append(t);
  }
  if (o.missing?.length) resultBox.append(missingForm(o.missing));
  else if (o.status === "needs_user") {
    const more = document.createElement("p");
    more.textContent = "处理完后，请检查内容并自己点击提交。";
    resultBox.append(more);
  }
}

/** 页面要但我们没有的信息：让用户补充，存在本机，补完自动重新填写。 */
function missingForm(missing: string[]): HTMLElement {
  const form = document.createElement("form");
  form.className = "missing";
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const key of missing) {
    const def = EXTRA_FIELDS.find((f) => f.key === key);
    const row = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = key;
    let input: HTMLInputElement | HTMLSelectElement;
    if (def?.options) {
      input = document.createElement("select");
      input.append(new Option("请选择", ""), ...def.options.map((o) => new Option(o, o)));
    } else {
      input = document.createElement("input");
      input.placeholder = def?.hint ?? "";
    }
    inputs.set(key, input);
    row.append(name, input);
    form.append(row);
  }
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "primary small";
  btn.textContent = "保存并重新填写";
  const hint = document.createElement("small");
  hint.textContent = "只保存在这台电脑的浏览器里，不会上传。";
  form.append(btn, hint);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { extras } = await browser.storage.local.get("extras");
    const next: Record<string, string> = { ...(extras && typeof extras === "object" ? (extras as Record<string, string>) : {}) };
    for (const [k, el] of inputs) if (el.value.trim()) next[k] = el.value.trim();
    await browser.storage.local.set({ extras: next });
    void runFill();
  });
  return form;
}

void refresh();

// 网页端同步画像后，已经打开的弹窗也立刻刷新，不用关了重开
browser.storage.onChanged.addListener((changes) => {
  if (changes.profile) void refresh();
});

// 填表脚本跑完后会把结果发回来；弹窗开着时随时显示（点击流程和自动化测试都走这里）
browser.runtime.onMessage.addListener((m: unknown) => {
  const msg = m as { type?: string; outcome?: FillOutcome };
  if (msg.type === "offerpilot:result" && msg.outcome) render(msg.outcome);
});

demoBtn.addEventListener("click", async () => {
  await browser.storage.local.set({ profile: DEMO_PROFILE });
  await refresh();
  render({ status: "filled", filledFields: [] });
  resultBox.className = "result ok";
  resultBox.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = "✓ 已载入示例画像（虚构的）";
  const p = document.createElement("p");
  p.textContent = "现在打开一个投递表单（例如 OfferPilot 网站的“示例表单”页），再点“填写当前页面”。";
  resultBox.append(h, p);
});

fillBtn.addEventListener("click", () => void runFill());

async function runFill() {
  const profile = await loadProfile();
  if (!profile) {
    render({ status: "failed", error: "还没有画像：请先在网站同步画像，或点“用示例画像试用”。" });
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url ?? "")) {
    render({ status: "failed", error: "当前页面不支持填写（浏览器内置页面或本地文件）。请打开公司的投递页后再试。" });
    return;
  }

  fillBtn.disabled = true;
  fillBtn.textContent = "填写中…";
  // 填表脚本跑完后会发回结果；10 秒没有回报就提示失败
  const outcome = await new Promise<FillOutcome>((resolve) => {
    const timer = setTimeout(() => {
      browser.runtime.onMessage.removeListener(onMsg);
      resolve({ status: "failed", error: "页面没有响应，请刷新页面后重试" });
    }, 10_000);
    const onMsg = (m: unknown) => {
      const msg = m as { type?: string; outcome?: FillOutcome };
      if (msg.type !== "offerpilot:result" || !msg.outcome) return;
      clearTimeout(timer);
      browser.runtime.onMessage.removeListener(onMsg);
      resolve(msg.outcome);
    };
    browser.runtime.onMessage.addListener(onMsg);
    browser.scripting
      .executeScript({ target: { tabId: tab.id! }, files: ["/content-scripts/content.js"] })
      .catch(() => {
        clearTimeout(timer);
        browser.runtime.onMessage.removeListener(onMsg);
        resolve({ status: "failed", error: "无法在当前页面运行（可能是受限页面）" });
      });
  });
  render(outcome);
  fillBtn.disabled = false;
  fillBtn.textContent = "填写当前页面";
}
