"use client";

import { PLANS, PLAN_ORDER } from "@offerpilot/shared";
import { useCallback, useEffect, useState } from "react";
import { TopBar } from "../../components/TopBar";
import { useRequireLogin, useSession } from "../../hooks/useSession";

interface Att {
  id: string;
  name: string;
  size: number;
  created_at: string;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function AccountPage() {
  const session = useSession();
  const allowed = useRequireLogin(session);
  const [atts, setAtts] = useState<Att[]>([]);
  const [max, setMax] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/attachments");
      const d = await res.json();
      if (res.ok) {
        setAtts(d.items);
        setMax(d.max);
      }
    } catch {
      /* 读不到就显示空 */
    }
  }, []);

  useEffect(() => {
    if (allowed && session.user) void load();
  }, [allowed, session.user, load]);

  async function upload(file: File) {
    setBusy(true);
    setMsg(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/me/attachments", { method: "POST", body });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "上传失败");
      setMsg({ ok: true, text: "已上传。" });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function del(a: Att) {
    if (!window.confirm(`删除附件「${a.name}」？文件会被永久删除。`)) return;
    const res = await fetch(`/api/me/attachments/${a.id}`, { method: "DELETE" });
    if (res.ok) await load();
    else setMsg({ ok: false, text: "删除失败，请稍后重试" });
  }

  async function removeAccount() {
    const ok = window.confirm("确定删除账号吗？邮箱、画像、已选岗位、在线简历、附件简历、看板和额度记录都会被永久删除，无法恢复。");
    if (ok && (await session.deleteAccount())) window.location.href = "/";
  }

  if (!allowed) return <TopBar session={session} active="account" />;

  const u = session.usage;
  const plan = u.plan ?? "free";
  const end = u.periodEnd ? u.periodEnd.slice(0, 10) : "";

  return (
    <>
      <TopBar session={session} active="account" />
      <main className="app">
        <div className="acct-page">
          <section className="panel">
            <div className="panel-head">
              <h2>账户信息</h2>
            </div>
            <dl className="kv2">
              <dt>邮箱</dt>
              <dd>{session.user?.email}</dd>
              <dt>当前等级</dt>
              <dd>
                <b>{PLANS[plan].name}</b>
                {end && plan !== "free" && <span style={{ color: "var(--muted)" }}>　{end} 到期</span>}
              </dd>
              {u.billing && (
                <>
                  <dt>AI 额度</dt>
                  <dd>
                    {plan !== "free" ? `本期剩余 ${u.remaining}/${u.quota} 次` : `本月免费剩余 ${u.remaining}/${u.quota} 次`}
                    {"　"}
                    次数包 {u.credits ?? 0} 次
                  </dd>
                </>
              )}
              <dt>投递看板</dt>
              <dd>
                上限 {PLANS[plan].boardItems} 条　<a href="/board">打开看板</a>
              </dd>
              <dt>在线简历</dt>
              <dd>
                <a href="/resume">打开简历工作台</a>
              </dd>
            </dl>
          </section>

          <section className="panel" id="attachments">
            <div className="panel-head">
              <h2>附件简历</h2>
              <span className="hint">
                已用 {atts.length}/{max}　· 免费版 1 份，会员最多 3 份
              </span>
            </div>
            <p className="msg" style={{ color: "var(--muted)", marginTop: 0 }}>
              附件简历是你主动上传、用于投递时当附件的 PDF 或 Word 文件（≤5MB），存在只有你自己能访问的私有存储里，随时可以删除。它和“简历解析”不是一回事：解析时的文件不会被保存。
            </p>
            {atts.length > 0 && (
              <ul className="att-list">
                {atts.map((a) => (
                  <li key={a.id}>
                    <span className="t" title={a.name}>
                      📎 {a.name} <span style={{ color: "var(--faint)" }}>{kb(a.size)}</span>
                    </span>
                    <span style={{ display: "flex", gap: 12 }}>
                      <a className="link-btn" href={`/api/me/attachments/${a.id}`}>
                        下载
                      </a>
                      <button className="link-btn" onClick={() => void del(a)}>
                        删除
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <label className={`btn ghost sm${busy || atts.length >= max ? " disabled" : ""}`} aria-disabled={busy || atts.length >= max}>
              {busy ? "上传中…" : "＋ 上传附件简历"}
              <input
                type="file"
                hidden
                accept=".pdf,.docx"
                disabled={busy || atts.length >= max}
                aria-label="上传附件简历"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {atts.length >= max && (
              <span className="msg" style={{ marginLeft: 10 }}>
                {plan === "free" ? "已达免费版上限，升级会员可存 3 份" : "已达上限，请先删除一份"}
              </span>
            )}
            {msg && (
              <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">
                {msg.text}
              </p>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>会员等级</h2>
              <span className="hint">价格与支付即将开通</span>
            </div>
            <div className="plan-compare">
              {PLAN_ORDER.map((id) => (
                <div key={id} className={`plan-box${id === plan ? " cur" : ""}`}>
                  <h3>
                    {PLANS[id].name} {id === plan && <span className="badge">当前</span>}
                  </h3>
                  <div style={{ color: "var(--muted)" }}>{PLANS[id].tagline}</div>
                  <ul>
                    <li>附件简历 {PLANS[id].attachments} 份</li>
                    <li>{`每月 ${PLANS[id].monthlyQuota} 次 AI`}</li>
                    <li>看板 {PLANS[id].boardItems} 条</li>
                    {PLANS[id].features
                      .filter((f) => f.soon)
                      .map((f) => (
                        <li key={f.text}>{f.text}（即将推出）</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>数据与隐私</h2>
            </div>
            <p className="msg" style={{ marginTop: 0, color: "var(--muted)" }}>
              删除账号会永久删除你的邮箱、画像、已选岗位、在线简历、附件简历、投递看板和额度记录，无法恢复。详见<a href="/privacy">隐私说明</a>。
            </p>
            <button className="btn ghost sm" style={{ color: "var(--warn)", borderColor: "var(--warn)" }} onClick={() => void removeAccount()}>
              删除账号和全部数据
            </button>
          </section>
        </div>
      </main>
    </>
  );
}
