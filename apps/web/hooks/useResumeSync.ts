"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isBlankResume } from "../lib/resumeLocal";
import { normalizeResume, type ResumeData } from "../lib/resumeData";
import type { SyncStatus } from "./useCloudSync";
import type { AccountUser } from "./useSession";

const SAVE_DELAY = 1500;
const same = (a: ResumeData, b: ResumeData) => JSON.stringify(a) === JSON.stringify(b);

interface Args {
  user: AccountUser | null;
  resume: ResumeData;
  /** 本地数据读完之后才开始同步 */
  ready: boolean;
  apply: (r: ResumeData) => void;
  onSignedOut: () => void;
}

/**
 * 在线简历的云端保存：登录后自动保存，云端永远只有【最新一份】（整份覆盖）。
 * 云端和本机都有且不一样时让用户选，不静默覆盖。
 */
export function useResumeSync({ user, resume, ready, apply, onSignedOut }: Args) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<ResumeData>();
  const [active, setActive] = useState(false);
  const latest = useRef(resume);
  latest.current = resume;

  const put = useCallback(
    async (r: ResumeData): Promise<boolean> => {
      setStatus("saving");
      try {
        const res = await fetch("/api/me/resume", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume: r }),
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

  useEffect(() => {
    if (!user) {
      setActive(false);
      setConflict(undefined);
      setStatus("idle");
    }
  }, [user]);

  useEffect(() => {
    if (!ready || !user || active || conflict) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/resume");
        if (res.status === 401) return onSignedOut();
        if (!res.ok) return setStatus("error");
        const { resume: raw } = (await res.json()) as { resume: unknown | null };
        if (cancelled) return;
        const local = latest.current;
        if (!raw) {
          if (!isBlankResume(local)) await put(local);
          setActive(true);
          return;
        }
        const cloud = normalizeResume(raw);
        if (same(cloud, local)) setActive(true);
        else if (isBlankResume(local)) {
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

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void put(resume), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [resume, active, put]);

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
