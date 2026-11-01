import { Profile } from "@offerpilot/shared";

const result = document.getElementById("result")!;

// 占位：后续从 Web 端同步，现在读本地存储里的画像。
async function loadProfile(): Promise<Profile | null> {
  const { profile } = await browser.storage.local.get("profile");
  const parsed = Profile.safeParse(profile);
  return parsed.success ? parsed.data : null;
}

document.getElementById("fill")!.addEventListener("click", async () => {
  const profile = await loadProfile();
  if (!profile) {
    result.textContent = "还没有画像，请先在 OfferPilot 网页端导入简历。";
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const outcome = await browser.tabs.sendMessage(tab.id, { type: "offerpilot:fill", profile });
  result.textContent = JSON.stringify(outcome, null, 2);
});
