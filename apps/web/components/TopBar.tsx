"use client";

import { useState, type ReactNode } from "react";
import type { SyncStatus } from "../hooks/useCloudSync";
import type { useSession } from "../hooks/useSession";
import { AccountMenu } from "./AccountMenu";
import { LoginDialog } from "./LoginDialog";

interface Props {
  session: ReturnType<typeof useSession>;
  active: "jobs" | "resume";
  status?: SyncStatus;
  /** 导航右侧的统计等内容 */
  children?: ReactNode;
}

/** 两个页面共用的顶栏：logo、导航、账号。登录弹窗也在这里，登录成功后各页面自动拿到登录状态。 */
export function TopBar({ session, active, status, children }: Props) {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <>
      <header className="topbar">
        <a className="logo" href="/" aria-label="OfferPilot 首页">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
            <img src="/logo.png" alt="OfferPilot" height={32} />
          </picture>
        </a>
        <nav className="nav" aria-label="主导航">
          <a href="/" aria-current={active === "jobs" ? "page" : undefined}>
            岗位
          </a>
          <a href="/resume" aria-current={active === "resume" ? "page" : undefined}>
            简历工作台
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
