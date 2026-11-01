import * as cheerio from "cheerio";

export interface PageText {
  title: string;
  text: string;
  /** 页面内的链接，供后续发现详情页 */
  links: { text: string; href: string }[];
}

export function htmlToText(html: string, baseUrl: string): PageText {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer").remove();

  const links: PageText["links"] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || !text || href.startsWith("javascript:") || href.startsWith("#")) return;
    try {
      links.push({ text, href: new URL(href, baseUrl).toString() });
    } catch {
      /* 忽略无法解析的链接 */
    }
  });

  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { title: $("title").first().text().trim(), text, links };
}
