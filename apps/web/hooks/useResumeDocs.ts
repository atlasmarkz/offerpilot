"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postResumesToExtension } from "../lib/extensionSync";
import { normalizeResume, type ResumeData } from "../lib/resumeData";
import { isBlankResume } from "../lib/resumeLocal";
import { load, save } from "../lib/storage";
import type { SyncStatus } from "./useCloudSync";
import type { AccountUser } from "./useSession";

export interface ResumeDoc {
  id: string;
  name: string;
  data: ResumeData;
}

const ACTIVE_KEY = "offerpilot.resume.active.v1";
const SAVE_DELAY = 1200;

interface Args {
  user: AccountUser | null;
  /** 本机旧版的那一份简历：云端还没有任何简历时拿它建第一份 */
  legacy: ResumeData;
  /** 本地数据读完之后才开始 */
  ready: boolean;
  onSignedOut: () => void;
}

type Reply<T> = { ok: boolean; status: number; data: T & { error?: string; code?: string } };

async function call<T = Record<string, never>>(url: string, init?: RequestInit): Promise<Reply<T>> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Reply<T>["data"] };
}

/**
 * 在线简历（可多份）的云端读写：登录后自动加载；编辑后延迟自动保存当前这一份；
 * 新建、改名、删除立即生效。份数上限由服务端按会员等级决定，这里只负责显示和提示。
 */
export function useResumeDocs({ user, legacy, ready, onSignedOut }: Args) {
  const [docs, setDocs] = useState<ResumeDoc[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [max, setMax] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string>();
  const dirty = useRef(new Set<string>());
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const flush = useCallback(
    async (id: string): Promise<void> => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc || !dirty.current.has(id)) return;
      dirty.current.delete(id);
      setStatus("saving");
      try {
        const r = await call(`/api/me/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ resume: doc.data }) });
        if (r.status === 401) return onSignedOut();
        setStatus(r.ok ? "saved" : "error");
        if (!r.ok) {
          dirty.current.add(id);
          setError(r.data.error);
        }
      } catch {
        dirty.current.add(id);
        setStatus("error");
      }
    },
    [onSignedOut],
  );

  useEffect(() => {
    if (!user) {
      setLoaded(false);
      setDocs([]);
      setStatus("idle");
      return;
    }
    if (!ready || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await call<{ items: ResumeDoc[]; max: number }>("/api/me/resumes");
        if (r.status === 401) return onSignedOut();
        if (!r.ok) {
          setStatus("error");
          setError(r.data.error);
          return;
        }
        let items = r.data.items.map((d) => ({ ...d, data: normalizeResume(d.data) }));
        if (items.length === 0) {
          // 第一次用：拿本机旧版的简历（没有就空白）建第一份
          const c = await call<{ item: ResumeDoc }>("/api/me/resumes", {
            method: "POST",
            body: JSON.stringify({ name: "我的简历", ...(isBlankResume(legacy) ? {} : { resume: legacy }) }),
          });
          if (c.ok) items = [{ ...c.data.item, data: normalizeResume(c.data.item.data) }];
        }
        if (cancelled) return;
        const wanted = load<string>(ACTIVE_KEY, "");
        setDocs(items);
        setActiveId(items.find((d) => d.id === wanted)?.id ?? items[0]?.id);
        setMax(r.data.max);
        setLoaded(true);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, ready, loaded, legacy, onSignedOut]);

  useEffect(() => {
    if (activeId) save(ACTIVE_KEY, activeId);
  }, [activeId]);

  // 已装扩展时顺带更新它手里的简历，不用再去岗位页点同步
  useEffect(() => {
    if (loaded) postResumesToExtension(docs, activeId);
  }, [docs, activeId, loaded]);

  // 编辑后延迟保存当前这一份
  useEffect(() => {
    if (!loaded || !activeId || !dirty.current.has(activeId)) return;
    const t = setTimeout(() => void flush(activeId), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [docs, activeId, loaded, flush]);

  const active = docs.find((d) => d.id === activeId);

  const edit = useCallback(
    (next: ResumeData | ((r: ResumeData) => ResumeData)) => {
      if (!activeId) return;
      dirty.current.add(activeId);
      setDocs((all) => all.map((d) => (d.id === activeId ? { ...d, data: typeof next === "function" ? next(d.data) : next } : d)));
    },
    [activeId],
  );

  const select = useCallback(
    async (id: string) => {
      if (activeId) await flush(activeId);
      setActiveId(id);
      setError(undefined);
    },
    [activeId, flush],
  );

  const create = useCallback(
    async (name: string): Promise<boolean> => {
      setError(undefined);
      if (activeId) await flush(activeId);
      const r = await call<{ item: ResumeDoc }>("/api/me/resumes", { method: "POST", body: JSON.stringify({ name }) });
      if (!r.ok) {
        setError(r.data.error ?? "新建失败");
        return false;
      }
      const item = { ...r.data.item, data: normalizeResume(r.data.item.data) };
      setDocs((all) => [...all, item]);
      setActiveId(item.id);
      return true;
    },
    [activeId, flush],
  );

  const rename = useCallback(async (id: string, name: string) => {
    setError(undefined);
    const r = await call<{ item: ResumeDoc }>(`/api/me/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!r.ok) return setError(r.data.error ?? "改名失败");
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, name: r.data.item.name } : d)));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError(undefined);
      const r = await call(`/api/me/resumes/${id}`, { method: "DELETE" });
      if (!r.ok) return setError(r.data.error ?? "删除失败");
      dirty.current.delete(id);
      const rest = docsRef.current.filter((d) => d.id !== id);
      setDocs(rest);
      if (id === activeId) setActiveId(rest[0]?.id);
    },
    [activeId],
  );

  return { docs, active, activeId, max, loaded, status, error, edit, select, create, rename, remove };
}
