"use client";

import type { PlanId } from "@offerpilot/shared";
import { useCallback, useEffect, useState } from "react";

export interface AccountUser {
  id: string;
  email: string;
}

export interface UsageInfo {
  billing: boolean;
  plan?: PlanId;
  limits?: { attachments: number; boardItems: number; resumes: number };
  quota?: number;
  used?: number;
  remaining?: number;
  periodEnd?: string | null;
  credits?: number;
}

/** 登录状态 + 额度。多个页面共用，登录/退出/删除账号都在这里。 */
export function useSession() {
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [usage, setUsage] = useState<UsageInfo>({ billing: false });

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/me/usage");
      if (res.ok) setUsage((await res.json()) as UsageInfo);
    } catch {
      /* 额度读不到不影响使用 */
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { enabled: boolean; user: AccountUser | null }) => {
        setEnabled(d.enabled);
        setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (user) void refreshUsage();
    else setUsage({ billing: false });
  }, [user, refreshUsage]);

  const post = (url: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

  return {
    enabled,
    checked,
    user,
    usage,
    refreshUsage,
    signedIn: (u: AccountUser) => setUser(u),
    signedOut: () => setUser(null),
    logout: async () => {
      await post("/api/auth/logout").catch(() => {});
      setUser(null);
    },
    deleteAccount: async (): Promise<boolean> => {
      const res = await post("/api/me/delete").catch(() => undefined);
      if (res?.ok) setUser(null);
      return !!res?.ok;
    },
  };
}

/**
 * 需要登录的页面用它：账号功能开着而当前没登录，就回到产品首页并弹出登录框。
 * 本地/自托管没有账号体系（enabled 为 false）时不拦。
 */
export function useRequireLogin(session: ReturnType<typeof useSession>): boolean {
  const blocked = session.checked && session.enabled && !session.user;
  useEffect(() => {
    if (blocked) window.location.replace("/?login=1");
  }, [blocked]);
  return session.checked && !blocked;
}
