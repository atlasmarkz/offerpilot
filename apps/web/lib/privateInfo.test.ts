import { normalizePrivateInfo, privateFieldFor } from "@offerpilot/shared";
import { describe, expect, it } from "vitest";
import { contactToInfo, infoToContact } from "./privateInfo";

describe("private info", () => {
  it("only keeps catalogued fields with short string values", () => {
    const info = normalizePrivateInfo({ 手机: " 13800000000 ", 证件号码: "x".repeat(500), 乱七八糟: "忽略", 邮箱: 5, 性别: "" });
    expect(info["手机"]).toBe("13800000000");
    expect(info["证件号码"]).toHaveLength(200);
    expect(Object.keys(info).sort()).toEqual(["手机", "证件号码"]);
    expect(normalizePrivateInfo("nope")).toEqual({});
  });

  it("maps page labels to catalogue fields without mixing up similar ones", () => {
    expect(privateFieldFor("手机号码")?.key).toBe("手机");
    expect(privateFieldFor("紧急联系人电话")?.key).toBe("紧急联系人电话");
    expect(privateFieldFor("证件类型")?.key).toBe("证件类型");
    expect(privateFieldFor("证件号码")?.key).toBe("证件号码");
    expect(privateFieldFor("学校邮箱")).toBeUndefined();
    expect(privateFieldFor("毕业院校")).toBeUndefined();
  });

  it("round-trips the contact block used by the resume preview", () => {
    const contact = { name: "张三", phone: "13800000000", email: "a@b.c", city: "杭州", links: ["https://x.y", "https://z.w"] };
    expect(infoToContact(contactToInfo(contact))).toEqual(contact);
    expect(infoToContact({}).links).toEqual([]);
  });
});
