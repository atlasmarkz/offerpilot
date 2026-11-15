import { ScreenRules, type Channel } from "@offerpilot/shared";
import { BOARD_ORIGINS, DEFAULT_SEARCH } from "../../jobboards";
import { countToday, readSettings, type AutoApplySettings, type RunState } from "../../jobboards/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SITE = String(import.meta.env.WXT_WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
$<HTMLAnchorElement>("board").href = `${SITE}/board`;

const CHANNEL: Channel = "boss";
let readyCache = false;
const SCRIPT_ID = (c: Channel) => `autoapply-${c}`;

const list = (s: string) => s.split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 50);
const num = (id: string) => Number($<HTMLInputElement>(id).value) || 0;

async function load(): Promise<AutoApplySettings> {
  return readSettings((await browser.storage.local.get("autoApplySettings")).autoApplySettings);
}
async function save(s: AutoApplySettings) {
  await browser.storage.local.set({ autoApplySettings: s });
}

function fillForm(s: AutoApplySettings) {
  $<HTMLInputElement>("consent").checked = s.consent;
  $<HTMLInputElement>("searchUrl").value = s.searchUrls[CHANNEL];
  $<HTMLInputElement>("titleInclude").value = s.rules.titleInclude.join(", ");
  $<HTMLInputElement>("exclude").value = s.rules.exclude.join(", ");
  $<HTMLInputElement>("companyBlacklist").value = s.rules.companyBlacklist.join(", ");
  $<HTMLInputElement>("recruiterBlacklist").value = s.rules.recruiterBlacklist.join(", ");
  $<HTMLInputElement>("dryRun").checked = s.dryRun;
  $<HTMLInputElement>("cities").value = s.rules.cities.join(", ");
  $<HTMLInputElement>("monthlyMinK").value = String(s.rules.monthlyMinK);
  $<HTMLInputElement>("dailyMin").value = String(s.rules.dailyMin);
  $<HTMLInputElement>("skipInactiveHr").checked = s.rules.skipInactiveHr;
  $<HTMLInputElement>("skipOutsourcing").checked = s.rules.skipOutsourcing;
  $<HTMLInputElement>("dailyCap").value = String(s.dailyCap);
  $<HTMLInputElement>("minIntervalSec").value = String(s.minIntervalSec);
  $<HTMLInputElement>("maxIntervalSec").value = String(s.maxIntervalSec);
  $<HTMLTextAreaElement>("greeting").value = s.greeting;
}

function readForm(prev: AutoApplySettings): AutoApplySettings {
  const url = $<HTMLInputElement>("searchUrl").value.trim();
  return readSettings({
    ...prev,
    consent: $<HTMLInputElement>("consent").checked,
    dryRun: $<HTMLInputElement>("dryRun").checked,
    searchUrls: { ...prev.searchUrls, [CHANNEL]: /^https:\/\/www\.zhipin\.com\//.test(url) ? url : "" },
    rules: ScreenRules.parse({
      titleInclude: list($<HTMLInputElement>("titleInclude").value),
      exclude: list($<HTMLInputElement>("exclude").value),
      companyBlacklist: list($<HTMLInputElement>("companyBlacklist").value),
      recruiterBlacklist: list($<HTMLInputElement>("recruiterBlacklist").value),
      cities: list($<HTMLInputElement>("cities").value),
      monthlyMinK: Math.min(500, Math.max(0, num("monthlyMinK"))),
      dailyMin: Math.min(5000, Math.max(0, num("dailyMin"))),
      skipInactiveHr: $<HTMLInputElement>("skipInactiveHr").checked,
      skipOutsourcing: $<HTMLInputElement>("skipOutsourcing").checked,
    }),
    dailyCap: num("dailyCap"),
    minIntervalSec: num("minIntervalSec"),
    maxIntervalSec: num("maxIntervalSec"),
    greeting: $<HTMLTextAreaElement>("greeting").value,
  });
}

/** 平台是否真的可用：设置里开着、网站权限还在、执行脚本已注册。 */
async function platformReady(c: Channel): Promise<boolean> {
  const granted = await browser.permissions.contains({ origins: BOARD_ORIGINS[c] });
  const scripts = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID(c)] });
  return granted && scripts.length > 0;
}

async function enable(c: Channel): Promise<boolean> {
  // 必须在点击事件里直接调用，浏览器才会弹出授权
  const ok = await browser.permissions.request({ origins: BOARD_ORIGINS[c] });
  if (!ok) return false;
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID(c)] });
  if (!existing.length)
    await browser.scripting.registerContentScripts([
      { id: SCRIPT_ID(c), matches: BOARD_ORIGINS[c], js: ["content-scripts/boardrunner.js"], runAt: "document_idle", persistAcrossSessions: true },
    ]);
  return true;
}

async function disable(c: Channel) {
  await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID(c)] }).catch(() => {});
  await browser.permissions.remove({ origins: BOARD_ORIGINS[c] }).catch(() => false);
}

async function render() {
  const s = await load();
  const store = await browser.storage.local.get(["runState", "autoApplyDaily", "autoApplyEvents"]);
  const state = (store.runState ?? { running: false }) as RunState;
  const ready = s.channels[CHANNEL] && (await platformReady(CHANNEL));
  readyCache = ready;

  $("boss-st").textContent = ready ? "已开启 · 只在 www.zhipin.com 上运行" : "未开启";
  $("boss-toggle").textContent = ready ? "关闭" : "开启";

  const done = countToday(store.autoApplyDaily, CHANNEL);
  $("today").textContent = `${done} / ${s.dailyCap}`;
  $("today-bar").style.width = `${Math.min(100, (done / s.dailyCap) * 100)}%`;

  const running = state.running && state.channel === CHANNEL;
  $("start").hidden = running;
  $("start").textContent = s.dryRun ? "开始试运行（不打招呼）" : "开始自动投递";
  $("stop").hidden = !running;
  $<HTMLButtonElement>("start").disabled = !s.consent || !ready;
  $<HTMLButtonElement>("start").title = !s.consent ? "先勾选上面的风险提示" : !ready ? "先开启 Boss直聘" : "";
  const st = $("status");
  st.className = `status ${running ? "on" : state.stopped ? "off" : ""}`;
  st.textContent = running ? `运行中：${state.last ?? "正在打开 Boss直聘…"}（保持 Boss 标签页打开）` : state.stopped ? `已停止：${state.stopped}` : "未运行";

  const events = Array.isArray(store.autoApplyEvents) ? (store.autoApplyEvents as { at: string; text: string }[]) : [];
  $("events").replaceChildren(
    ...events.map((e) => {
      const li = document.createElement("li");
      if (e.text.startsWith("✓")) li.className = "sent";
      const t = document.createElement("time");
      t.textContent = new Date(e.at).toLocaleTimeString("zh-CN", { hour12: false });
      const span = document.createElement("span");
      span.textContent = e.text;
      li.append(t, span);
      return li;
    }),
  );
}

$<HTMLInputElement>("dryRun").addEventListener("change", async (e) => {
  const s = await load();
  await save({ ...s, dryRun: (e.target as HTMLInputElement).checked });
});

$<HTMLInputElement>("consent").addEventListener("change", async (e) => {
  const s = await load();
  const consent = (e.target as HTMLInputElement).checked;
  await save({ ...s, consent });
  if (!consent) await browser.storage.local.set({ runState: { running: false, stopped: "你取消了风险确认" } });
});

$("boss-toggle").addEventListener("click", async () => {
  // 用 render 时缓存的状态判断：permissions.request 必须在点击后立刻调用，前面不能有异步等待
  if (readyCache) {
    await browser.storage.local.set({ runState: { running: false, stopped: "你关闭了 Boss直聘" } });
    await disable(CHANNEL);
    const s = await load();
    await save({ ...s, channels: { ...s.channels, [CHANNEL]: false } });
  } else {
    const ok = await enable(CHANNEL).catch(() => false);
    const s = await load();
    await save({ ...s, channels: { ...s.channels, [CHANNEL]: ok } });
  }
  void render();
});

$("start").addEventListener("click", async () => {
  const s = readForm(await load());
  await save(s);
  await browser.storage.local.set({ runState: { running: true, channel: CHANNEL, last: "正在打开 Boss直聘…" } });
  // 已经开着的 Boss 标签页直接跳到搜索页（页面加载后执行脚本自动开始），没有就新开一个
  const url = s.searchUrls[CHANNEL] || DEFAULT_SEARCH[CHANNEL];
  const [tab] = await browser.tabs.query({ url: BOARD_ORIGINS[CHANNEL] });
  if (tab?.id) await browser.tabs.update(tab.id, { url, active: true });
  else await browser.tabs.create({ url });
});

$("stop").addEventListener("click", async () => {
  const { runState } = await browser.storage.local.get("runState");
  await browser.storage.local.set({ runState: { ...(runState as RunState), running: false, stopped: "你已手动停止" } });
});

$("settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = readForm(await load());
  await save(s);
  fillForm(s);
  $("saved").hidden = false;
  setTimeout(() => ($("saved").hidden = true), 2000);
  void render();
});

browser.storage.onChanged.addListener((c) => {
  if (c.runState || c.autoApplyDaily || c.autoApplyEvents || c.autoApplySettings) void render();
});

void load().then(fillForm);
void render();
