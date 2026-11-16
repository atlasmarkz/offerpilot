"use client";

import { ApplyRecord, type ApplyStatus } from "@offerpilot/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApplyOverview, type SyncState } from "../../components/ApplyOverview";
import { BoardDashboard } from "../../components/BoardDashboard";
import { TopBar } from "../../components/TopBar";
import { useRequireLogin, useSession } from "../../hooks/useSession";
import { UPLOAD_BATCH, type Application } from "../../lib/applications";
import { BOARD_LABEL, BOARD_STATUSES, type BoardItem, type BoardStatus } from "../../lib/board";
import { markExtensionApplicationsSynced, requestExtensionApplications } from "../../lib/extensionSync";

interface Draft {
  id?: string;
  company: string;
  title: string;
  url: string;
  note: string;
  applied_at: string;
}
const EMPTY: Draft = { company: "", title: "", url: "", note: "", applied_at: "" };

export default function BoardPage() {
  const session = useSession();
  const allowed = useRequireLogin(session);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState<BoardStatus>();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/board");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "读取失败");
      setItems(data.items);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  const [apps, setApps] = useState<Application[]>([]);
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });

  const loadApps = useCallback(async () => {
    const res = await fetch("/api/me/applications");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "读取平台投递记录失败");
    setApps(data.items);
  }, []);

  /** 把扩展本机记录的平台投递（只要上次之后的新记录）分批传到云端，再刷新列表。 */
  const syncFromExtension = useCallback(
    async (quiet: boolean) => {
      const account = session.user?.id;
      if (!account) return;
      setSync({ kind: "syncing" });
      try {
        const raw = await requestExtensionApplications(account);
        if (raw === null) {
          await loadApps();
          return setSync({ kind: "none", text: quiet ? "" : "没有检测到浏览器扩展" });
        }
        const items = raw.flatMap((r) => {
          const p = ApplyRecord.safeParse(r);
          return p.success ? [p.data] : [];
        });
        for (let i = 0; i < items.length; i += UPLOAD_BATCH) {
          const res = await fetch("/api/me/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items.slice(i, i + UPLOAD_BATCH) }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "同步失败");
        }
        if (items.length) markExtensionApplicationsSynced(account, items.map((x) => x.applied_at).sort().at(-1)!);
        await loadApps();
        setSync({ kind: "done", text: items.length ? `已同步 ${items.length} 条新记录` : quiet ? "" : "没有新记录" });
      } catch (e) {
        setSync({ kind: "error", text: (e as Error).message });
      }
    },
    [session.user?.id, loadApps],
  );

  const autoSynced = useRef(false);
  useEffect(() => {
    if (!allowed || !session.user) return;
    void load();
    if (!autoSynced.current) {
      autoSynced.current = true;
      void syncFromExtension(true);
    }
  }, [allowed, session.user, load, syncFromExtension]);

  async function setAppStatus(a: Application, status: ApplyStatus) {
    setApps((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x)));
    const { ok, data } = await call(`/api/me/applications/${a.id}`, "PATCH", { status });
    if (!ok) {
      setApps((l) => l.map((x) => (x.id === a.id ? a : x)));
      setError(String(data.error ?? "修改失败"));
    }
  }

  async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function move(item: BoardItem, status: BoardStatus) {
    if (item.status === status) return;
    // 先在界面上移动，失败再还原
    setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status } : x)));
    const { ok, data } = await call(`/api/me/board/${item.id}`, "PATCH", {
      status,
      ...(status === "applied" && !item.applied_at ? { applied_at: new Date().toISOString().slice(0, 10) } : {}),
    });
    if (!ok) {
      setItems((l) => l.map((x) => (x.id === item.id ? item : x)));
      setError(String(data.error ?? "移动失败"));
    } else {
      const updated = data.item as BoardItem;
      setItems((l) => l.map((x) => (x.id === item.id ? updated : x)));
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(undefined);
    const body = {
      company: draft.company,
      title: draft.title,
      url: draft.url,
      note: draft.note,
      applied_at: draft.applied_at || null,
    };
    const { ok, data } = draft.id
      ? await call(`/api/me/board/${draft.id}`, "PATCH", body)
      : await call("/api/me/board", "POST", body);
    setSaving(false);
    if (!ok) return setError(String(data.error ?? "保存失败"));
    const item = data.item as BoardItem;
    setItems((l) => (draft.id ? l.map((x) => (x.id === item.id ? item : x)) : [item, ...l]));
    setDraft(undefined);
  }

  async function remove(item: BoardItem) {
    if (!window.confirm(`删除「${item.title}」这条记录？`)) return;
    const { ok, data } = await call(`/api/me/board/${item.id}`, "DELETE");
    if (ok) setItems((l) => l.filter((x) => x.id !== item.id));
    else setError(String(data.error ?? "删除失败"));
  }

  if (!allowed) return <TopBar session={session} active="board" />;

  return (
    <>
      <TopBar session={session} active="board" />
      <main className="app" style={{ maxWidth: 1500 }}>
        <div className="list-head" style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>投递看板</h1>
          <span className="count">
            共 {items.length} 条{session.usage.limits ? `（上限 ${session.usage.limits.boardItems}）` : ""}
          </span>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setDraft({ ...EMPTY })}>
            ＋ 添加投递
          </button>
        </div>
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        {!loaded ? (
          <div className="skeleton">
            <div />
            <div />
          </div>
        ) : (
          <>
            <ApplyOverview board={items} apps={apps} sync={sync} onSync={() => void syncFromExtension(false)} onStatus={(a, s) => void setAppStatus(a, s)} />
            <div className="list-head" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>官网投递</h2>
            </div>
            <BoardDashboard items={items} usage={session.usage} />
            <div className="list-head" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>全部投递</h2>
              <span className="count drag-hint">拖动卡片可更改状态</span>
              <span className="count drag-hint-touch">用卡片上的下拉框更改状态</span>
            </div>
            {items.length === 0 && !error && (
              <p className="dash-empty">还没有投递记录。在岗位详情里点“加入投递看板”，或点右上角“添加投递”手动记录。</p>
            )}
          <div className="board-cols">
            {BOARD_STATUSES.map((st) => {
              const col = items.filter((x) => x.status === st);
              return (
                <section
                  key={st}
                  className={`board-col${over === st ? " over" : ""}${col.length ? "" : " empty"}`}
                  aria-label={BOARD_LABEL[st]}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(st);
                  }}
                  onDragLeave={() => setOver(undefined)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(undefined);
                    const item = items.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                    if (item) void move(item, st);
                  }}
                >
                  <h3>
                    {BOARD_LABEL[st]} <span>{col.length}</span>
                  </h3>
                  {col.map((it) => (
                    <article key={it.id} className="board-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}>
                      <b>{it.title}</b>
                      <div className="m">
                        {[it.company, it.applied_at && `投递于 ${it.applied_at}`].filter(Boolean).join(" · ")}
                      </div>
                      {it.note && <div className="note">{it.note}</div>}
                      <div className="acts">
                        <select aria-label="移动到" value={it.status} onChange={(e) => void move(it, e.target.value as BoardStatus)}>
                          {BOARD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {BOARD_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {it.url && (
                          <a className="link-btn" href={it.url} target="_blank" rel="noreferrer">
                            投递页 ↗
                          </a>
                        )}
                        <button
                          className="link-btn"
                          onClick={() =>
                            setDraft({ id: it.id, company: it.company, title: it.title, url: it.url, note: it.note, applied_at: it.applied_at ?? "" })
                          }
                        >
                          编辑
                        </button>
                        <button className="link-btn" onClick={() => void remove(it)}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
          </>
        )}
      </main>

      {draft && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDraft(undefined)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={draft.id ? "编辑投递" : "添加投递"}>
            <button className="link-btn modal-close" onClick={() => setDraft(undefined)} aria-label="关闭">
              ✕
            </button>
            <h2>{draft.id ? "编辑投递" : "添加投递"}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <label className="field">
                <span className="lbl">岗位名称 *</span>
                <input className="input" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label className="field">
                <span className="lbl">公司</span>
                <input className="input" value={draft.company} maxLength={80} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </label>
              <label className="field">
                <span className="lbl">投递链接</span>
                <input className="input" placeholder="https://…" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </label>
              <label className="field">
                <span className="lbl">投递日期</span>
                <input className="input" type="date" value={draft.applied_at} onChange={(e) => setDraft({ ...draft, applied_at: e.target.value })} />
              </label>
              <label className="field">
                <span className="lbl">备注（笔试时间、面试反馈等）</span>
                <textarea className="input" rows={4} maxLength={2000} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>
              <button className="btn block" onClick={() => void save()} disabled={saving || !draft.title.trim()}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
