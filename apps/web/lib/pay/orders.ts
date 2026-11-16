import { PLAN_ORDER, productOf, type PlanId, type Product } from "@offerpilot/shared";
import { billingEnabled } from "../billing/billing";
import { authHeaders, supabaseOrigin } from "../jobsSource";
import { alipayConfig, isPaid, tradeQuery, type AlipayConfig } from "./alipay";

/**
 * 订单：建单、查单、履约。数据库写入一律用 service_role（用户只能读自己的订单），
 * 金额和权益只按商品目录算，履约在数据库函数 fulfill_order 里一个事务完成（见 0012 迁移）。
 */
export interface PayOrder {
  id: string;
  user_id: string;
  product_id: string;
  amount_fen: number;
  channel: "alipay" | "wechat";
  status: "pending" | "paid" | "closed" | "refunded";
  trade_no: string | null;
  created_at: string;
  paid_at: string | null;
}

export const ORDER_COLUMNS = "id,user_id,product_id,amount_fen,channel,status,trade_no,created_at,paid_at";

/** 支付是否开通：要开着计费，并配好支付宝。 */
export function paymentConfig(env: Record<string, string | undefined> = process.env): AlipayConfig | undefined {
  if (!billingEnabled(env) || env.PAYMENT_ENABLED !== "1") return undefined;
  try {
    return alipayConfig(env);
  } catch {
    return undefined; // 密钥格式不对：当作没开通，不让整个页面报错
  }
}

/** 支付宝 out_trade_no 只能用字母、数字、下划线：订单 UUID 去掉连字符。 */
export const outTradeNoOf = (orderId: string) => orderId.replace(/-/g, "");
export function orderIdOf(outTradeNo: string | undefined): string | undefined {
  const h = (outTradeNo ?? "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return undefined;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * 能不能买：会员还在有效期内时，不能买更低的等级（否则高等级会被覆盖掉）；同等级是续期，更高等级是升级。
 * 次数包随时能买。返回给用户看的原因，可以买返回 undefined。
 */
export function purchaseBlocked(product: Product, current: { plan: PlanId; periodEnd?: string | null }, now = new Date()): string | undefined {
  if (product.kind !== "subscription" || !product.plan) return undefined;
  const active = current.plan !== "free" && !!current.periodEnd && Date.parse(current.periodEnd) > now.getTime();
  if (active && PLAN_ORDER.indexOf(current.plan) > PLAN_ORDER.indexOf(product.plan))
    return "你当前的会员等级更高，到期后再购买较低等级；需要更多次数可以买次数包";
  return undefined;
}

async function service(path: string, init: RequestInit = {}): Promise<Response> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("计费服务未配置");
  return fetch(`${supabaseOrigin(SUPABASE_URL)}/rest/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(SUPABASE_SERVICE_KEY.trim()), ...(init.headers as Record<string, string>) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function createOrder(userId: string, product: Product, channel: PayOrder["channel"]): Promise<PayOrder> {
  const res = await service(`/pay_order?select=${ORDER_COLUMNS}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, product_id: product.id, amount_fen: product.priceFen, channel }),
  });
  if (!res.ok) throw new Error(`建单失败 HTTP ${res.status}`);
  const [order] = (await res.json()) as PayOrder[];
  return order!;
}

export async function getOrder(id: string): Promise<PayOrder | undefined> {
  const res = await service(`/pay_order?id=eq.${encodeURIComponent(id)}&select=${ORDER_COLUMNS}&limit=1`);
  if (!res.ok) throw new Error(`读取订单失败 HTTP ${res.status}`);
  return ((await res.json()) as PayOrder[])[0];
}

export type FulfillResult = "ok" | "already" | "not_found" | "bad_status" | "mismatch";

/** 支付确认后履约：按订单上的商品从目录取权益，交给数据库函数一次性完成（重复调用安全）。 */
export async function fulfill(order: PayOrder, tradeNo: string, paidFen: number): Promise<FulfillResult> {
  const product = productOf(order.product_id);
  if (!product) return "mismatch";
  const res = await service("/rpc/fulfill_order", {
    method: "POST",
    body: JSON.stringify({
      p_order: order.id,
      p_trade_no: tradeNo,
      p_amount_fen: paidFen,
      p_product: product.id,
      p_kind: product.kind,
      p_plan: product.plan ?? null,
      p_days: product.days ?? 0,
      p_units: product.units,
    }),
  });
  if (!res.ok) throw new Error(`履约失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as FulfillResult;
}

/**
 * 主动向支付宝确认一笔还没到账的订单（本地开发收不到异步通知时靠它；线上作为通知丢失的兜底）。
 * 返回最新的订单状态。
 */
export async function settle(cfg: AlipayConfig, order: PayOrder): Promise<PayOrder["status"]> {
  if (order.status !== "pending" || order.channel !== "alipay") return order.status;
  const t = await tradeQuery(cfg, outTradeNoOf(order.id));
  if (!isPaid(t.status) || !t.tradeNo || t.amountFen === undefined) return "pending";
  const r = await fulfill(order, t.tradeNo, t.amountFen);
  if (r === "ok" || r === "already") return "paid";
  console.error("[pay] settle mismatch", order.id, r);
  return "pending";
}
