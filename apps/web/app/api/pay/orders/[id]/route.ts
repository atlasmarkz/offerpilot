import { jsonWith, resolveSession } from "../../../../../lib/auth/session";
import { getOrder, paymentConfig, settle } from "../../../../../lib/pay/orders";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 查订单状态（支付完回到网站时轮询）。还没到账就主动问一次支付宝，确认付了就当场履约。 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  if (!UUID.test(ctx.params.id)) return jsonWith({ error: "没有找到订单" }, { status: 404 });
  const s = await resolveSession(req).catch(() => undefined);
  if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
  try {
    const order = await getOrder(ctx.params.id);
    // 只能看自己的订单；别人的订单一律当作不存在
    if (!order || order.user_id !== s.user.id) return jsonWith({ error: "没有找到订单" }, { status: 404, cookies: s.setCookies });
    let status = order.status;
    const cfg = paymentConfig();
    if (status === "pending" && cfg) status = await settle(cfg, order).catch(() => "pending" as const);
    return jsonWith({ id: order.id, productId: order.product_id, amountFen: order.amount_fen, status }, { cookies: s.setCookies });
  } catch (e) {
    console.error("[pay] order status failed", (e as Error).message);
    return jsonWith({ error: "查询订单失败" }, { status: 502, cookies: s.setCookies });
  }
}
