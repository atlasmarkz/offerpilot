import { closeBrowser, withPage } from "./browser";

/**
 * 用法: npm run discover -w @offerpilot/crawler -- <url>
 * 打开页面，列出疑似“岗位列表”的接口（数组里的对象带标题类字段）和翻页控件，
 * 帮助为新站点写适配器。只读，不点击、不提交。
 */
const TITLE_KEYS = /^(title|name|positionTitle|positionName|jobName|jobTitle|postName|postTitle|position|job_name)$/i;

interface Candidate {
  url: string;
  method: string;
  body?: string;
  path: string;
  length: number;
  keys: string[];
  sample: string;
  total?: unknown;
}

function findArrays(node: unknown, path = "$", depth = 0, out: { path: string; arr: Record<string, unknown>[] }[] = []) {
  if (depth > 5 || node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    if (node.length >= 3 && node.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const objs = node as Record<string, unknown>[];
      if (Object.keys(objs[0]!).some((k) => TITLE_KEYS.test(k) && typeof objs[0]![k] === "string")) {
        out.push({ path, arr: objs });
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(node)) findArrays(v, `${path}.${k}`, depth + 1, out);
  return out;
}

function findTotal(node: unknown): unknown {
  if (!node || typeof node !== "object") return undefined;
  for (const [k, v] of Object.entries(node)) {
    if (/^(total|totalCount|count|totalNum|recordCount|allCount)$/i.test(k) && typeof v === "number") return v;
  }
  for (const v of Object.values(node)) {
    const t = typeof v === "object" ? findTotal(v) : undefined;
    if (t !== undefined) return t;
  }
  return undefined;
}

const url = process.argv[2];
if (!url) {
  console.log("用法: discover <url>");
  process.exit(1);
}

const found: Candidate[] = [];
try {
  await withPage(
    url,
    async (page) => {
      await page.waitForTimeout(4000);
      // 可选：依次点击给定文字的元素（如“职位”），用于进入单页应用里的列表页
      for (const text of (process.argv[3] ?? "").split(",").filter(Boolean)) {
        try {
          await page.getByText(text, { exact: false }).first().click({ timeout: 4000 });
          await page.waitForTimeout(3500);
          console.log(`已点击「${text}」→ ${page.url()}`);
        } catch {
          console.log(`未找到可点击的「${text}」`);
        }
      }
      const pager = await page.evaluate(() =>
        [...document.querySelectorAll("[class*=pagination], [class*=Pagination], [class*=pager], [class*=next], [class*=Next]")]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .slice(0, 8)
          .map((e) => `${e.tagName.toLowerCase()}.${(e as HTMLElement).className.toString().trim().replace(/\s+/g, ".")} :: ${(e as HTMLElement).innerText.slice(0, 24).replace(/\n/g, " ")}`),
      );
      console.log(`页面标题: ${await page.title()}`);
      console.log("翻页控件:", pager.length ? "\n  " + pager.join("\n  ") : "未发现");
    },
    {
      beforeNavigate: (page) =>
        page.on("response", async (res) => {
          try {
            if (!(res.headers()["content-type"] ?? "").includes("json")) return;
            const json = JSON.parse(await res.text()) as unknown;
            if (process.env.DISCOVER_ALL) {
              console.log(`[json] ${res.request().method()} ${res.url().slice(0, 130)} ${res.request().postData()?.slice(0, 120) ?? ""}`);
            }
            for (const { path, arr } of findArrays(json)) {
              const first = arr[0]!;
              const titleKey = Object.keys(first).find((k) => TITLE_KEYS.test(k))!;
              found.push({
                url: res.url().slice(0, 140),
                method: res.request().method(),
                body: res.request().postData()?.slice(0, 160),
                path,
                length: arr.length,
                keys: Object.keys(first).slice(0, 14),
                sample: String(first[titleKey]).slice(0, 40),
                total: findTotal(json),
              });
            }
          } catch {
            /* 非 JSON 或不可读 */
          }
        }),
    },
  );
} catch (e) {
  console.error(`失败: ${(e as Error).message.split("\n")[0]}`);
} finally {
  await closeBrowser();
}

console.log(`\n疑似岗位列表接口 ${found.length} 个:`);
for (const c of found) {
  console.log(`- ${c.method} ${c.url}\n    数组 ${c.path} 共 ${c.length} 条，总数 ${c.total ?? "?"}，示例「${c.sample}」\n    字段: ${c.keys.join(", ")}${c.body ? `\n    请求体: ${c.body}` : ""}`);
}
