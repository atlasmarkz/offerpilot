import type { BoardJob } from "@offerpilot/shared";
import { humanClick, text, waitFor, type ApplyResult, type JobBoardAdapter } from "./types";

/**
 * Boss直聘（www.zhipin.com/web/geek/jobs 职位搜索页）。
 *
 * 选择器参考了 get_jobs（loks666/get_jobs）在 2026-10 用真实页面核对过的结构（只参考页面结构这一事实，代码是自己写的）：
 * 卡片 ul.rec-job-list li.job-card-box，岗位名 a.job-name，公司 span.boss-name，地区 span.company-location，
 * 详情的沟通按钮 a.btn-startchat / a.op-btn-chat，打招呼后弹 .greet-boss-dialog（“留在此页” / “继续沟通”）。
 * 本项目还没在登录后的页面上亲自核对；平台改版时只改这里的 SEL。
 *
 * 注意：列表卡片上的薪资数字用了自定义字体，读出来可能是乱码；乱码时 parseSalary 读不懂，按“不限”处理，不会误杀。
 *
 * 第一期用 Boss 自己设置的打招呼语（Boss App“设置 → 打招呼语”），点完“立即沟通”选“留在此页”。
 * 自定义 / AI 招呼语要点“继续沟通”进聊天页输入（#chat-input）再发送，放在第二期。
 */
export const SEL = {
  card: "ul.rec-job-list li.job-card-box, li.job-card-box, li.job-card-wrapper",
  cardLink: "a[href*='/job_detail/']",
  title: "a.job-name, .job-name",
  salary: ".job-salary, .salary",
  company: "span.boss-name, .boss-name, .company-name",
  city: "span.company-location, .company-location, .job-area",
  tags: "ul.tag-list li, .tag-list li",
  detail: ".job-detail-box, .job-detail-container, .job-detail",
  /** 详情里的“查看更多信息”，带真正的 /job_detail/<id>.html 链接 */
  detailLink: "a.more-job-btn, a[href*='/job_detail/']",
  detailDesc: ".job-sec-text, .desc, .job-detail-body",
  detailTitle: ".job-name, .job-detail-header .name, .name",
  detailSalary: ".info-primary .salary, .job-salary, .salary",
  hrActive: ".boss-active-time, .boss-online-tag, .active-time",
  /** 招聘者的职位（如“人事经理”“猎头顾问”） */
  recruiter: ".boss-info-attr, .boss-title",
  chatBtn: "a.btn-startchat, a.op-btn-chat, .btn-startchat, .op-btn-chat",
  greetDialog: ".greet-boss-dialog",
  dialog: ".greet-boss-dialog, .dialog-container, .boss-dialog",
  nextPage: ".options-pages a:last-child, .ui-icon-arrow-right",
  list: ".job-list-container, .rec-job-list, .job-list-box",
} as const;

/** 安全验证页的地址（get_jobs 实测：密集操作后会被跳到 /web/passport/zp/verify.html 的极验滑块） */
const VERIFY_URL = /\/web\/user\/safe\/verify-slider|\/web\/passport\/zp\/(verify|security)|security-check|_security_check/;
const LIMIT_RE = /(今日|今天)?沟通.{0,6}(已达|达到)上限|次数已用完|明天再来/;
const BLOCK_RE = /安全验证|人机验证|请完成验证|异常访问|账号.{0,4}(异常|受限|封禁)/;

const idFromHref = (href: string | null | undefined): string | undefined => href?.match(/\/job_detail\/([\w-]+?)(?:\.html|$|\?)/)?.[1];

/**
 * 卡片的 id：有 /job_detail/ 链接就用链接里的 id；新版卡片的岗位名可能不是链接，
 * 这时先用“公司|岗位”当临时 id，点开详情后再换成真正的 id（去重以真正的 id 为准）。
 */
function cardKey(card: Element): string | undefined {
  const id = idFromHref(card.querySelector(SEL.cardLink)?.getAttribute("href"));
  if (id) return id;
  const title = text(card.querySelector(SEL.title));
  if (!title) return undefined;
  return `t:${text(card.querySelector(SEL.company))}|${title}`.slice(0, 80);
}

/** 只认“留在此页”这个按钮：同一个弹窗里还有“继续沟通”，点错会跳去聊天页。 */
function stayButton(doc: Document): HTMLElement | null {
  const dlg = doc.querySelector(SEL.greetDialog) ?? doc.querySelector(SEL.dialog);
  if (!dlg) return null;
  return ([...dlg.querySelectorAll<HTMLElement>("a, button, span, div")].find((el) => text(el) === "留在此页") ?? dlg.querySelector<HTMLElement>(".cancel-btn"));
}

export const bossAdapter: JobBoardAdapter = {
  channel: "boss",
  matches: [/^https:\/\/www\.zhipin\.com\/web\/geek\/(jobs|job)/],

  detectBlocker(doc) {
    const url = doc.location?.href ?? "";
    if (VERIFY_URL.test(url)) return "Boss 要求安全验证";
    if (/\/web\/user\/?(\?|$)/.test(url)) return "Boss 登录已失效，请重新登录";
    if (doc.querySelector(".geetest_panel, .geetest_holder, .geetest_success_correct, #captcha, [class*=verify-slider], .wrap-verify-slider"))
      return "页面出现了验证码";
    const body = text(doc.querySelector(".dialog-container, .boss-dialog, .verify-wrap, .error-content"));
    if (BLOCK_RE.test(body)) return body.slice(0, 60);
    return null;
  },

  listJobs(doc) {
    const out: BoardJob[] = [];
    for (const card of doc.querySelectorAll(SEL.card)) {
      const id = cardKey(card);
      const title = text(card.querySelector(SEL.title));
      // 旧版 li.job-card-wrapper 和新版 li.job-card-box 可能嵌套，两层都会命中，按 id 去重
      if (!id || !title || out.some((j) => j.externalId === id)) continue;
      const href = card.querySelector(SEL.cardLink)?.getAttribute("href");
      out.push({
        channel: "boss",
        externalId: id,
        title,
        company: text(card.querySelector(SEL.company)),
        city: text(card.querySelector(SEL.city)) || undefined,
        salary: text(card.querySelector(SEL.salary)) || undefined,
        tags: [...card.querySelectorAll(SEL.tags)].map((t) => text(t)).filter(Boolean),
        url: href ? new URL(href, "https://www.zhipin.com").href.split("?")[0]! : "",
      });
    }
    return out;
  },

  async openJob(doc, job) {
    const card = [...doc.querySelectorAll(SEL.card)].find((c) => cardKey(c) === job.externalId);
    if (!card) return job;
    card.scrollIntoView?.({ block: "center" });
    humanClick(card);
    // 右侧详情会换成这个职位：标题对上了才读
    const detail = await waitFor(() => {
      const d = doc.querySelector(SEL.detail);
      return d && text(d.querySelector(SEL.detailTitle)).includes(job.title.slice(0, 6)) ? d : null;
    }, 6000);
    if (!detail) return job;
    const href = detail.querySelector(SEL.detailLink)?.getAttribute("href");
    const realId = idFromHref(href);
    return {
      ...job,
      externalId: realId ?? job.externalId,
      url: realId && href ? new URL(href, "https://www.zhipin.com").href.split("?")[0]! : job.url,
      salary: text(detail.querySelector(SEL.detailSalary)) || job.salary,
      description: text(detail.querySelector(SEL.detailDesc)) || job.description,
      hrActive: text(detail.querySelector(SEL.hrActive)) || job.hrActive,
      recruiter: text(detail.querySelector(SEL.recruiter)) || job.recruiter,
    };
  },

  async apply(doc): Promise<ApplyResult> {
    const detail = doc.querySelector(SEL.detail) ?? doc;
    const btn = detail.querySelector<HTMLElement>(SEL.chatBtn);
    if (!btn) return { kind: "failed", text: "没找到“立即沟通”按钮" };
    const label = text(btn);
    if (/继续沟通/.test(label)) return { kind: "already" };
    if (!/立即沟通|沟通/.test(label)) return { kind: "failed", text: `沟通按钮的文字不认识：${label.slice(0, 20)}` };
    humanClick(btn);

    // 点完会弹“已向BOSS发送消息”（留在此页 / 继续沟通），或者弹上限 / 验证提示
    const outcome = await waitFor<ApplyResult>(() => {
      const blocker = bossAdapter.detectBlocker(doc);
      if (blocker) return { kind: "blocked", text: blocker };
      const t = text(doc.querySelector(SEL.greetDialog)) || text(doc.querySelector(SEL.dialog));
      if (LIMIT_RE.test(t)) return { kind: "limit", text: t.slice(0, 60) };
      if (BLOCK_RE.test(t)) return { kind: "blocked", text: t.slice(0, 60) };
      if (/已向.{0,6}发送|发送成功|已发送|留在此页/.test(t)) return { kind: "sent" };
      if (/继续沟通/.test(text(detail.querySelector(SEL.chatBtn)))) return { kind: "sent" };
      return null;
    }, 8000);
    // 关掉弹窗，留在列表页继续（不点“继续沟通”，那会跳去聊天页）
    const stay = stayButton(doc);
    if (stay) humanClick(stay);
    return outcome ?? { kind: "failed", text: "点了“立即沟通”但页面没有反应" };
  },

  async nextPage(doc) {
    const before = doc.querySelectorAll(SEL.card).length;
    const first = doc.querySelector(SEL.card);
    const firstId = first ? cardKey(first) : undefined;
    const next = doc.querySelector<HTMLElement>(SEL.nextPage);
    const nextLink = next?.closest("a") ?? next;
    if (nextLink && !/disabled/.test(nextLink.className)) {
      humanClick(nextLink);
    } else {
      // 新版是滚动加载：滚到列表底部
      const list = doc.querySelector(SEL.list) as HTMLElement | null;
      if (list) list.scrollTop = list.scrollHeight;
      doc.defaultView?.scrollTo(0, doc.body.scrollHeight);
    }
    const grew = await waitFor(() => {
      const cards = doc.querySelectorAll(SEL.card);
      // 翻页：第一张卡换了；滚动加载：卡片变多
      return cards.length > before || (cards.length > 0 && cardKey(cards[0]!) !== firstId);
    }, 8000);
    return !!grew;
  },
};
