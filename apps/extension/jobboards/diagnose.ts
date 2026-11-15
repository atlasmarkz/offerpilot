import { SEL, bossAdapter } from "./boss";
import { text } from "./types";

/**
 * 招聘平台页面结构诊断：用来校准适配器的选择器。
 * 只收页面骨架（标签、类名、链接形状）和少量界面用语（如“立即沟通”“刚刚活跃”），
 * 其余文字一律换成“«n字»”，所以不会带出你的姓名、HR 姓名或聊天内容。只复制到剪贴板，由你决定发给谁。
 */
export interface BoardStructureReport {
  kind: "job-board";
  url: string;
  /** 每个选择器在页面上命中几个 */
  hits: Record<string, number>;
  /** 前两张职位卡片的骨架 */
  cards: string[];
  /** 右侧详情的骨架 */
  detail: string;
  /** 详情里的按钮、链接文字（界面用语） */
  buttons: string[];
  /** 页面上出现的弹窗类名 */
  dialogs: string[];
  /** 适配器现在能读出来的前 3 个职位（只给是否读到，不给内容） */
  parsed: { hasId: boolean; realId: boolean; title: number; company: number; salary: string; city: boolean; tags: number }[];
  blocker: string | null;
}

/** 允许原样保留的界面用语；其余文字只给长度。 */
const UI_WORDS = /^(立即沟通|继续沟通|留在此页|查看更多信息|收藏|已收藏|举报|分享|职位描述|职位详情|工作地址|公司信息|刚刚活跃|今日活跃|\d日内活跃|本周活跃|本月活跃|半年前活跃|\d+年前活跃|在线|上一页|下一页|滚动加载更多|已向BOSS发送消息|发送|感兴趣|微信扫码分享|在校\/应届|实习|本科|硕士|博士|大专|经验不限|学历不限)$/;

function mask(t: string): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return UI_WORDS.test(s) ? s : `«${s.length}字»`;
}

function hrefShape(href: string | null): string {
  if (!href) return "";
  return href.replace(/\?.*$/, "?…").replace(/\/job_detail\/[\w-]+/, "/job_detail/{id}").replace(/\/gongsi\/[\w-]+/, "/gongsi/{id}");
}

/** 元素骨架：tag.class，链接给形状，叶子文字按 mask 处理；限制深度和子节点数。 */
export function sketch(el: Element | null, depth = 0, maxDepth = 7): string {
  if (!el) return "";
  const pad = "  ".repeat(depth);
  const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 4).join(".")}` : "";
  const href = el.tagName === "A" ? ` href=${hrefShape(el.getAttribute("href"))}` : "";
  const kids = [...el.children].filter((c) => !/^(SCRIPT|STYLE|SVG|svg|IMG|path)$/.test(c.tagName));
  if (!kids.length || depth >= maxDepth) {
    const t = mask(text(el));
    return `${pad}${el.tagName.toLowerCase()}${cls}${href}${t ? ` "${t}"` : ""}`;
  }
  const lines = [`${pad}${el.tagName.toLowerCase()}${cls}${href}`];
  for (const c of kids.slice(0, 14)) lines.push(sketch(c, depth + 1, maxDepth));
  if (kids.length > 14) lines.push(`${pad}  …还有 ${kids.length - 14} 个`);
  return lines.join("\n");
}

export function collectBoardStructure(doc: Document, url: string): BoardStructureReport {
  let shown = url;
  try {
    const u = new URL(url);
    shown = `${u.origin}${u.pathname}`;
  } catch {
    /* 保持原样 */
  }
  const hits = Object.fromEntries(Object.entries(SEL).map(([k, sel]) => [k, doc.querySelectorAll(sel).length]));
  const detail = doc.querySelector(SEL.detail);
  const parsed = bossAdapter
    .listJobs(doc)
    .slice(0, 3)
    .map((j) => ({
      hasId: !!j.externalId,
      realId: !j.externalId.startsWith("t:"),
      title: j.title.length,
      company: j.company.length,
      // 薪资只给“像不像正常数字”，用来判断是不是自定义字体乱码
      salary: j.salary ? (/\d/.test(j.salary) ? "有数字" : `无数字(${j.salary.length}字)`) : "无",
      city: !!j.city,
      tags: j.tags?.length ?? 0,
    }));
  return {
    kind: "job-board",
    url: shown,
    hits,
    cards: [...doc.querySelectorAll(SEL.card)].slice(0, 2).map((c) => sketch(c)),
    detail: sketch(detail, 0, 6).slice(0, 6000),
    buttons: detail ? [...detail.querySelectorAll("a, button")].map((b) => mask(text(b))).filter(Boolean).slice(0, 30) : [],
    dialogs: [...doc.querySelectorAll("[class*=dialog], [class*=modal]")].map((d) => (typeof d.className === "string" ? d.className : "")).slice(0, 10),
    parsed,
    blocker: bossAdapter.detectBlocker(doc),
  };
}
