/** 公司展示名；没登记的直接显示 companyId。 */
export const COMPANY_NAMES: Record<string, string> = {
  bytedance: "字节跳动",
  tencent: "腾讯",
  meituan: "美团",
  jd: "京东",
  netease: "网易",
  bilibili: "哔哩哔哩",
  xiaohongshu: "小红书",
  mihoyo: "米哈游",
  ctrip: "携程",
  xiaomi: "小米",
  nio: "蔚来",
  minimax: "MiniMax",
  tonghuashun: "同花顺",
  janestreet: "Jane Street",
};

export const companyName = (id: string) => COMPANY_NAMES[id] ?? id;

/** 按公司 id 生成稳定的色相，用来给公司标签上色，一眼能区分。 */
export function companyHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
