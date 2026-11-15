import { Profile, renderGreeting, type BoardJob } from "@offerpilot/shared";
import { pickResume } from "../adapters/resumePick";
import { appendLog, appliedKeys, readLog, toRecord } from "../jobboards/applyLog";
import { boardFor } from "../jobboards";
import { describeStop, runAutoApply, type RunnerEvent } from "../jobboards/runner";
import { bumpToday, countToday, pickDelay, readSettings, type RunState } from "../jobboards/settings";

/**
 * 招聘平台自动投递的执行脚本。
 * 不在安装时注入任何网站：用户在“自动投递”页开启某个平台、授予该平台的网站权限后，
 * 才由扩展用 scripting.registerContentScripts 注册到该平台的页面上。
 * 只有运行状态是“运行中”时才会动作；标签页关掉就停。
 */
export default defineContentScript({
  registration: "runtime",
  matches: ["https://www.zhipin.com/*"],
  async main() {
    const adapter = boardFor(location.href);
    if (!adapter) return;

    let running = false;
    let stopRequested = false;
    let tabId = sessionStorage.getItem("offerpilot-runner") ?? "";
    if (!tabId) {
      tabId = crypto.randomUUID();
      sessionStorage.setItem("offerpilot-runner", tabId);
    }

    const setState = async (patch: Partial<RunState>) => {
      const { runState } = await browser.storage.local.get("runState");
      await browser.storage.local.set({ runState: { ...(runState as RunState), ...patch, updatedAt: new Date().toISOString() } });
    };

    const pushEvent = async (line: string) => {
      const { autoApplyEvents } = await browser.storage.local.get("autoApplyEvents");
      const list = Array.isArray(autoApplyEvents) ? (autoApplyEvents as { at: string; text: string }[]) : [];
      list.unshift({ at: new Date().toISOString(), text: line });
      await browser.storage.local.set({ autoApplyEvents: list.slice(0, 60) });
      await setState({ last: line });
    };

    const describe = (e: RunnerEvent): string => {
      const name = (j: BoardJob) => `${j.company ? `${j.company} · ` : ""}${j.title}`;
      switch (e.kind) {
        case "sent":
          return `✓ 已投递 ${name(e.job)}（今日第 ${e.count} 个）`;
        case "would":
          return `◎ 试运行：会投递 ${name(e.job)}${e.job.salary ? `（${e.job.salary}）` : ""}`;
        case "skip":
          return `跳过 ${name(e.job)}：${e.reasons.join("、")}`;
        case "already":
          return `之前沟通过，跳过 ${name(e.job)}`;
        case "failed":
          return `✕ ${name(e.job)}：${e.text}`;
        case "wait":
          return `等待 ${Math.round(e.ms / 1000)} 秒再投下一个`;
        case "page":
          return "加载下一页职位";
      }
    };

    async function start() {
      if (running) return;
      const store = await browser.storage.local.get(["autoApplySettings", "runState", "applyLog", "profile", "resumes", "resumeId", "resume"]);
      const settings = readSettings(store.autoApplySettings);
      const state = store.runState as RunState | undefined;
      if (!state?.running || state.channel !== adapter!.channel || !settings.consent || !settings.channels[adapter!.channel]) return;
      // 同一平台开了多个标签页时只让一个跑：认领 owner（标签页刷新后 sessionStorage 里的 id 不变，可以接着跑）
      const fresh = state.updatedAt && Date.now() - Date.parse(state.updatedAt) < 3 * 60_000;
      if (state.owner && state.owner !== tabId && fresh) return;
      await setState({ owner: tabId });
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      if (((await browser.storage.local.get("runState")).runState as RunState | undefined)?.owner !== tabId) return;

      running = true;
      stopRequested = false;
      const profile = Profile.safeParse(store.profile);
      const resume = pickResume(store)?.data;
      const vars = {
        学校: profile.success ? profile.data.school : undefined,
        专业: profile.success ? profile.data.major : undefined,
        届别: profile.success ? String(profile.data.graduationYear % 100).padStart(2, "0") : undefined,
        技能: resume?.skills.slice(0, 4).join("、") || undefined,
      };
      let log = readLog(store.applyLog);

      await pushEvent(settings.dryRun ? "开始试运行：只筛选，不打招呼" : "开始自动投递");
      const reason = await runAutoApply({
        adapter: adapter!,
        doc: document,
        rules: settings.rules,
        dailyCap: settings.dailyCap,
        applied: appliedKeys(log),
        todayCount: async () => countToday((await browser.storage.local.get("autoApplyDaily")).autoApplyDaily, adapter!.channel),
        record: async (job) => {
          const rec = toRecord(job);
          if (rec) {
            log = appendLog(log, rec);
            await browser.storage.local.set({ applyLog: log });
          }
          const { autoApplyDaily } = await browser.storage.local.get("autoApplyDaily");
          await browser.storage.local.set({ autoApplyDaily: bumpToday(autoApplyDaily, adapter!.channel) });
        },
        greeting: (job) => (settings.greeting.trim() ? renderGreeting(settings.greeting, { ...vars, 公司: job.company, 岗位: job.title }) : ""),
        delay: () => pickDelay(settings),
        dryRun: settings.dryRun,
        dryDelay: () => pickDelay({ minIntervalSec: 3, maxIntervalSec: 6 }),
        // 分段睡，用户点停止时 1 秒内就能停下
        sleep: async (ms) => {
          const end = Date.now() + ms;
          while (Date.now() < end && !stopRequested) await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
        },
        shouldStop: () => stopRequested,
        report: (e) => void pushEvent(describe(e)),
      }).catch((e: Error) => ({ kind: "failures" as const, text: e.message }));

      running = false;
      const text = describeStop(reason);
      await pushEvent(`已停止：${text}`);
      await setState({ running: false, stopped: text, owner: undefined });
    }

    browser.storage.onChanged.addListener((changes) => {
      const next = changes.runState?.newValue as RunState | undefined;
      if (!changes.runState) return;
      if (!next?.running) stopRequested = true;
      else if (!running) void start();
    });

    void start();
  },
});
