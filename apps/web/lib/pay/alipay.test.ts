import { createVerify, generateKeyPairSync, type KeyExportOptions, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  alipayConfig,
  alipayTimestamp,
  amountToFen,
  fenToAmount,
  pagePayUrl,
  rsa2Sign,
  signContent,
  verifiedResponse,
  verifyNotify,
  type AlipayConfig,
} from "./alipay";

// 测试用的两对密钥：一对当“应用”，一对当“支付宝”
const app = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ali = generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = (k: KeyObject, type: "pkcs8" | "spki") => (k.export({ type, format: "pem" } as KeyExportOptions<"pem">) as string).replace(/-----[^-]+-----|\s/g, "");

const cfg: AlipayConfig = alipayConfig({
  ALIPAY_APP_ID: "2021000000000000",
  ALIPAY_PRIVATE_KEY: b64(app.privateKey, "pkcs8"), // 不带 PEM 头，和支付宝密钥工具导出的一样
  ALIPAY_PUBLIC_KEY: b64(ali.publicKey, "spki"),
})!;

describe("signContent", () => {
  it("sorts keys, drops sign and empty values", () => {
    expect(signContent({ b: "2", a: "1", sign: "x", c: "", d: undefined })).toBe("a=1&b=2");
    expect(signContent({ a: "1", sign: "x", sign_type: "RSA2" }, ["sign", "sign_type"])).toBe("a=1");
  });
});

describe("amounts and time", () => {
  it("converts between fen and alipay amount strings", () => {
    expect([990, 4900, 1].map(fenToAmount)).toEqual(["9.90", "49.00", "0.01"]);
    expect(["9.90", "49", "0.01"].map(amountToFen)).toEqual([990, 4900, 1]);
    expect(amountToFen("9.999")).toBeNaN();
    expect(amountToFen(undefined)).toBeNaN();
  });
  it("formats Beijing time", () => {
    expect(alipayTimestamp(new Date("2026-11-16T02:03:04Z"))).toBe("2026-11-16 10:03:04");
  });
});

describe("pagePayUrl", () => {
  it("builds a signed request the app public key can verify", () => {
    const url = new URL(
      pagePayUrl(cfg, { outTradeNo: "ord1", amountFen: 1990, subject: "Plus 月付", returnUrl: "https://x.test/account?order=ord1", notifyUrl: "https://x.test/api/pay/notify/alipay" }, new Date("2026-11-16T00:00:00Z")),
    );
    const p = Object.fromEntries(url.searchParams);
    expect(url.origin + url.pathname).toBe("https://openapi-sandbox.dl.alipaydev.com/gateway.do");
    expect(JSON.parse(p.biz_content!)).toMatchObject({ out_trade_no: "ord1", total_amount: "19.90", product_code: "FAST_INSTANT_TRADE_PAY" });
    expect(p.method).toBe("alipay.trade.page.pay");
    expect(createVerify("RSA-SHA256").update(signContent(p)).verify(app.publicKey, p.sign!, "base64")).toBe(true);
  });
});

describe("verifyNotify", () => {
  const notify = { out_trade_no: "ord1", trade_status: "TRADE_SUCCESS", total_amount: "19.90", app_id: "2021000000000000", trade_no: "2026111622001" };
  const signed = { ...notify, sign_type: "RSA2", sign: rsa2Sign(signContent(notify, ["sign", "sign_type"]), ali.privateKey) };

  it("accepts a notification signed by alipay", () => {
    expect(verifyNotify(cfg, signed)).toBe(true);
  });
  it("rejects tampered amounts, wrong signers, and missing signatures", () => {
    expect(verifyNotify(cfg, { ...signed, total_amount: "0.01" })).toBe(false);
    expect(verifyNotify(cfg, { ...notify, sign: rsa2Sign(signContent(notify, ["sign", "sign_type"]), app.privateKey) })).toBe(false);
    expect(verifyNotify(cfg, notify)).toBe(false);
  });
});

describe("verifiedResponse", () => {
  it("verifies the raw response segment, not a re-serialisation", () => {
    const body = '{"code":"10000","msg":"Success","trade_status":"TRADE_SUCCESS","total_amount":"19.90","trade_no":"T1"}';
    const raw = `{"alipay_trade_query_response":${body},"sign":"${rsa2Sign(body, ali.privateKey)}"}`;
    expect(verifiedResponse(cfg, raw, "alipay.trade.query")).toBe(body);
    expect(verifiedResponse(cfg, raw.replace("19.90", "0.01"), "alipay.trade.query")).toBeUndefined();
  });
});
