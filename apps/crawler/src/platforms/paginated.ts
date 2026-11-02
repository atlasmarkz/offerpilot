import type { Page, Response } from "playwright-core";
import { withPage } from "../browser";
import type { RawPosting, SourceAdapter } from "../pipeline";
import type { SourceConfig } from "../sources";

/**
 * 通用“点下一页 + 拦截列表接口”数据源。
 * 新增一个站点只需描述：哪个响应是岗位列表、怎么解析、下一页按钮是什么、怎么映射成岗位。
 */
export interface PaginatedSpec<T> {
  isListResponse(res: Response): boolean;
  parse(body: unknown): { items: T[]; total?: number };
  idOf(item: T): string;
  /** 可点击的“下一页”按钮；到末页时它应当不再匹配 */
  nextButton: string;
  map(item: T, cfg: SourceConfig): Record<string, unknown>;
  /** 可选：丢弃不要的条目（如同一入口里混着社招） */
  keep?(item: T, cfg: SourceConfig): boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(200);
  }
  return cond();
}

/** 点“下一页”并等新数据到达；返回是否成功翻页。 */
async function goNext(page: Page, selector: string, size: () => number): Promise<boolean> {
  const next = page.locator(selector);
  if ((await next.count()) === 0) return false;
  const before = size();
  try {
    await next.first().click({ timeout: 1500 });
  } catch {
    // 被浮层挡住等情况：改用页面脚本直接触发点击
    try {
      await next.first().evaluate((el) => (el as HTMLElement).click());
    } catch {
      return false;
    }
  }
  return waitFor(() => size() > before, 10000);
}

export function paginatedSource<T>(cfg: SourceConfig, spec: PaginatedSpec<T>): SourceAdapter {
  return {
    id: cfg.id,
    async fetchPostings(): Promise<RawPosting[]> {
      const byId = new Map<string, T>();
      let total: number | undefined;

      await withPage(
        cfg.url,
        async (page) => {
          await waitFor(() => byId.size > 0, 8000);
          let pages = 1;
          try {
            while (byId.size < cfg.maxJobs) {
              let ok = await goNext(page, spec.nextButton, () => byId.size);
              if (!ok) ok = await goNext(page, spec.nextButton, () => byId.size); // 偶发漏响应，重试一次
              if (!ok) break;
              pages++;
              await sleep(600);
            }
          } catch (e) {
            // 翻页中途出错：保留已取得的数据，不整体失败
            console.warn(`[${cfg.id}] 翻页中断: ${(e as Error).message.split("\n")[0]}`);
          }
          console.log(`[${cfg.id}] 翻了 ${pages} 页，取得 ${byId.size}/${total ?? "?"} 条`);
        },
        {
          beforeNavigate: (page) =>
            page.on("response", async (res) => {
              if (!spec.isListResponse(res)) return;
              try {
                const parsed = spec.parse(JSON.parse(await res.text()));
                total = parsed.total ?? total;
                for (const item of parsed.items) byId.set(spec.idOf(item), item);
              } catch {
                /* 预检请求等空响应、非 JSON 响应忽略 */
              }
            }),
        },
      );

      if (byId.size === 0) throw new Error("没有捕获到岗位数据（入口地址可能不对，或页面结构变了）");

      const candidates = [...byId.values()]
        .filter((item) => spec.keep?.(item, cfg) ?? true)
        .slice(0, cfg.maxJobs)
        .map((item) => spec.map(item, cfg));
      return [
        {
          sourceUrl: cfg.url,
          applyUrl: cfg.url,
          text: "",
          fetchedAt: new Date().toISOString(),
          companyId: cfg.companyId,
          companyType: cfg.companyType,
          candidates,
        },
      ];
    },
  };
}
