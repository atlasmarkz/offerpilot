import { Profile } from "@offerpilot/shared";
import type { FillOutcome } from "../../adapters/types";

const result = document.getElementById("result")!;
const who = document.getElementById("who")!;
const fillBtn = document.getElementById("fill") as HTMLButtonElement;

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

void loadProfile().then((p) => {
  who.textContent = p ? `当前画像：${p.school} · ${p.major}` : "还没有画像：请先在 OfferPilot 网页端点“同步到浏览器扩展”。";
});

fillBtn.addEventListener("click", async () => {
  const profile = await loadProfile();
  if (!profile) {
    result.textContent = "还没有画像，请先在 OfferPilot 网页端填写画像并点“同步到浏览器扩展”。";
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
