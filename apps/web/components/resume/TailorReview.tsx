"use client";

import { useState } from "react";
import { applyTailor, defaultAccepted, type TailorPlan } from "../../lib/tailor";
import type { ResumeData } from "../../lib/resumeData";

interface Props {
  plan: TailorPlan;
  resume: ResumeData;
  jobTitle: string;
  note?: string;
  /** 另存为新简历；不能新建（未登录 / 份数已满）时为 undefined，并给出原因 */
  onSaveAs?: (data: ResumeData, name: string) => Promise<boolean>;
  saveAsBlocked?: string;
  onApply: (data: ResumeData) => void;
}

/**
 * 岗位定制简历的审阅：每处改动并排显示“原来 / 改后”，逐条勾选采用。
 * 找不到出处的改写（可能编造）默认不勾，并标出可疑内容。
 */
export function TailorReview({ plan, resume, jobTitle, note, onSaveAs, saveAsBlocked, onApply }: Props) {
  const [accepted, setAccepted] = useState<Set<string>>(() => defaultAccepted(plan));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();
  const toggle = (id: string) =>
    setAccepted((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const result = () => applyTailor(resume, plan, accepted);
  const name = `定制：${jobTitle}`.slice(0, 40);

  return (
    <div className="tailor" aria-label="定制方案">
      <div className="sec-title">定制方案（{plan.changes.length} 处改动，已勾选 {accepted.size} 处）</div>
      {plan.flags.length > 0 && (
        <p className="fit-flag" role="note">
          岗位描述安全检查：{plan.flags.join("；")}
        </p>
      )}
      {plan.notes.length > 0 && (
        <ul className="fit-bullets" style={{ marginBottom: 8 }}>
          {plan.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <ul className="tailor-list">
        {plan.changes.map((c) => (
          <li key={c.id} className={c.unverified.length ? "suspect" : undefined}>
            <label className="tailor-head">
              <input type="checkbox" checked={accepted.has(c.id)} onChange={() => toggle(c.id)} />
              <b>{c.label}</b>
            </label>
            {c.unverified.length > 0 && (
              <p className="sug-unverified" role="note">
                ⚠ 改后出现了你简历里没有的：<b>{c.unverified.join("、")}</b>。不是真实经历就别采用；确实是真的，先补进原简历再采用。
              </p>
            )}
            <div className="tailor-diff">
              <div>
                <span className="lbl">原来</span>
                {c.before.length ? (
                  <ol>{c.before.map((b, i) => <li key={i}>{b}</li>)}</ol>
                ) : (
                  <p className="empty">（空）</p>
                )}
              </div>
              <div>
                <span className="lbl">改后</span>
                <ol>{c.after.map((b, i) => <li key={i}>{b}</li>)}</ol>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        {onSaveAs && (
          <button
            className="btn sm"
            disabled={busy || accepted.size === 0}
            onClick={async () => {
              setBusy(true);
              const ok = await onSaveAs(result(), name);
              setBusy(false);
              if (ok) setDone(`已另存为「${name}」，并切换到这份简历。原简历没有改动。`);
            }}
          >
            {busy ? "保存中…" : "另存为新简历"}
          </button>
        )}
        <button
          className={`btn sm${onSaveAs ? " ghost" : ""}`}
          disabled={accepted.size === 0}
          onClick={() => {
            if (!window.confirm("把勾选的改动直接应用到当前这份简历？原来的内容会被覆盖，建议先导出一份 PDF 备份。")) return;
            onApply(result());
            setDone("已应用到当前简历。");
          }}
        >
          应用到当前简历
        </button>
        {!onSaveAs && saveAsBlocked && (
          <span className="msg" style={{ margin: 0, color: "var(--faint)" }}>
            {saveAsBlocked}
          </span>
        )}
      </div>
      {done && (
        <p className="msg ok" role="status">
          {done}
        </p>
      )}
      <p className="msg" style={{ color: "var(--faint)" }}>
        只改了经历顺序、要点措辞、技能顺序和自我评价；学校、公司、时间、职位名都保持原样。{note ? ` ${note}` : ""}
      </p>
    </div>
  );
}
