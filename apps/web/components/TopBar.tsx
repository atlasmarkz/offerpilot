"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SyncStatus } from "../hooks/useCloudSync";
import type { useSession } from "../hooks/useSession";
import { AccountMenu } from "./AccountMenu";
import { LoginDialog } from "./LoginDialog";
import { MOBILE_TITLE, MobileTabBar } from "./MobileTabBar";

interface Props {
  session: ReturnType<typeof useSession>;
  active: "jobs" | "resume" | "board" | "account";
  status?: SyncStatus;
  /** 导航右侧的统计等内容 */
  children?: ReactNode;
}

/** 两个页面共用的顶栏：logo、导航、账号。登录弹窗也在这里，登录成功后各页面自动拿到登录状态。 */
export function TopBar({ session, active, status, children }: Props) {
  const [showLogin, setShowLogin] = useState(false);
  // 手机上顶栏一开始是透明的，叠在页头的浅色渐变上；往下滚了才有底色和分隔线
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <>
      <header className="topbar" data-scrolled={scrolled ? "" : undefined}>
        <a className="logo" href="/app" aria-label="OfferPilot">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
            <img src="/logo.png" alt="OfferPilot" height={32} />
          </picture>
        </a>
        <nav className="nav" aria-label="主导航">
          <a href="/app" aria-current={active === "jobs" ? "page" : undefined}>
            岗位
          </a>
          <a href="/resume" aria-current={active === "resume" ? "page" : undefined}>
            简历工作台
          </a>
          <a href="/board" aria-current={active === "board" ? "page" : undefined}>
            投递看板
          </a>
        </nav>
        <span className="spacer" />
        {children}
        {session.enabled && (
          <AccountMenu
            user={session.user}
            status={status}
            usage={session.usage}
            onLogin={() => setShowLogin(true)}
            onLogout={() => void session.logout()}
            onDelete={session.deleteAccount}
          />
        )}
      </header>
      {/* 手机上：大标题 + 底部标签栏（岗位页和看板页有自己的页头） */}
      {(active === "resume" || active === "account") && <h1 className="m-title">{MOBILE_TITLE[active]}</h1>}
      <MobileTabBar active={active} account={session.enabled} />
      {showLogin && (
        <LoginDialog
          onClose={() => setShowLogin(false)}
          onSuccess={(u) => {
            session.signedIn(u);
            setShowLogin(false);
          }}
        />
      )}
    </>
  );
}
