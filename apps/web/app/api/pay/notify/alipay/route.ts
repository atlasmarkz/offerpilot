import { amountToFen, isPaid, verifyNotify } from "../../../../../lib/pay/alipay";
import { fulfill, getOrder, orderIdOf, paymentConfig } from "../../../../../lib/pay/orders";

export const dynamic = "force-dynamic";

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

/**
 * 支付宝异步通知。只认验签通过、app_id 是自己的、订单存在的通知；
 * 履约成功或之前已履约都回 "success"（支付宝收到后就不再重发），其他情况回 "fail" 让它稍后重发。
 * 不需要登录，也不检查请求来源（通知来自支付宝服务器）。
 */
export async function POST(req: Request) {
  const cfg = paymentConfig();
  if (!cfg) return text("fail", 503);
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  if (!verifyNotify(cfg, params) || params.app_id !== cfg.appId) {
    console.warn("[pay] alipay notify rejected: bad signature or app_id");
    return text("fail", 400);
  }
  const orderId = orderIdOf(params.out_trade_no);
  const order = orderId ? await getOrder(orderId).catch(() => undefined) : undefined;
  if (!order) return text("fail", 404);
  // 等待付款、交易关闭等：确认收到即可，不履约
  if (!isPaid(params.trade_status)) return text("success");
  try {
    const r = await fulfill(order, params.trade_no ?? "", amountToFen(params.total_amount));
    if (r === "ok" || r === "already") return text("success");
    console.error("[pay] alipay notify mismatch", order.id, r);
    return text("fail", 409);
  } catch (e) {
    console.error("[pay] fulfill failed", order.id, (e as Error).message);
    return text("fail", 502);
  }
}
