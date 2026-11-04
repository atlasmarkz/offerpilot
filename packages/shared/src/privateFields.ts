/**
 * 个人隐私信息的字段目录：这些信息【只保存在用户自己的浏览器里】，不上传到我们的服务器，也不发给大模型。
 * 填写投递表单时由浏览器扩展在本机读取并填入；网页端只负责让用户在本机录入，再直接交给扩展。
 *
 * 目录来自真实投递页（飞书招聘、网易校招等）上出现的字段，遇到新网站新字段时在这里补充。
 * key 同时是：网页里的字段名、扩展本地存储的键、识别页面控件时对应的字段。
 */
export interface PrivateField {
  key: string;
  /** 输入提示 */
  hint: string;
  /** 有固定选项时用下拉 */
  options?: string[];
  /** 页面上的标签命中这个正则，就认为是这个字段 */
  label: RegExp;
  /** 标签里出现这些词就不是这个字段（如“学校邮箱”不是邮箱） */
  not?: RegExp;
  group: "身份" | "联系" | "其他";
}

export const PRIVATE_FIELDS: PrivateField[] = [
  { key: "姓名", hint: "真实姓名", group: "身份", label: /姓名|^name$/i, not: /用户名|公司|学校|昵称|紧急|联系人|导师|家长|推荐/ },
  { key: "性别", hint: "", options: ["男", "女"], group: "身份", label: /性别|gender/i },
  { key: "出生日期", hint: "如 2002-05-20", group: "身份", label: /出生(日期|年月|时间)|生日|date of birth|birth/i },
  { key: "证件类型", hint: "", options: ["居民身份证", "护照", "港澳居民来往内地通行证", "台湾居民来往大陆通行证"], group: "身份", label: /证件类型/ },
  { key: "证件号码", hint: "身份证号等，只存本机", group: "身份", label: /证件(号码|号|信息)|身份证(号|号码)?|id ?number/i, not: /类型|有效期|照片|扫描/ },
  { key: "民族", hint: "如 汉族", group: "身份", label: /民族/ },
  { key: "政治面貌", hint: "", options: ["中共党员", "中共预备党员", "共青团员", "群众"], group: "身份", label: /政治面貌|political/i },
  { key: "籍贯", hint: "如 浙江杭州", group: "身份", label: /籍贯|户籍|户口|hukou/i, not: /类型|性质/ },
  { key: "手机", hint: "11 位手机号", group: "联系", label: /手机|电话|mobile|\bphone\b|\btel\b/i, not: /验证码|紧急|家长|父母|监护|座机|传真|联系人/ },
  { key: "邮箱", hint: "常用邮箱", group: "联系", label: /邮箱|e-?mail/i, not: /学校|院校|验证码|紧急|家长/ },
  { key: "微信号", hint: "微信号", group: "联系", label: /微信|wechat/i },
  { key: "现居城市", hint: "如 北京", group: "联系", label: /现居|居住(地|城市)|所在城市|current city/i, not: /学校|公司|户籍/ },
  { key: "家庭住址", hint: "详细住址", group: "联系", label: /家庭(住址|地址|所在地)|通讯地址|联系地址|现住址|详细地址/ },
  { key: "个人链接", hint: "GitHub、博客等，每行一个", group: "其他", label: /github|博客|个人(主页|网站)|作品链接/i },
  { key: "紧急联系人", hint: "姓名", group: "其他", label: /紧急联系人(姓名)?$|家长姓名|监护人(姓名)?$/ },
  { key: "紧急联系人电话", hint: "电话", group: "其他", label: /紧急联系(人)?(电话|手机)|家长(电话|手机)|监护人(电话|手机)/ },
];

export type PrivateInfo = Record<string, string>;

const KEYS = new Set(PRIVATE_FIELDS.map((f) => f.key));
const MAX_VALUE = 200;

/** 不可信输入（本地存储、网页发来的消息）逐项校验：只收目录里有的字段，值是不超长的字符串。 */
export function normalizePrivateInfo(raw: unknown): PrivateInfo {
  const out: PrivateInfo = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (KEYS.has(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, MAX_VALUE);
  }
  return out;
}

/** 页面控件的标签对应目录里的哪个字段（没有对应的返回 undefined）。 */
export function privateFieldFor(label: string): PrivateField | undefined {
  return PRIVATE_FIELDS.find((f) => f.label.test(label) && !(f.not && f.not.test(label)));
}
