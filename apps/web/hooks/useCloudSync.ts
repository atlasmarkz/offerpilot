"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isBlankForm, sanitizeForm, type Form } from "../lib/profileForm";
import type { AccountUser } from "./useSession";

export type SyncStatus = "idle" | "saving" | "saved" | "error";
interface Cloud {
  profile: Form;
  selected: string[];
}

const SAVE_DELAY = 1500;
const same = (a: Cloud, b: Cloud) => JSON.stringify(a) === JSON.stringify(b);

interface Args {
  user: AccountUser | null;
  form: Form;
  selected: string[];
  /** 本地数据读完之后才开始同步，避免拿空数据覆盖云端 */
  ready: boolean;
  apply: (c: Cloud) => void;
  /** 云端返回 401（登录失效）时通知外层 */
  onSignedOut: () => void;
}

/**
 * 画像和已选岗位的云端同步（登录状态由 useSession 管）。
 * 登录后：云端没数据就把本机的传上去；云端有数据而本机是空的就直接用云端；
 * 两边都有且不一样时交给用户选，绝不静默覆盖。之后每次改动延迟 1.5 秒自动保存。
 */
export function useCloudSync({ user, form, selected, ready, apply, onSignedOut }: Args) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<Cloud>();
  const [active, setActive] = useState(false);
  const latest = useRef<Cloud>({ profile: form, selected });
  latest.current = { profile: form, selected };

  const put = useCallback(
    async (c: Cloud): Promise<boolean> => {
      setStatus("saving");
      try {
        const res = await fetch("/api/me/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: c.profile, selected: c.selected }),
        });
        if (res.status === 401) {
          onSignedOut();
          setStatus("idle");
          return false;
        }
        setStatus(res.ok ? "saved" : "error");
        return res.ok;
      } catch {
        setStatus("error");
        return false;
      }
    },
    [onSignedOut],
  );

  // 退出登录后重置
  useEffect(() => {
    if (!user) {
      setActive(false);
      setConflict(undefined);
      setStatus("idle");
    }
  }, [user]);

  // 本地数据就绪且已登录：对账
  useEffect(() => {
    if (!ready || !user || active || conflict) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/data");
        if (res.status === 401) return onSignedOut();
        if (!res.ok) return setStatus("error");
        const { data } = (await res.json()) as { data: { profile: unknown; selected: unknown } | null };
        if (cancelled) return;
        const local = latest.current;
        const localBlank = isBlankForm(local.profile) && local.selected.length === 0;
        if (!data) {
          if (!localBlank) await put(local);
          setActive(true);
          return;
        }
        const cloud: Cloud = {
          // 姓名只存本机，云端没有：对账时沿用本机的，不然每次都会被当成“有差异”
          profile: { ...sanitizeForm(data.profile), name: local.profile.name },
          selected: Array.isArray(data.selected) ? data.selected.filter((x): x is string => typeof x === "string") : [],
        };
        if (same(cloud, local)) setActive(true);
        else if (localBlank) {
          apply(cloud);
          setActive(true);
        } else setConflict(cloud);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, active, conflict, apply, put, onSignedOut]);

  // 已对账：改动后延迟保存
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void put({ profile: form, selected }), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [form, selected, active, put]);

  const resolveConflict = useCallback(
    async (choice: "cloud" | "local") => {
      if (!conflict) return;
      if (choice === "cloud") apply(conflict);
      else await put(latest.current);
      setConflict(undefined);
      setActive(true);
    },
    [conflict, apply, put],
  );

  return { status, conflict: !!conflict, resolveConflict };
}
