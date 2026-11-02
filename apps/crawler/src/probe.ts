import { closeBrowser, renderPage } from "./browser";

/** 用法: npm run probe -w @offerpilot/crawler -- <url>  查看某个页面渲染后能拿到什么。 */
const url = process.argv[2];
if (!url) {
  console.log("用法: probe <url>");
  process.exit(1);
}

try {
  const page = await renderPage(url);
  console.log(`标题: ${page.title}`);
  console.log(`正文 ${page.text.length} 字，链接 ${page.links.length} 个，疑似岗位 JSON ${page.jsonPayloads.length} 个`);
  console.log("--- 正文前 300 字 ---\n" + page.text.slice(0, 300));
  console.log("--- 链接 ---\n" + page.links.slice(0, 12).map((l) => `${l.text} -> ${l.href}`).join("\n"));
  for (const p of page.jsonPayloads.slice(0, 6)) {
    console.log(`--- JSON ${p.url}\n${p.body.slice(0, 300)}`);
  }
} catch (e) {
  console.error(`失败: ${(e as Error).message}`);
} finally {
  await closeBrowser();
}
