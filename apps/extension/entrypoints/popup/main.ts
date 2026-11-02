import { Profile } from "@offerpilot/shared";
import type { FillOutcome } from "../../adapters/types";

const result = document.getElementById("result")!;
const who = document.getElementById("who")!;

async function loadProfile(): Promise<Profile | null> {
  const { profile } = await browser.storage.local.get("profile");
  const parsed = Profile.safeParse(profile);
  return parsed.success ? parsed.data : null;
}

function describe(o: FillOutcome): string {
  switch (o.status) {
    case "filled":
      return `已填写：${o.filledFields.join("、") || "（无）"}\n请检查后自己点提交。`;
    case "needs_user":
      return `已填写：${o.filledFields.join("、") || "（无）"}\n需要你处理：${o.reason}`;
    case "failed":
      return `没有填写：${o.error}`;
  }
}

void loadProfile().then((p) => {
  who.textContent = p ? `当前画像：${p.school} · ${p.major}` : "还没有画像，请先在网页端点“同步到扩展”。";
});

document.getElementById("fill")!.addEventListener("click", async () => {
  const profile = await loadProfile();
  if (!profile) {
    result.textContent = "还没有画像，请先在 OfferPilot 网页端填写画像并点“同步到扩展”。";
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const outcome = (await browser.tabs.sendMessage(tab.id, { type: "offerpilot:fill", profile })) as FillOutcome;
    result.textContent = describe(outcome);
  } catch {
    result.textContent = "当前页面无法填写（浏览器内置页面，或刷新页面后再试）。";
  }
});
