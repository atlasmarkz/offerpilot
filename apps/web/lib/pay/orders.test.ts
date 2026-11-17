import { productOf } from "@offerpilot/shared";
import { describe, expect, it } from "vitest";
import { orderIdOf, outTradeNoOf, paymentConfig, purchaseBlocked } from "./orders";

const now = new Date("2026-11-16T00:00:00Z");

describe("purchaseBlocked", () => {
  const future = "2026-12-01T00:00:00Z";
  const past = "2026-11-01T00:00:00Z";
  it("blocks buying a lower plan while a higher one is active", () => {
    expect(purchaseBlocked(productOf("basic-month")!, { plan: "plus", periodEnd: future }, now)).toContain("会员等级更高");
  });
  it("allows renewing, upgrading, buying after expiry, and credit packs anytime", () => {
    expect(purchaseBlocked(productOf("plus-season")!, { plan: "plus", periodEnd: future }, now)).toBeUndefined();
    expect(purchaseBlocked(productOf("pro-month")!, { plan: "plus", periodEnd: future }, now)).toBeUndefined();
    expect(purchaseBlocked(productOf("basic-month")!, { plan: "pro", periodEnd: past }, now)).toBeUndefined();
    expect(purchaseBlocked(productOf("credits-20")!, { plan: "pro", periodEnd: future }, now)).toBeUndefined();
    expect(purchaseBlocked(productOf("basic-month")!, { plan: "free" }, now)).toBeUndefined();
  });
});

describe("out_trade_no", () => {
  it("round-trips order ids and rejects anything else", () => {
    const id = "0f8b643d-e23b-44f4-b49b-c0088a3cb86a";
    expect(outTradeNoOf(id)).toBe("0f8b643de23b44f4b49bc0088a3cb86a");
    expect(orderIdOf(outTradeNoOf(id))).toBe(id);
    expect(orderIdOf("1 or 1=1")).toBeUndefined();
    expect(orderIdOf(undefined)).toBeUndefined();
  });
});

describe("paymentConfig", () => {
  it("is off unless billing, the payment switch and alipay keys are all set", () => {
    expect(paymentConfig({})).toBeUndefined();
    expect(paymentConfig({ BILLING_ENABLED: "1", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k", PAYMENT_ENABLED: "1" })).toBeUndefined();
    expect(
      paymentConfig({ BILLING_ENABLED: "1", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k", PAYMENT_ENABLED: "1", ALIPAY_APP_ID: "1", ALIPAY_PRIVATE_KEY: "bad", ALIPAY_PUBLIC_KEY: "bad" }),
    ).toBeUndefined(); // 密钥坏了也当作没开通，不让页面报错
  });
});
