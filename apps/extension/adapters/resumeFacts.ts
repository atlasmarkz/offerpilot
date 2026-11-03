import type { ResumeData } from "@offerpilot/shared";
import type { Extras } from "./formFill";

/**
 * 在线简历里的联系方式 -> 填表用的字段值。用户在弹窗里手动补充的值优先于这里，所以调用方要把手动补充的放在后面覆盖。
 */
export function resumeExtras(resume: ResumeData | undefined): Extras {
  const c = resume?.contact;
  if (!c) return {};
  const out: Extras = {};
  const put = (key: string, v: string | undefined) => {
    if (v?.trim()) out[key] = v.trim();
  };
  put("姓名", c.name);
  put("手机", c.phone);
  put("邮箱", c.email);
  put("现居城市", c.city);
  return out;
}
