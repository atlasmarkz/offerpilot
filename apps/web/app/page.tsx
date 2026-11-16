"use client";

import { PricingSection } from "../components/PricingSection";
import { useEffect, useState } from "react";
import { LoginDialog } from "../components/LoginDialog";
import { useSession } from "../hooks/useSession";

const FEATURES = [
  { icon: "⚡", title: "官网投递一键填表", text: "扩展识别飞书、Moka、北森等投递系统，把教育、经历、联系方式一次填好，缺什么提示你补。只填不提交，验证码和提交始终由你自己完成。" },
  { icon: "📌", title: "投递进度看板", text: "待投递、已投递、笔试、面试、Offer，一张看板看清每个岗位走到哪一步；超过两周没动静的会提醒你跟进。" },
  { icon: "📊", title: "投递总览", text: "官网和招聘平台的投递合在一起统计：每天投了多少、哪个渠道回应率高、面试和 Offer 各有几个。" },
  { icon: "🎯", title: "只看能投的岗位", text: "34 家公司的校招和实习，每天更新、下架的自动隐藏；学历、届别、专业、院校逐项比对，岗位没写清楚的条件会标出来。" },
  { icon: "🤖", title: "招聘平台自动投递", text: "Boss直聘自动筛选、自动打招呼：每日上限、随机间隔、遇到验证码立即停下交给你。即将推出。" },
  { icon: "🔒", title: "隐私优先", text: "姓名、手机等联系方式只存在你的浏览器里；解析不保存原始文件，随时一键删除账号和全部数据。" },
];

const STEPS = [
  { n: "1", title: "填好投递资料", text: "上传简历或手动填写一次，扩展填表、各家投递都用这一份。" },
  { n: "2", title: "筛出能投的岗位", text: "按硬条件、城市、公司、发布时间筛选，加入投递看板。" },
  { n: "3", title: "一键填表，看板跟进", text: "到官网投递页点扩展图标填好，提交后在看板里跟进笔试、面试。" },
];

const FAQ = [
  { q: "扩展会替我提交申请吗？", a: "官网投递不会：扩展只填写，提交和验证码始终由你自己完成。招聘平台自动投递（即将推出）需要你单独开启并确认风险，有每日上限，遇到验证码立即停下。" },
  { q: "岗位信息可靠吗？", a: "岗位来自各公司官网公开的校招页面，每天更新；连续两次找不到的岗位会自动下架隐藏。具体要求请以官网为准，岗位没写清楚的条件会标出来。" },
  { q: "我的资料会被保存吗？", a: "联系方式只存在你的浏览器里。解析简历时文件只在内存中处理、不落盘，云端只保存你确认后的结构化内容。随时可以一键删除账号和全部数据。" },
  { q: "AI 会不会编造我的经历？", a: "不会。AI 工具只依据你已写的内容；生成的内容里出现你资料里没有的数字或技能，会直接标出来提醒你核实。" },
  { q: "会员怎么收费？", a: "免费版就能筛岗位、填表、用看板。会员月付 9.9 元起，推荐求职季卡（3 个月）；会员不自动续费。" },
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
            自动筛出你<b>真正满足硬条件</b>的校招与实习岗位，扩展<b>一键填好官网投递表</b>，<b>看板</b>追踪每一次投递的进度。
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
          <span>34 家公司 · 含芯片、车企、国央企</span>
          <span>岗位每天更新，下架自动隐藏</span>
          <span>只填不提交，验证码你来</span>
          <span>联系方式只存在你的浏览器</span>
        </section>

        <section id="features" className="lp-section">
          <h2>把投递这件事做可靠</h2>
          <p className="lp-lead">少填重复的表，少漏要跟进的投递：找得到能投的岗位，填得快，进度看得清。</p>
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

        <PricingSection loggedIn={!!session.user} onStart={start} />

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
