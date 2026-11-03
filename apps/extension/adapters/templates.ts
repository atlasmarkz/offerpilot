/**
 * 投递站点模板：主流招聘系统（飞书招聘、Moka、北森……）和常见 UI 组件库的表单结构基本固定，
 * 填写前先识别当前页面属于哪个模板，再用该模板的“表单项容器 / 自定义下拉”写法去找字段、选选项。
 * 识别不到专用模板就退回按组件库（Ant Design / Element / Arco）或原生表单处理。
 */
export interface SiteTemplate {
  id: string;
  name: string;
  /** 页面地址命中其一，记 3 分 */
  hosts: RegExp[];
  /** 页面里出现这些选择器，每个记 1 分 */
  fingerprint: string[];
  /** 表单项容器：标签通常是它里面的 label / 标题节点 */
  itemSelector?: string;
  /** 自定义下拉：点哪里展开、选项长什么样 */
  select?: { opener: string; option: string };
}

const ANY_OPTION = "[role=option]";

export const TEMPLATES: SiteTemplate[] = [
  {
    id: "feishu",
    name: "飞书招聘",
    // 字节、蔚来、小米（jobs.f.mioffice.cn 是飞书招聘的白标域名）、得物（poizon）、商汤、小鹏等都是飞书招聘的租户
    hosts: [/(^|\.)jobs\.feishu\.cn/, /(^|\.)jobs\.f\.mioffice\.cn/, /(^|\.)jobs\.bytedance\.com/, /(^|\.)job\.toutiao\.com/, /(^|\.)feishu\.cn\/.*hire/, /(^|\.)larkoffice\.com/],
    fingerprint: ["[class*=ud__form]", "[class*=ud__select]", "[class*=ud-formily]", "script[src*=feishucdn]"],
    // 实测（蔚来校招简历编辑页）：表单项是 Formily 的 .ud-formily-item，标签在 .ud-formily-item-label；
    // 教育/实习/项目等可重复区块是 .apply-form-array-card，区块标题在 .applyFormModuleWrapper-title
    itemSelector: ".ud-formily-item, [class*=ud__form__item]",
    select: { opener: "[class*=ud__select__selector]", option: `[class*=ud__select__option], ${ANY_OPTION}` },
  },
  {
    id: "moka",
    name: "Moka 招聘",
    hosts: [/(^|\.)mokahr\.com/, /(^|\.)moka\.(com|cn)/],
    fingerprint: ["[class*=moka]", "[class*=mokaForm]"],
    itemSelector: "[class*=form-item], [class*=FormItem], [class*=moka-form]",
    select: { opener: "[class*=select]", option: `[class*=option], ${ANY_OPTION}` },
  },
  {
    id: "beisen",
    name: "北森招聘",
    hosts: [/(^|\.)zhiye\.com/, /(^|\.)italent\.(cn|com)/, /(^|\.)beisen\.com/],
    fingerprint: ["[class*=beisen]", "[class*=bs-form]", "[class*=resume-form]"],
    itemSelector: "[class*=form-item], [class*=form_item], [class*=field-item]",
    select: { opener: "[class*=select]", option: `[class*=option], ${ANY_OPTION}` },
  },
  {
    id: "hotjob",
    name: "大易招聘",
    // 荣耀的 career.honor.com 会跳转到 wecruit*.hotjob.cn
    hosts: [/(^|\.)hotjob\.cn/, /(^|\.)dayee\.com/],
    fingerprint: [],
    itemSelector: "[class*=form-item], [class*=field]",
  },
  {
    id: "workday",
    name: "Workday",
    hosts: [/(^|\.)myworkdayjobs\.com/, /(^|\.)workday\.com/],
    fingerprint: ["[data-automation-id]"],
    itemSelector: "[data-automation-id*=formField], [data-automation-id*=Section]",
    select: { opener: "[aria-haspopup=listbox], [data-automation-id*=select]", option: `[data-automation-id=promptOption], ${ANY_OPTION}` },
  },
  {
    id: "greenhouse",
    name: "Greenhouse / Lever",
    hosts: [/(^|\.)greenhouse\.io/, /(^|\.)lever\.co/, /(^|\.)ashbyhq\.com/],
    fingerprint: ["#application_form", ".application-form", "[class*=application-question]"],
    itemSelector: ".field, .application-question, [class*=application-field]",
  },
  {
    id: "arco",
    name: "Arco Design 表单",
    hosts: [/(^|\.)jobs\.tiktok\.com/],
    fingerprint: ["[class*=arco-form]", "[class*=arco-select]"],
    itemSelector: "[class*=arco-form-item]",
    select: { opener: "[class*=arco-select-view]", option: `[class*=arco-select-option], ${ANY_OPTION}` },
  },
  {
    id: "antd",
    name: "Ant Design 表单",
    hosts: [],
    fingerprint: [".ant-form", ".ant-form-item", ".ant-select"],
    itemSelector: ".ant-form-item",
    select: { opener: ".ant-select-selector, .ant-select", option: `.ant-select-item-option, ${ANY_OPTION}` },
  },
  {
    id: "element",
    name: "Element 表单",
    hosts: [],
    fingerprint: [".el-form", ".el-form-item", ".el-select"],
    itemSelector: ".el-form-item",
    select: { opener: ".el-select, .el-input", option: `.el-select-dropdown__item, ${ANY_OPTION}` },
  },
];

/** 识别不出专用模板时用：原生 HTML 表单，按 label / 邻近文字找字段。 */
export const NATIVE_TEMPLATE: SiteTemplate = { id: "native", name: "通用表单", hosts: [], fingerprint: [] };

export interface Detection {
  template: SiteTemplate;
  /** 0 表示没有任何证据，只是兜底 */
  score: number;
}

/** 给每个模板打分（域名 3 分 + 每个特征 1 分），取最高分；一分都没有就用通用模板。 */
export function detectTemplate(doc: Document, url = doc.defaultView?.location.href ?? ""): Detection {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    /* 非法地址就只看页面特征 */
  }
  let best: Detection = { template: NATIVE_TEMPLATE, score: 0 };
  for (const t of TEMPLATES) {
    let score = t.hosts.some((re) => re.test(host) || re.test(url)) ? 3 : 0;
    for (const sel of t.fingerprint) {
      try {
        if (doc.querySelector(sel)) score++;
      } catch {
        /* 个别选择器在老浏览器里不合法，忽略 */
      }
    }
    if (score > best.score) best = { template: t, score };
  }
  return best;
}
