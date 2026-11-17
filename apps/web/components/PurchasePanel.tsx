"use client";

import { CREDIT_PACK, PLANS, PLAN_ORDER, productOf, yuan, type PlanId, type ProductId } from "@offerpilot/shared";
import { useEffect, useRef, useState } from "react";

type OrderState = { id: string; status: "pending" | "paid" | "closed" | "refunded" | "timeout" | "error"; text?: string };

/**
 * 账户页的“会员与购买”：各等级的月付 / 季卡、次数包；下单后跳转支付宝收银台。
 * 支付完回到 /account?order=<id>，这里每 2 秒查一次订单（服务端会主动向支付宝确认），最多 2 分钟。
 */
export function PurchasePanel({ plan, periodEnd, onPaid }: { plan: PlanId; periodEnd: string | null; onPaid: () => void }) {
  const [enabled, setEnabled] = useState<boolean>();
  const [busy, setBusy] = useState<ProductId>();
  const [error, setError] = useState<string>();
  const [order, setOrder] = useState<OrderState>();
  const [wanted, setWanted] = useState<string>();
  const polled = useRef(false);

  useEffect(() => {
    fetch("/api/pay/config")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false));
    const q = new URLSearchParams(window.location.search);
    setWanted(q.get("buy") ?? undefined);
    const id = q.get("order");
    if (id && !polled.current) {
      polled.current = true;
      void poll(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function poll(id: string) {
    setOrder({ id, status: "pending" });
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`/api/pay/orders/${id}`);
        const d = (await res.json().catch(() => ({}))) as { status?: OrderState["status"]; error?: string };
        if (!res.ok) return setOrder({ id, status: "error", text: d.error ?? "查询订单失败" });
        if (d.status === "paid") {
          setOrder({ id, status: "paid" });
          onPaid();
          // 去掉地址里的 order 参数，刷新页面不会再查一遍
          window.history.replaceState(null, "", "/account");
          return;
        }
        if (d.status && d.status !== "pending") return setOrder({ id, status: d.status });
      } catch {
        /* 网络抖动：继续等 */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setOrder({ id, status: "timeout" });
  }

  async function buy(productId: ProductId) {
    setBusy(productId);
    setError(undefined);
    try {
      const res = await fetch("/api/pay/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      const d = (await res.json().catch(() => ({}))) as { payUrl?: string; error?: string };
      if (!res.ok || !d.payUrl) throw new Error(d.error ?? "下单失败");
      window.location.href = d.payUrl; // 跳转支付宝收银台
    } catch (e) {
      setError((e as Error).message);
      setBusy(undefined);
    }
  }

  const active = plan !== "free" && !!periodEnd && Date.parse(periodEnd) > Date.now();
  const rank = (p: PlanId) => PLAN_ORDER.indexOf(p);
  const buyLabel = (p: PlanId) => (active && p === plan ? "续期" : active && rank(p) > rank(plan) ? "升级" : "开通");

  return (
    <section className="panel" id="buy" aria-label="会员与购买">
      <div className="panel-head">
        <h2>会员与购买</h2>
        <span className="hint">{enabled === false ? "支付暂未开通" : "支付宝付款 · 不自动续费"}</span>
      </div>

      {order && (
        <p className={`msg ${order.status === "paid" ? "ok" : order.status === "pending" ? "" : "err"}`} role="status" style={{ marginTop: 0 }}>
          {order.status === "pending" && "正在确认支付结果……（支付宝付款成功后一般几秒内到账）"}
          {order.status === "paid" && "✓ 支付成功，权益已到账。"}
          {order.status === "timeout" && "还没确认到支付结果。如果已经付款，请稍后刷新本页；仍未到账请联系我们并提供订单号。"}
          {order.status === "closed" && "订单已关闭（超时未付款）。"}
          {order.status === "error" && (order.text ?? "查询订单失败")}
          {order.status !== "paid" && order.status !== "pending" && <span style={{ color: "var(--faint)" }}>　订单号 {order.id}</span>}
        </p>
      )}
      {error && (
        <p className="msg err" role="alert" style={{ marginTop: 0 }}>
          {error}
        </p>
      )}

      <div className="plan-compare">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const lower = active && rank(id) < rank(plan) && id !== "free";
          return (
            <div key={id} className={`plan-box${id === plan ? " cur" : ""}${wanted?.startsWith(`${id}-`) ? " want" : ""}`}>
              <h3>
                {p.name} {id === plan && <span className="badge">当前</span>}
              </h3>
              <div className="plan-price">{p.price ? <>¥{yuan(p.price.monthFen)}<small>/月</small></> : "¥0"}</div>
              <div style={{ color: "var(--muted)" }}>{p.tagline}</div>
              <ul>
                <li>看板 {p.boardItems} 条</li>
                <li>{`每月 ${p.monthlyQuota} 次 AI`}</li>
                <li>在线简历 {p.resumes} 份 · 附件 {p.attachments} 份</li>
              </ul>
              {p.price && (
                <div className="plan-buy">
                  {(["season", "month"] as const).map((k) => {
                    const pid = `${id}-${k}` as ProductId;
                    const prod = productOf(pid)!;
                    return (
                      <button
                        key={k}
                        className={`btn sm${k === "season" ? "" : " ghost"}`}
                        disabled={!enabled || !!busy || lower}
                        title={lower ? "当前等级更高，到期后再买较低等级" : undefined}
                        onClick={() => void buy(pid)}
                      >
                        {busy === pid ? "跳转中…" : `${buyLabel(id)}${k === "season" ? "季卡" : "一个月"} ¥${yuan(prod.priceFen)}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pack-row">
        <span>
          <b>次数包 {CREDIT_PACK.units} 次 ¥{yuan(CREDIT_PACK.priceFen)}</b>　不过期，会员额度用完后自动使用
        </span>
        <button className="btn sm ghost" disabled={!enabled || !!busy} onClick={() => void buy("credits-20")}>
          {busy === "credits-20" ? "跳转中…" : "购买"}
        </button>
      </div>
      <p className="msg" style={{ color: "var(--faint)", marginBottom: 0 }}>
        季卡 90 天，额度是三个月合计；同等级续期会顺延到期日并累加额度，升级时未用完的额度会带过去。会员不自动续费。
      </p>
    </section>
  );
}
