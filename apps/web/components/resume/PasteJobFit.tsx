"use client";

import { useEffect, useState } from "react";
import type { FitResult } from "../../lib/fit";
import type { ResumeData } from "../../lib/resumeData";
import type { TailorPlan } from "../../lib/tailor";
import { FitResultView } from "../FitPanel";
import { TailorReview } from "./TailorReview";

interface Props {
  /** 已勾选同意把简历发给大模型 */
  consent: boolean;
  blank: boolean;
  costHint: string;
  evaluate: (job: { title: string; company: string; description: string }) => Promise<{ fit: FitResult; note?: string } | string>;
  /** 岗位定制简历：返回改动方案，或错误文字 */
  tailor: (job: { title: string; company: string; description: string }, focus: string[]) => Promise<{ plan: TailorPlan; note?: string } | string>;
  resume: ResumeData;
  onSaveAs?: (data: ResumeData, name: string) => Promise<boolean>;
  saveAsBlocked?: string;
  onApply: (data: ResumeData) => void;
  /** 从岗位页带着岗位跳过来时调用（页面据此展开 AI 工具） */
  onHandoff?: () => void;
}

/** 岗位页把岗位交给“投递资料”页去定制时用的 sessionStorage 键。 */
export const TAILOR_HANDOFF_KEY = "offerpilot.tailor.job";

/**
 * 粘贴一个岗位来评估（借鉴 career-ops 的“贴一个岗位，先看值不值得投”）：
 * Boss直聘、实习网站、公众号里的岗位不在岗位库里，复制岗位名和描述过来就能和简历对照。
 */
export function PasteJobFit({ consent, blank, costHint, evaluate, tailor, resume, onSaveAs, saveAsBlocked, onApply, onHandoff }: Props) {
  const [tailoring, setTailoring] = useState(false);
  const [tailored, setTailored] = useState<{ plan?: TailorPlan; note?: string; error?: string; key: number }>();

  async function runTailor() {
    setTailoring(true);
    const r = await tailor({ title: title.trim(), company: company.trim(), description: description.trim() }, result?.fit?.focus ?? []);
    setTailored(typeof r === "string" ? { error: r, key: Date.now() } : { ...r, key: Date.now() });
    setTailoring(false);
  }
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ fit?: FitResult; note?: string; error?: string }>();

  // 从岗位页“去定制简历”跳过来时，岗位信息放在本标签页的 sessionStorage 里，读一次就删
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TAILOR_HANDOFF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(TAILOR_HANDOFF_KEY);
      const j = JSON.parse(raw) as { title?: string; company?: string; description?: string; fit?: FitResult };
      setTitle(String(j.title ?? "").slice(0, 120));
      setCompany(String(j.company ?? "").slice(0, 80));
      setDescription(String(j.description ?? "").slice(0, 8000));
      if (j.fit) setResult({ fit: j.fit });
      setOpen(true);
      onHandoff?.();
    } catch {
      /* 没有或坏数据：忽略 */
    }
  }, []);

  async function run() {
    setBusy(true);
    const r = await evaluate({ title: title.trim(), company: company.trim(), description: description.trim() });
    setResult(typeof r === "string" ? { error: r } : r);
    setBusy(false);
  }

  return (
    <section className="panel no-print" aria-label="按岗位评估">
      <div className="panel-head">
        <h2>按岗位评估与定制</h2>
        <button className="link-btn" style={{ marginLeft: "auto" }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "收起" : "粘贴一个岗位 →"}
        </button>
      </div>
      {!open ? (
        <p className="msg" style={{ margin: 0, color: "var(--muted)" }}>
          从 Boss直聘、实习网站、公众号复制一个岗位过来：先看值不值得投，再按岗位定制一份简历（只重排、改写，不编造）。
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="input" placeholder="岗位名称 *" aria-label="岗位名称" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="input" placeholder="公司（可选）" aria-label="公司" maxLength={80} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <textarea
            className="input"
            rows={6}
            maxLength={8000}
            placeholder="粘贴岗位描述：岗位职责、任职要求……"
            aria-label="岗位描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => void run()} disabled={!consent || blank || busy || !title.trim() || description.trim().length < 20}>
              {busy ? "评估中…（约半分钟）" : "评估匹配度"}
            </button>
            <button
              className="btn ghost sm"
              onClick={() => void runTailor()}
              disabled={!consent || blank || tailoring || !title.trim() || description.trim().length < 20}
              title="按这个岗位重排经历、改写要点（不编造），逐条确认后另存为新简历"
            >
              {tailoring ? "定制中…（约半分钟）" : "按这个岗位定制简历"}
            </button>
            <span className="msg" style={{ margin: 0, color: "var(--faint)" }}>
              {!consent ? "先勾选上方的同意" : blank ? "先填写简历" : costHint}
            </span>
          </div>
          {result?.error && (
            <p className="msg err" role="alert">
              {result.error}
            </p>
          )}
          {result?.fit && <FitResultView fit={result.fit} note={result.note} />}
          {tailored?.error && (
            <p className="msg err" role="alert">
              {tailored.error}
            </p>
          )}
          {tailored?.plan && (
            <TailorReview
              key={tailored.key}
              plan={tailored.plan}
              resume={resume}
              jobTitle={title.trim()}
              note={tailored.note}
              onSaveAs={onSaveAs}
              saveAsBlocked={saveAsBlocked}
              onApply={onApply}
            />
          )}
        </div>
      )}
    </section>
  );
}
