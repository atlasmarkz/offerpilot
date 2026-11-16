/**
 * 手机上的底部标签栏（参照 iOS 的 Tab Bar）：拇指够得着，切换页面不用回到顶部。
 * 只在窄屏显示（见 globals.css 的 .tabbar），宽屏仍用顶栏导航。
 */
type Tab = "jobs" | "resume" | "board" | "account";

const ICONS: Record<Tab, JSX.Element> = {
  jobs: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
    </>
  ),
  resume: (
    <>
      <path d="M7 3h7l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-10A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3Z" />
      <path d="M14 3v5h5M9.5 13h5M9.5 16.5h5" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
};

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: "jobs", href: "/app", label: "岗位" },
  { id: "resume", href: "/resume", label: "简历" },
  { id: "board", href: "/board", label: "看板" },
  { id: "account", href: "/account", label: "我的" },
];

export function MobileTabBar({ active, account }: { active: Tab; account: boolean }) {
  return (
    <nav className="tabbar" aria-label="底部导航">
      {TABS.filter((t) => account || t.id !== "account").map((t) => (
        <a key={t.id} href={t.href} aria-current={active === t.id ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[t.id]}
          </svg>
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  );
}

/** 手机上每页顶部的大标题（iOS Large Title） */
export const MOBILE_TITLE: Record<Tab, string> = { jobs: "岗位", resume: "简历", board: "投递看板", account: "我的" };
