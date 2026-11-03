import { Profile } from "@offerpilot/shared";
import type { FillOutcome } from "../../adapters/types";

const result = document.getElementById("result")!;
const who = document.getElementById("who")!;
const fillBtn = document.getElementById("fill") as HTMLButtonElement;
const demoBtn = document.getElementById("demo") as HTMLButtonElement;
const demoNote = document.getElementById("demo-note")!;

/** 体验用的示例画像：明显是虚构的，不要拿去填真实的投递页。 */
const DEMO_PROFILE: Profile = {
  name: "张三（示例）",
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

function describe(o: FillOutcome): string {
  switch (o.status) {
    case "filled":
      return `已填写：${o.filledFields.join("、") || "（无）"}\n请检查后，自己点击提交。`;
    case "needs_user":
      return `已填写：${o.filledFields.join("、") || "（无）"}\n需要你处理：${o.reason}`;
    case "failed":
      return `没有填写：${o.error}`;
  }
}

async function refresh() {
  const p = await loadProfile();
  who.textContent = p ? `当前画像：${p.school} · ${p.major}` : "还没有画像：请先在 OfferPilot 网页端点“同步到浏览器扩展”。";
  // 没有画像时才提供示例入口，避免覆盖用户真实同步过来的画像
  demoBtn.hidden = !!p;
  demoNote.hidden = !!p;
}

void refresh();

demoBtn.addEventListener("click", async () => {
  await browser.storage.local.set({ profile: DEMO_PROFILE });
  result.textContent = "已载入示例画像（虚构的）。现在打开一个投递表单（例如 OfferPilot 网站的“示例表单”页），再点“填写当前页面”。";
  await refresh();
});

fillBtn.addEventListener("click", async () => {
  const profile = await loadProfile();
  if (!profile) {
    result.textContent = "还没有画像，请先在 OfferPilot 网页端同步，或点下面的“用示例画像试用”。";
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url ?? "")) {
    result.textContent = "当前页面不支持填写（浏览器内置页面或本地文件）。请打开公司的投递页后再试。";
    return;
  }

  fillBtn.disabled = true;
  result.textContent = "填写中…";
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
  result.textContent = describe(outcome);
  fillBtn.disabled = false;
});
