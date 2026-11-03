"use client";

import { PLANS, PLAN_ORDER } from "@offerpilot/shared";
import { useEffect, useState } from "react";
import { LoginDialog } from "../components/LoginDialog";
import { useSession } from "../hooks/useSession";

const FEATURES = [
  { icon: "🎯", title: "硬条件精准筛选", text: "学历、届别、专业、院校要求逐项比对，只给你真正能投的岗位，并告诉你哪些条件岗位没写清楚。" },
  { icon: "📄", title: "简历解析与 AI 建议", text: "上传 PDF 或 Word，自动整理成结构化简历，再给出可执行的修改建议。不编造经历，缺数据只提示你补充。" },
  { icon: "✍️", title: "在线简历，一键导出", text: "结构化编辑、实时 A4 预览，导出整洁的 PDF。联系方式只在你手里，不会发给大模型。" },
  { icon: "⚡", title: "浏览器扩展填表", text: "在官网投递页一键填入基础信息，验证码和提交始终由你自己完成。" },
  { icon: "📌", title: "投递看板", text: "待投递、已投递、笔试、面试、Offer，一张看板看清每个岗位的进度，附备注和日期。" },
  { icon: "🔒", title: "隐私优先", text: "解析不保存原始文件，云端只留最新一份结构化简历，随时一键删除账号和全部数据。" },
];

const STEPS = [
  { n: "1", title: "导入简历", text: "上传简历或手动填写，几秒得到你的求职画像。" },
  { n: "2", title: "筛选并勾选岗位", text: "按硬条件、城市、公司检索，点开岗位看要求对照。" },
  { n: "3", title: "打磨与投递", text: "AI 改简历，扩展填表，看板追踪每一次投递。" },
];

const FAQ = [
  { q: "我的简历会被保存吗？", a: "解析时文件只在内存中处理，不落盘。云端只保存你确认后的结构化内容，而且每人只保留最新一份。你也可以另外上传附件简历用于投递，随时可以删除。" },
  { q: "AI 会不会编造我的经历？", a: "不会。我们要求模型严格依据你已写的内容给建议；需要数据时只放“请补充”的占位，让你自己填真实数字。" },
  { q: "可以用自己的大模型吗？", a: "可以。在“模型设置”里填你自己的 Base URL、API Key 和模型名即可，不扣站点额度。也支持自己部署整套服务。" },
  { q: "岗位信息可靠吗？", a: "岗位来自各公司官网公开的校招页面，我们抽样核对投递链接可打开。具体要求请以官网为准，页面上也会标出岗位没写清楚的条件。" },
  { q: "会员什么时候开放？", a: "会员和支付正在筹备中，开放前所有功能可以用免费版体验。" },
];

function Mock() {
  const rows = [
    ["后端开发工程师", "字节跳动", "上海 / 北京", "ok"],
    ["算法工程师（推荐）", "腾讯", "深圳", "ok"],
    ["产品经理（校招）", "美团", "北京", "warn"],
    ["前端开发工程师", "小红书", "上海", "ok"],
  ] as const;
  return (
    <div className="lp-mock" aria-hidden>
      <div className="lp-mock-bar">
        <i />
        <i />
        <i />
        <span>OfferPilot · 岗位</span>
      </div>
      <div className="lp-mock-body">
        <div className="lp-mock-list">
          <div className="lp-mock-search">🔍 后端 上海</div>
          {rows.map(([t, c, city, k], i) => (
            <div key={t} className={`lp-mock-row${i === 0 ? " on" : ""}`}>
              <b>{t}</b>
              <span>
                {c} · {city}
              </span>
              {k === "warn" && <em>未识别：专业</em>}
            </div>
          ))}
        </div>
        <div className="lp-mock-detail">
          <b>后端开发工程师</b>
          <span className="lp-pill">字节跳动 · 校招</span>
          <ul>
            <li>
              <i className="ok">✓</i>学历　本科及以上
            </li>
            <li>
              <i className="ok">✓</i>届别　2027 届
            </li>
            <li>
              <i className="q">?</i>专业　岗位没写明
            </li>
          </ul>
          <div className="lp-mock-btn">前往官网投递 ↗</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const session = useSession();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!session.checked) return;
    // 本地 / 自托管没有账号体系：直接进应用
    if (!session.enabled) window.location.replace("/app");
    else if (!session.user && new URLSearchParams(window.location.search).get("login") === "1") setShowLogin(true);
  }, [session.checked, session.enabled, session.user]);

  const start = () => {
    if (session.user) window.location.href = "/app";
    else setShowLogin(true);
  };

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="logo" href="/" aria-label="OfferPilot 首页">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/logo-dark.png" />
            <img src="/logo.png" alt="OfferPilot" height={32} />
          </picture>
        </a>
        <nav className="lp-links" aria-label="页面导航">
          <a href="#features">功能</a>
          <a href="#how">使用流程</a>
          <a href="#pricing">会员</a>
          <a href="#faq">常见问题</a>
        </nav>
        <span className="spacer" />
        {session.user ? (
          <a className="btn sm" href="/app">
            进入应用 →
          </a>
        ) : (
          <>
            <button className="link-btn lp-login" onClick={() => setShowLogin(true)}>
              登录
            </button>
            <button className="btn sm" onClick={start}>
              免费注册
            </button>
          </>
        )}
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-glow" aria-hidden />
          <p className="lp-eyebrow">面向 2027 届校招与实习</p>
          <h1>
            把校招的每一步，
            <br />
            <span className="lp-grad">都交给 OfferPilot</span>
          </h1>
          <p className="lp-sub">
            上传简历，自动筛出你<b>真正满足硬条件</b>的校招与实习岗位；AI 帮你打磨简历，扩展一键填表，看板追踪每一次投递。
          </p>
          <div className="lp-cta">
            <button className="btn lp-btn-lg" onClick={start}>
              {session.user ? "进入应用" : "免费开始"}
            </button>
            <a className="btn ghost lp-btn-lg" href="#how">
              看看怎么用
            </a>
          </div>
          <p className="lp-note">无需绑定银行卡 · 随时删除账号和全部数据</p>
          <Mock />
        </section>

        <section className="lp-strip" aria-label="特点">
          <span>覆盖互联网与科技头部公司</span>
          <span>岗位持续更新</span>
          <span>投递链接抽样核对</span>
          <span>解析不保存原始文件</span>
        </section>

        <section id="features" className="lp-section">
          <h2>一个工具，覆盖求职的全流程</h2>
          <p className="lp-lead">不是又一个岗位列表，而是从“找得到、投得准”到“改得好、跟得紧”的完整闭环。</p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="lp-card">
                <div className="lp-icon" aria-hidden>
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="lp-section lp-alt">
          <h2>三步开始</h2>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="lp-step">
                <span className="lp-num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="lp-section">
          <h2>选择适合你的方案</h2>
          <p className="lp-lead">免费版就能完成筛选、编辑和投递管理；需要更多 AI 次数和功能时再升级。价格即将公布。</p>
          <div className="lp-plans">
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              return (
                <article key={id} className={`lp-plan${id === "plus" ? " hot" : ""}`}>
                  {id === "plus" && <span className="lp-tag">最受欢迎</span>}
                  <h3>{p.name}</h3>
                  <p className="lp-plan-tag">{p.tagline}</p>
                  <div className="lp-price">{id === "free" ? "¥0" : "即将开通"}</div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f.text}>
                        <i>✓</i>
                        <span>
                          {f.text}
                          {f.soon && <em>即将推出</em>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {id === "free" ? (
                    <button className="btn block" onClick={start}>
                      免费开始
                    </button>
                  ) : (
                    <button className="btn ghost block" disabled>
                      即将开通
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section id="faq" className="lp-section lp-alt">
          <h2>常见问题</h2>
          <div className="lp-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>今天就开始整理你的求职</h2>
          <button className="btn lp-btn-lg" onClick={start}>
            {session.user ? "进入应用" : "免费注册"}
          </button>
        </section>
      </main>

      <footer className="lp-foot">
        <span>© OfferPilot</span>
        <a href="/privacy">隐私说明</a>
      </footer>

      {showLogin && (
        <LoginDialog
          onClose={() => setShowLogin(false)}
          onSuccess={(u) => {
            session.signedIn(u);
            window.location.href = "/app";
          }}
        />
      )}
    </div>
  );
}
