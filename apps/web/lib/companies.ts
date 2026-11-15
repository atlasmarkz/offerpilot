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
  alibaba: "阿里巴巴",
  pdd: "拼多多",
  oppo: "OPPO",
  dewu: "得物",
  sensetime: "商汤科技",
  iflytek: "科大讯飞",
  // 车企
  lixiang: "理想汽车",
  xpeng: "小鹏汽车",
  momenta: "Momenta",
  leapmotor: "零跑汽车",
  changan: "长安汽车",
  // 硬件制造
  bambulab: "拓竹科技",
  vivo: "vivo",
  sany: "三一集团",
  // 芯片半导体
  mthreads: "摩尔线程",
  ymtc: "长江存储",
  cxmt: "长鑫存储",
  // 国央企、金融
  chinalife: "中国人寿",
  picc: "中国人保",
  cnnc: "中核集团",
  cmhk: "招商局集团",
  cicc: "中金公司",
};

export const companyName = (id: string) => COMPANY_NAMES[id] ?? id;

/** 按公司 id 生成稳定的色相，用来给公司标签上色，一眼能区分。 */
export function companyHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
