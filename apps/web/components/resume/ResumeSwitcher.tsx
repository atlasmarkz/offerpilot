"use client";

import { useState } from "react";
import type { ResumeDoc } from "../../hooks/useResumeDocs";

interface Props {
  docs: ResumeDoc[];
  activeId?: string;
  max: number;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

/** 多份简历的切换条：免费版最多 1 份，付费版最多 3 份；扩展里也可以选用哪一份填表。 */
export function ResumeSwitcher({ docs, activeId, max, onSelect, onCreate, onRename, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const atLimit = docs.length >= max;
  const active = docs.find((d) => d.id === activeId);

  async function add() {
    if (atLimit || busy) return;
    const name = window.prompt("给新简历起个名字（如：后端开发 / 产品经理）", `简历 ${docs.length + 1}`);
    if (!name?.trim()) return;
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
  }

  return (
    <section className="panel no-print resume-switcher" aria-label="我的简历">
      <div className="rs-tabs" role="tablist">
        {docs.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === activeId} className={`rs-tab${d.id === activeId ? " on" : ""}`} onClick={() => onSelect(d.id)}>
            {d.name}
          </button>
        ))}
        <button className="rs-add" onClick={() => void add()} disabled={atLimit || busy} title={atLimit ? `已达上限（${max} 份）` : "新建一份简历"}>
          ＋ 新建
        </button>
      </div>
      <div className="rs-meta">
        <span>
          {docs.length}/{max} 份
          {atLimit && max <= 1 && <> · 升级会员可建 3 份，并在扩展里选择用哪份填表</>}
          {docs.length > 1 && <> · 在浏览器扩展里可选择用哪一份填表</>}
        </span>
        {active && (
          <span className="rs-actions">
            <button
              className="link-btn"
              onClick={() => {
                const n = window.prompt("重命名", active.name);
                if (n?.trim() && n.trim() !== active.name) onRename(active.id, n.trim());
              }}
            >
              重命名
            </button>
            {docs.length > 1 && (
              <button
                className="link-btn"
                onClick={() => {
                  if (window.confirm(`删除“${active.name}”？删除后无法恢复。`)) onRemove(active.id);
                }}
              >
                删除
              </button>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
