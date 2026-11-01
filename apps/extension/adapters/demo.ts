import { setInputValue, type SiteAdapter } from "./types";

/** 示例适配器：按 name 属性填基础信息，用于验证整条链路。真实站点参照它新增。 */
export const demoAdapter: SiteAdapter = {
  id: "demo",
  matches: [/localhost/, /example\.com\/apply/],

  detectBlocker(doc) {
    return doc.querySelector("[class*=captcha], iframe[src*=captcha]") ? "页面出现验证码，请手动完成" : null;
  },

  async fill(doc, profile) {
    const blocker = this.detectBlocker(doc);
    const filled: string[] = [];
    const fields: Record<string, string> = {
      name: profile.name,
      school: profile.school,
      major: profile.major,
    };
    for (const [key, value] of Object.entries(fields)) {
      const el = doc.querySelector<HTMLInputElement>(`input[name="${key}"]`);
      if (el) {
        setInputValue(el, value);
        filled.push(key);
      }
    }
    if (blocker) return { status: "needs_user", reason: blocker, filledFields: filled };
    return { status: "filled", filledFields: filled };
  },
};
