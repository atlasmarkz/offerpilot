import { paymentConfig } from "../../../../lib/pay/orders";

export const dynamic = "force-dynamic";

/** 支付是否开通（前端据此显示“购买”还是“即将开通”）。不返回任何密钥信息。 */
export async function GET() {
  return Response.json({ enabled: !!paymentConfig(), channels: paymentConfig() ? ["alipay"] : [] });
}
