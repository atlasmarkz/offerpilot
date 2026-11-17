"use client";

import { CREDIT_PACK, PLANS, PLAN_ORDER, yuan } from "@offerpilot/shared";

/** 首页的会员方案：各等级月付 / 季卡价格、权益、次数包。价格全部来自 packages/shared/src/plans.ts。 */
export function PricingSection({ loggedIn, onStart }: { loggedIn: boolean; onStart: () => void }) {
  return (
        <section id="pricing" className="lp-section">
          <h2>选择适合你的方案</h2>
          <p className="lp-lead">
            免费版就能筛岗位、一键填表、用看板管投递；投递多了、需要更多 AI 次数时再升级。推荐买<b>求职季卡</b>：3 个月，额度三个月合计、可以集中在网申高峰用。
          </p>
          <div className="lp-plans">
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              return (
                <article key={id} className={`lp-plan${id === "plus" ? " hot" : ""}`}>
                  {id === "plus" && <span className="lp-tag">最受欢迎</span>}
                  <h3>{p.name}</h3>
                  <p className="lp-plan-tag">{p.tagline}</p>
                  {p.price ? (
                    <div className="lp-price">
                      ¥{yuan(p.price.monthFen)}
                      <small>/月</small>
                      <span className="lp-season">
                        求职季卡 ¥{yuan(p.price.seasonFen)} / 3 个月
                      </span>
                    </div>
                  ) : (
                    <div className="lp-price">
                      ¥0<small>/永久</small>
                    </div>
                  )}
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
                    <button className="btn ghost block" onClick={onStart}>
                      免费开始
                    </button>
                  ) : loggedIn ? (
                    <a className={`btn block${id === "plus" ? "" : " ghost"}`} href={`/account?buy=${id}-season#buy`}>
                      开通 {p.name}
                    </a>
                  ) : (
                    <button className={`btn block${id === "plus" ? "" : " ghost"}`} onClick={onStart}>
                      注册后开通
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <p className="lp-pack">
            只是偶尔用一下？<b>次数包 ¥{yuan(CREDIT_PACK.priceFen)} / {CREDIT_PACK.units} 次</b>，不过期，免费版也能买。会员不自动续费，到期前不会扣款。
          </p>
        </section>
  );
}
