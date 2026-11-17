import { createPrivateKey, createPublicKey, createSign, createVerify, type KeyObject } from "node:crypto";

/**
 * 支付宝开放平台：电脑网站支付（alipay.trade.page.pay）+ 交易查询（alipay.trade.query）+ 异步通知验签。
 * 只用 Node 自带的 crypto 做 RSA2（SHA256withRSA）签名和验签，不依赖 SDK。
 *
 * 环境变量（只在服务端）：
 *   ALIPAY_APP_ID        应用 ID（沙箱应用或正式应用）
 *   ALIPAY_PRIVATE_KEY   应用私钥（PKCS8 或 PKCS1，带不带 PEM 头都行）
 *   ALIPAY_PUBLIC_KEY    支付宝公钥（注意：是“支付宝公钥”，不是应用公钥）
 *   ALIPAY_GATEWAY       默认沙箱 https://openapi-sandbox.dl.alipaydev.com/gateway.do；正式填 https://openapi.alipay.com/gateway.do
 */
export const SANDBOX_GATEWAY = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";

export interface AlipayConfig {
  appId: string;
  privateKey: KeyObject;
  alipayPublicKey: KeyObject;
  gateway: string;
}

function pem(raw: string, label: string): string {
  const body = raw.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
}

/** 读私钥：先按 PKCS8，不行再按 PKCS1（支付宝密钥工具两种都可能生成）。 */
export function loadPrivateKey(raw: string): KeyObject {
  if (raw.includes("-----BEGIN")) return createPrivateKey(raw);
  try {
    return createPrivateKey(pem(raw, "PRIVATE KEY"));
  } catch {
    return createPrivateKey(pem(raw, "RSA PRIVATE KEY"));
  }
}

export function loadPublicKey(raw: string): KeyObject {
  return createPublicKey(raw.includes("-----BEGIN") ? raw : pem(raw, "PUBLIC KEY"));
}

/** 从环境变量读配置；没配全返回 undefined（支付功能视为未开通）。 */
export function alipayConfig(env: Record<string, string | undefined> = process.env): AlipayConfig | undefined {
  const { ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY, ALIPAY_GATEWAY } = env;
  if (!ALIPAY_APP_ID || !ALIPAY_PRIVATE_KEY || !ALIPAY_PUBLIC_KEY) return undefined;
  return {
    appId: ALIPAY_APP_ID.trim(),
    privateKey: loadPrivateKey(ALIPAY_PRIVATE_KEY.trim()),
    alipayPublicKey: loadPublicKey(ALIPAY_PUBLIC_KEY.trim()),
    gateway: (ALIPAY_GATEWAY || SANDBOX_GATEWAY).trim(),
  };
}

/** 待签名串：去掉 sign（以及通知验签时的 sign_type）和空值，按参数名 ASCII 排序后 key=value 用 & 连接。 */
export function signContent(params: Record<string, string | undefined>, exclude: string[] = ["sign"]): string {
  return Object.keys(params)
    .filter((k) => !exclude.includes(k) && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

export function rsa2Sign(content: string, key: KeyObject): string {
  return createSign("RSA-SHA256").update(content, "utf8").sign(key, "base64");
}

export function rsa2Verify(content: string, sign: string, key: KeyObject): boolean {
  try {
    return createVerify("RSA-SHA256").update(content, "utf8").verify(key, sign, "base64");
  } catch {
    return false;
  }
}

/** 支付宝要求的时间格式（北京时间）：yyyy-MM-dd HH:mm:ss */
export function alipayTimestamp(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}

/** 分 → 支付宝金额字符串“9.90”。 */
export const fenToAmount = (fen: number): string => (fen / 100).toFixed(2);
/** 支付宝金额字符串 → 分；格式不对返回 NaN。 */
export const amountToFen = (amount: string | undefined): number => (/^\d+(\.\d{1,2})?$/.test(amount ?? "") ? Math.round(Number(amount) * 100) : NaN);

function commonParams(cfg: AlipayConfig, method: string, bizContent: object, now = new Date()): Record<string, string> {
  return {
    app_id: cfg.appId,
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(now),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };
}

/** 电脑网站支付：返回跳转到支付宝收银台的地址（GET）。 */
export function pagePayUrl(
  cfg: AlipayConfig,
  o: { outTradeNo: string; amountFen: number; subject: string; returnUrl: string; notifyUrl?: string },
  now = new Date(),
): string {
  const params: Record<string, string> = {
    ...commonParams(
      cfg,
      "alipay.trade.page.pay",
      { out_trade_no: o.outTradeNo, product_code: "FAST_INSTANT_TRADE_PAY", total_amount: fenToAmount(o.amountFen), subject: o.subject, timeout_express: "30m" },
      now,
    ),
    return_url: o.returnUrl,
    ...(o.notifyUrl ? { notify_url: o.notifyUrl } : {}),
  };
  params.sign = rsa2Sign(signContent(params), cfg.privateKey);
  return `${cfg.gateway}?${new URLSearchParams(params).toString()}`;
}

/** 异步通知验签：通知参数去掉 sign、sign_type 后排序拼接，用支付宝公钥验。 */
export function verifyNotify(cfg: AlipayConfig, params: Record<string, string>): boolean {
  if (!params.sign) return false;
  return rsa2Verify(signContent(params, ["sign", "sign_type"]), params.sign, cfg.alipayPublicKey);
}

export interface TradeStatus {
  /** WAIT_BUYER_PAY / TRADE_SUCCESS / TRADE_FINISHED / TRADE_CLOSED；交易不存在（还没打开收银台）为 NOT_EXIST */
  status: string;
  tradeNo?: string;
  amountFen?: number;
}

/**
 * 同步响应验签：签名覆盖的是 JSON 里 xxx_response 对应的原始字符串（不是重新序列化的）。
 * 返回该段原文；验签失败返回 undefined。
 */
export function verifiedResponse(cfg: AlipayConfig, raw: string, method: string): string | undefined {
  const key = `"${method.replace(/\./g, "_")}_response":`;
  const start = raw.indexOf(key);
  const signAt = raw.lastIndexOf(',"sign":"');
  if (start < 0 || signAt < 0) return undefined;
  const body = raw.slice(start + key.length, signAt);
  const sign = raw.slice(signAt + 9, raw.indexOf('"', signAt + 9));
  return rsa2Verify(body, sign, cfg.alipayPublicKey) ? body : undefined;
}

/** 交易查询（本地开发收不到异步通知时，靠它主动确认支付结果）。 */
export async function tradeQuery(cfg: AlipayConfig, outTradeNo: string): Promise<TradeStatus> {
  const params = commonParams(cfg, "alipay.trade.query", { out_trade_no: outTradeNo });
  params.sign = rsa2Sign(signContent(params), cfg.privateKey);
  const res = await fetch(cfg.gateway, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const raw = await res.text();
  const body = verifiedResponse(cfg, raw, "alipay.trade.query");
  if (!body) throw new Error("支付宝查询结果验签失败");
  const r = JSON.parse(body) as { code?: string; sub_code?: string; trade_status?: string; trade_no?: string; total_amount?: string };
  if (r.code !== "10000") return { status: r.sub_code === "ACQ.TRADE_NOT_EXIST" ? "NOT_EXIST" : `ERROR:${r.sub_code ?? r.code}` };
  return { status: r.trade_status ?? "UNKNOWN", tradeNo: r.trade_no, amountFen: amountToFen(r.total_amount) };
}

export const isPaid = (status: string | undefined) => status === "TRADE_SUCCESS" || status === "TRADE_FINISHED";
