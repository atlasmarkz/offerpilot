import { describe, expect, it } from "vitest";
import { PLANS, PRODUCTS, productOf, yuan } from "./plans";

describe("pricing catalog", () => {
  it("has the agreed prices (in fen)", () => {
    expect(Object.fromEntries(PRODUCTS.map((p) => [p.id, p.priceFen]))).toEqual({
      "basic-month": 990,
      "basic-season": 2490,
      "plus-month": 1990,
      "plus-season": 4900,
      "pro-month": 3900,
      "pro-season": 9900,
      "credits-20": 490,
    });
  });

  it("gives a season pass 90 days and three months of quota", () => {
    expect(productOf("plus-month")).toMatchObject({ kind: "subscription", plan: "plus", days: 30, units: PLANS.plus.monthlyQuota });
    expect(productOf("plus-season")).toMatchObject({ days: 90, units: PLANS.plus.monthlyQuota * 3 });
    expect(productOf("credits-20")).toMatchObject({ kind: "credits", units: 20 });
    expect(productOf("free-month")).toBeUndefined();
    expect(productOf(undefined)).toBeUndefined();
  });

  it("formats yuan without trailing zeros", () => {
    expect([990, 2490, 4900, 490, 10000, 1050].map(yuan)).toEqual(["9.9", "24.9", "49", "4.9", "100", "10.5"]);
  });
});
