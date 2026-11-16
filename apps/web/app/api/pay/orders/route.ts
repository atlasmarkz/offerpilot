import { productOf } from "@offerpilot/shared";
import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { loadUsage } from "../../../../lib/billing/plan";
import { pagePayUrl } from "../../../../lib/pay/alipay";
import { createOrder, outTradeNoOf, paymentConfig, purchaseBlocked } from "../../../../lib/pay/orders";
import { clientIp, createLimiter } from "../../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// 建单限流：每个 IP 每天 30 单，全站 3000 单（防止刷单占用支付宝接口）
const limiter = createLimiter(30, 3000, { what: "下单", tail: "请明天再试" });

/** 公网能访问到的站点地址：支付宝异步通知要打到这里。本机开发（localhost）收不到，靠查单兜底。 */
function publicOrigin(req: Request): string {
  const configured = process.env.PAY_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

/** 下单：只收商品 id，金额和权益由服务端按商品目录决定。返回跳转到支付宝收银台的地址。 */
export async function POST(req: Request) {
  const cfg = paymentConfig();
  if (!cfg) return jsonWith({ error: "支付暂未开通" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { productId?: unknown } | null;
  const product = productOf(body?.productId);
  if (!product) return jsonWith({ error: "没有这个商品" }, { status: 400 });

  const s = await resolveSession(req).catch(() => undefined);
  if (!s) return jsonWith({ error: "请先登录", code: "login_required" }, { status: 401 });
  const limited = limiter.check(clientIp(req));
  if (limited) return jsonWith({ error: limited }, { status: 429, cookies: s.setCookies });

  try {
    const usage = await loadUsage(s.accessToken);
    const blocked = purchaseBlocked(product, { plan: usage.plan, periodEnd: usage.periodEnd });
    if (blocked) return jsonWith({ error: blocked }, { status: 409, cookies: s.setCookies });

    const order = await createOrder(s.user.id, product, "alipay");
    const origin = publicOrigin(req);
    const payUrl = pagePayUrl(cfg, {
      outTradeNo: outTradeNoOf(order.id),
      amountFen: order.amount_fen,
      subject: `OfferPilot ${product.name}`,
      returnUrl: `${new URL(req.url).origin}/account?order=${order.id}`,
      notifyUrl: /^https:\/\//.test(origin) ? `${origin}/api/pay/notify/alipay` : undefined,
    });
    return jsonWith({ orderId: order.id, payUrl }, { status: 201, cookies: s.setCookies });
  } catch (e) {
    console.error("[pay] create order failed", (e as Error).message);
    return jsonWith({ error: "下单失败，请稍后重试" }, { status: 502, cookies: s.setCookies });
  }
}
