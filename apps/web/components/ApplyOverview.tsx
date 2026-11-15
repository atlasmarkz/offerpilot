"use client";

import { APPLY_STATUSES, APPLY_STATUS_LABEL, CHANNEL_LABEL, type ApplyStatus } from "@offerpilot/shared";
import { useMemo } from "react";
import type { Application } from "../lib/applications";
import type { BoardItem } from "../lib/board";
import { SOURCES, overview, unify } from "../lib/overviewStats";

const pct = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);

export interface SyncState {
  /** idle：还没同步；none：没检测到扩展；done：同步完成；error：失败 */
  kind: "idle" | "syncing" | "none" | "done" | "error";
  text?: string;
}

/**
 * 投递总览：官网（投递看板里已投出的）+ Boss直聘、猎聘等平台（扩展自动投递的记录）合在一起看。
 */
export function ApplyOverview({
  board,
  apps,
  sync,
  onSync,
  onStatus,
}: {
  board: BoardItem[];
  apps: Application[];
  sync: SyncState;
  onSync: () => void;
  onStatus: (a: Application, s: ApplyStatus) => void;
}) {
  const o = useMemo(() => overview(unify(board, apps)), [board, apps]);
  const maxDay = Math.max(1, ...o.days.map((d) => d.total));
  const recent = apps.slice(0, 12);

  const kpis: { label: string; value: string | number; sub: string; tone?: "ok" }[] = [
    { label: "总投递", value: o.total, sub: o.sources.map((s) => `${s.label} ${s.total}`).join(" · ") },
    { label: "今日 / 近 7 天", value: `${o.today} / ${o.week}`, sub: "官网按投递日期，平台按投递时间" },
    { label: "有回应", value: pct(o.responseRate), sub: o.responseRate === undefined ? "投出 5 个以上才统计" : `${o.responded} 个：HR 回复、笔试、面试` },
    { label: "面试 / Offer", value: `${o.interview} / ${o.offer}`, sub: "包括官网和各平台", tone: o.offer ? "ok" : undefined },
  ];

  return (
    <section className="dash" aria-label="投递总览">
      <div className="list-head" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>投递总览</h2>
        <span className="count">官网 + Boss直聘 + 猎聘</span>
        <span className={`sync-note ${sync.kind}`} role="status" style={{ marginLeft: "auto" }}>
          {sync.text}
        </span>
        <button className="btn sm ghost" onClick={onSync} disabled={sync.kind === "syncing"}>
          {sync.kind === "syncing" ? "同步中…" : "同步扩展记录"}
        </button>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`kpi${k.tone ? ` ${k.tone}` : ""}`}>
            <span className="kpi-label">{k.label}</span>
            <b className="kpi-value">{k.value}</b>
            <span className="kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="panel dash-card">
          <div className="panel-head">
            <h2>近 14 天每日投递</h2>
            <span className="legend">
              {SOURCES.map((s) => (
                <span key={s}>
                  <i className={`src-${s}`} />
                  {CHANNEL_LABEL[s]}
                </span>
              ))}
            </span>
          </div>
          {o.days.some((d) => d.total) ? (
            <div
              className="bars days"
              role="img"
              aria-label={`近 14 天每日投递：${o.days.map((d) => `${d.label} ${d.total}`).join("，")}`}
            >
              {o.days.map((d) => (
                <div key={d.day} className="bar-col" title={`${d.label}：${SOURCES.map((s) => `${CHANNEL_LABEL[s]} ${d.bySource[s]}`).join("，")}`}>
                  <span className="bar-n">{d.total || ""}</span>
                  <span className="bar-stack" style={{ height: `${(d.total / maxDay) * 100}%` }}>
                    {SOURCES.map((s) =>
                      d.bySource[s] ? <i key={s} className={`src-${s}`} style={{ flexGrow: d.bySource[s] }} /> : null,
                    )}
                  </span>
                  <span className="bar-x">{d.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dash-empty">近 14 天还没有投递。开启扩展的自动投递，或在下面的看板记录官网投递。</p>
          )}
        </div>

        <div className="panel dash-card">
          <div className="panel-head">
            <h2>渠道对比</h2>
            <span className="hint">回应率 = 有回应 ÷ 投递数</span>
          </div>
          <div className="table-wrap">
          <table className="src-table">
            <thead>
              <tr>
                <th scope="col">渠道</th>
                <th scope="col">投递</th>
                <th scope="col">今日</th>
                <th scope="col">近 7 天</th>
                <th scope="col">回应率</th>
                <th scope="col">面试</th>
                <th scope="col">Offer</th>
              </tr>
            </thead>
            <tbody>
              {o.sources.map((s) => (
                <tr key={s.source}>
                  <th scope="row">
                    <i className={`dot src-${s.source}`} />
                    {s.label}
                  </th>
                  <td>{s.total}</td>
                  <td>{s.today}</td>
                  <td>{s.week}</td>
                  <td>{pct(s.responseRate)}</td>
                  <td>{s.interview}</td>
                  <td>{s.offer}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="panel dash-card" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <h2>最近的平台投递</h2>
          <span className="hint">{apps.length ? `共 ${apps.length} 条，HR 回复后在这里改状态` : "暂无"}</span>
        </div>
        {recent.length ? (
          <ul className="apply-list">
            {recent.map((a) => (
              <li key={a.id}>
                <i className={`dot src-${a.channel}`} title={CHANNEL_LABEL[a.channel]} />
                <span className="t">
                  <b>{a.title}</b>
                  <span>{[a.company, a.city, a.salary, new Date(a.applied_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}</span>
                </span>
                <select aria-label={`${a.title} 的状态`} value={a.status} onChange={(e) => onStatus(a, e.target.value as ApplyStatus)}>
                  {APPLY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {APPLY_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                {a.url && (
                  <a className="link-btn" href={a.url} target="_blank" rel="noreferrer">
                    职位 ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dash-empty">还没有平台投递记录。在扩展里开启 Boss直聘 / 猎聘 自动投递后，回到这里点“同步扩展记录”。</p>
        )}
      </div>
    </section>
  );
}
