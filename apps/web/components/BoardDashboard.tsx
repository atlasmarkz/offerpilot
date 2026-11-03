"use client";

import { PLANS } from "@offerpilot/shared";
import { useMemo } from "react";
import type { UsageInfo } from "../hooks/useSession";
import type { BoardItem } from "../lib/board";
import { boardStats } from "../lib/boardStats";

const pct = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, used / max) : 0;
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <b>
          {used} / {max}
        </b>
      </div>
      <div className="meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
        <i className={ratio >= 0.9 ? "hot" : undefined} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** 看板上方的求职数据概览：关键数字、投递漏斗、近 8 周节奏、需要跟进的事项、额度使用。 */
export function BoardDashboard({ items, usage }: { items: BoardItem[]; usage: UsageInfo }) {
  const s = useMemo(() => boardStats(items), [items]);
  const maxWeek = Math.max(1, ...s.weeks.map((w) => w.count));
  const maxFunnel = Math.max(1, s.funnel[0]?.reached ?? 1);
  const plan = usage.plan ?? "free";
  const hasTrend = s.weeks.some((w) => w.count > 0);

  const kpis: { label: string; value: string | number; sub: string; tone?: "ok" | "warn" }[] = [
    { label: "收藏的岗位", value: s.total, sub: `${s.total - s.submitted} 个待投递` },
    { label: "已投递", value: s.submitted, sub: `${s.active} 个还在流程中` },
    { label: "进入笔试 / 面试", value: pct(s.responseRate), sub: s.responseRate === undefined ? "投出 3 个以上才统计" : "占已投递的比例" },
    { label: "Offer", value: s.offers, sub: s.offerRate === undefined ? `${s.rejected} 个未通过` : `面试通过率 ${pct(s.offerRate)}`, tone: s.offers ? "ok" : undefined },
  ];

  return (
    <section className="dash" aria-label="求职数据概览">
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
            <h2>投递漏斗</h2>
            <span className="hint">走到过每一步的数量</span>
          </div>
          <ul className="funnel">
            {s.funnel.map((f, i) => {
              const prev = s.funnel[i - 1];
              const conv = prev && prev.reached > 0 && i > 1 ? Math.round((f.reached / prev.reached) * 100) : undefined;
              return (
                <li key={f.status}>
                  <span className="f-label">{f.label}</span>
                  <span className="f-track">
                    <i className={`f-${f.status}`} style={{ width: `${Math.max(f.reached ? 4 : 0, (f.reached / maxFunnel) * 100)}%` }} />
                  </span>
                  <b className="f-num">{f.reached}</b>
                  <span className="f-conv">{conv === undefined ? "" : `${conv}%`}</span>
                </li>
              );
            })}
          </ul>
          {s.rejected > 0 && <p className="dash-note">另有 {s.rejected} 个未通过，没有计入各环节。</p>}
        </div>

        <div className="panel dash-card">
          <div className="panel-head">
            <h2>近 8 周投递节奏</h2>
            <span className="hint">按投递日期统计</span>
          </div>
          {hasTrend ? (
            <div className="bars" role="img" aria-label={`近 8 周每周投递数：${s.weeks.map((w) => `${w.label} ${w.count}`).join("，")}`}>
              {s.weeks.map((w, i) => (
                <div key={w.start} className="bar-col" title={`${w.label} 起的一周：${w.count} 个`}>
                  <span className="bar-n">{w.count || ""}</span>
                  <span className="bar-fill" style={{ height: `${(w.count / maxWeek) * 100}%` }} data-last={i === s.weeks.length - 1 ? "1" : undefined} />
                  <span className="bar-x">{w.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dash-empty">还没有带投递日期的记录。把卡片拖到“已投递”会自动记下日期。</p>
          )}
        </div>

        <div className="panel dash-card">
          <div className="panel-head">
            <h2>需要跟进</h2>
            <span className="hint">{s.reminders.length ? `${s.reminders.length} 项` : "暂无"}</span>
          </div>
          {s.reminders.length ? (
            <ul className="remind">
              {s.reminders.map((r) => (
                <li key={r.item.id} className={r.kind}>
                  <b>{r.item.title}</b>
                  <span>{[r.item.company, r.text].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">目前没有拖了太久的投递，节奏不错。</p>
          )}
        </div>

        <div className="panel dash-card">
          <div className="panel-head">
            <h2>我的额度与分布</h2>
            <span className="badge">{PLANS[plan].name}</span>
          </div>
          <div className="meters">
            <Meter label="投递看板" used={s.total} max={usage.limits?.boardItems ?? PLANS[plan].boardItems} />
            {usage.billing && usage.quota !== undefined && <Meter label="本期 AI 次数" used={usage.used ?? 0} max={usage.quota} />}
          </div>
          {s.topCompanies.length > 0 && (
            <>
              <div className="dash-sub">投递最多的公司</div>
              <div className="chips">
                {s.topCompanies.map((c) => (
                  <span key={c.company} className="chip">
                    {c.company} <em>{c.count}</em>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
