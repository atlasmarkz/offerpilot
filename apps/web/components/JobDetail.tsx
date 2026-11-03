"use client";

import type { Job, Profile } from "@offerpilot/shared";
import { useState } from "react";
import { explainJob } from "../lib/match";
import { CompanyTag } from "./JobList";

interface Props {
  job: Job;
  profile?: Profile;
  picked: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** 登录后才有：把岗位加入投递看板，返回给用户看的结果文字 */
  onAddBoard?: () => Promise<string>;
}

export function JobDetail({ job, profile, picked, onToggle, onClose, onAddBoard }: Props) {
  const [boardMsg, setBoardMsg] = useState<string>();
  const checks = profile ? explainJob(profile, job) : [];
  const host = (() => {
    try {
      return new URL(job.applyUrl).hostname;
    } catch {
      return "";
    }
  })();

  return (
    <article className="panel detail" aria-label="岗位详情">
      <button className="btn ghost sm close" onClick={onClose}>
        ✕ 关闭
      </button>
      <div className="job-meta">
        <CompanyTag id={job.companyId} />
        <span className="badge muted">{job.kind === "intern" ? "实习" : "校招"}</span>
        {job.reviewStatus !== "approved" && <span className="badge warn">未审核</span>}
      </div>
      <h2>{job.title}</h2>

      <dl className="kv">
        <dt>工作地</dt>
        <dd>{job.city.join(" / ") || "未标注"}</dd>
        {job.deadline && (
          <>
            <dt>截止</dt>
            <dd>{job.deadline.slice(0, 10)}</dd>
          </>
        )}
        <dt>投递入口</dt>
        <dd>{host || "官网"}</dd>
      </dl>

      <div className="sec-title">岗位要求 · 与你的情况对照</div>
      <ul className="checks">
        {checks.map((c) => (
          <li key={c.label}>
            <span className={`ic ${c.status === "ok" ? "ok" : "unk"}`} aria-label={c.status === "ok" ? "满足" : "未写明"}>
              {c.status === "ok" ? "✓" : "?"}
            </span>
            <span style={{ color: "var(--muted)" }}>{c.label}</span>
            <span className={`need${c.need ? "" : " none"}`}>{c.need || "岗位没写明，请到官网核对"}</span>
          </li>
        ))}
      </ul>

      {job.description && (
        <>
          <div className="sec-title">岗位描述（摘要）</div>
          <div className="desc">{job.description}</div>
          {job.description.length >= 600 && (
            <p className="msg" style={{ color: "var(--faint)" }}>
              仅显示开头部分，完整内容请到官网查看。
            </p>
          )}
        </>
      )}

      <div className="cta">
        <a className="btn" href={job.applyUrl} target="_blank" rel="noreferrer">
          前往官网投递 ↗
        </a>
        <button className="btn ghost" onClick={onToggle}>
          {picked ? "✓ 已加入，点击移出" : "＋ 加入已选"}
        </button>
        {onAddBoard && (
          <button className="btn ghost" onClick={async () => setBoardMsg(await onAddBoard())}>
            📌 加入投递看板
          </button>
        )}
        {boardMsg && (
          <span className="msg" role="status" style={{ margin: 0 }}>
            {boardMsg} {boardMsg.startsWith("已加入") && <a href="/board">去看板 →</a>}
          </span>
        )}
      </div>
      <p className="msg" style={{ color: "var(--faint)" }}>
        岗位信息来自官网公开页面，可能滞后或有误，请以官网为准。
      </p>
    </article>
  );
}

interface SelectedProps {
  jobs: Job[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** 没有打开任何岗位时，右栏显示已选清单和使用提示。 */
export function SelectedPanel({ jobs, onOpen, onRemove, onClear }: SelectedProps) {
  return (
    <aside className="panel" aria-label="已选岗位">
      <div className="panel-head">
        <h2>已选岗位 {jobs.length > 0 && <span className="badge">{jobs.length}</span>}</h2>
        {jobs.length > 0 && (
          <button className="link-btn" style={{ marginLeft: "auto" }} onClick={onClear}>
            清空
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <>
          <p style={{ color: "var(--muted)", margin: 0 }}>点击左侧任意岗位，这里会显示它的详情，并告诉你各项要求是否满足。</p>
          <ul className="tips">
            <li>勾选岗位前面的方框，可以先攒一批再统一处理</li>
            <li>带“未识别”标记的条件，岗位本身没写清楚，投递前请自己核对</li>
            <li>投递页由你在官网自己提交，扩展只帮你填基础信息</li>
          </ul>
        </>
      ) : (
        <>
          <ul className="sel-list">
            {jobs.map((j) => (
              <li key={j.id}>
                <button
                  className="link-btn"
                  style={{ textAlign: "left", minWidth: 0 }}
                  onClick={() => onOpen(j.id)}
                  title={j.title}
                >
                  <div className="t">{j.title}</div>
                  <div className="c">{j.city.join(" / ")}</div>
                </button>
                <button className="link-btn" onClick={() => onRemove(j.id)} aria-label={`移除 ${j.title}`}>
                  移除
                </button>
              </li>
            ))}
          </ul>
          <div className="cta">
            <button
              className="btn"
              onClick={() => jobs.slice(0, 10).forEach((j) => window.open(j.applyUrl, "_blank", "noopener"))}
            >
              打开前 {Math.min(10, jobs.length)} 个投递页 ↗
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
