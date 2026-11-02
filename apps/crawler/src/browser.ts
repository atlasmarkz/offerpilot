import { chromium, type Browser, type Page } from "playwright-core";
import { acquire } from "./fetch";
import { htmlToText, type PageText } from "./html";

export interface RenderedPage extends PageText {
  /** 页面加载期间捕获到的、疑似岗位数据的 JSON 响应 */
  jsonPayloads: { url: string; body: string }[];
}

/** 只看路径：岗位类接口；配置、登录、定位等噪声接口排除。 */
const JOB_PATH = /position|\/jobs?\b|\/posts?\b|recruit|campus|vacanc/i;
const NOISE_PATH = /config|setting|login|csrf|location|notice|mapping|city|cities|token|track|log/i;
const MAX_JSON_CHARS = 20000;

function isJobPayloadUrl(url: string): boolean {
  const { pathname } = new URL(url);
  return JOB_PATH.test(pathname) && !NOISE_PATH.test(pathname);
}

let browserPromise: Promise<Browser> | undefined;

/** 使用本机已安装的 Chrome，避免额外下载浏览器；你自己的 Chrome 配置不会被使用。 */
function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ channel: "chrome", headless: true });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) await (await browserPromise).close().catch(() => {});
  browserPromise = undefined;
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch {
    // 偶发网络超时，重试一次
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

/**
 * 打开页面并交给回调处理（可在回调里翻页、点击）。
 * 先检查 robots.txt 并限速；不处理登录、验证码。
 */
export async function withPage<T>(
  urlStr: string,
  fn: (page: Page) => Promise<T>,
  opts: { beforeNavigate?: (page: Page) => void } = {},
): Promise<T> {
  await acquire(new URL(urlStr));
  const context = await (await getBrowser()).newContext({ locale: "zh-CN" });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    opts.beforeNavigate?.(page);
    await gotoWithRetry(page, urlStr);
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * 渲染 JS 页面并返回正文、链接，以及加载过程中的 JSON 响应。
 * 用于没有专用适配器的站点：把页面文字和捕获到的 JSON 一起交给大模型抽取。
 */
export async function renderPage(urlStr: string, opts: { settleMs?: number } = {}): Promise<RenderedPage> {
  const jsonPayloads: RenderedPage["jsonPayloads"] = [];
  return withPage(
    urlStr,
    async (page) => {
      await page.waitForTimeout(opts.settleMs ?? 1500);
      return { ...htmlToText(await page.content(), page.url()), jsonPayloads };
    },
    {
      beforeNavigate: (page) =>
        page.on("response", async (res) => {
          try {
            if (!(res.headers()["content-type"] ?? "").includes("json")) return;
            if (!isJobPayloadUrl(res.url()) || jsonPayloads.some((p) => p.url === res.url())) return;
            jsonPayloads.push({ url: res.url(), body: (await res.text()).slice(0, MAX_JSON_CHARS) });
          } catch {
            /* 响应体不可读（如重定向）时忽略 */
          }
        }),
    },
  );
}
