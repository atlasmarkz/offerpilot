import { genericAdapter } from "./generic";
import type { SiteAdapter } from "./types";

/**
 * 站点适配器，按顺序匹配：先放各公司的专用适配器，最后用通用适配器兜底。
 * 现在还没有专用适配器，所以所有页面都走通用适配器（按字段标签识别）。
 */
export const adapters: SiteAdapter[] = [genericAdapter];

export function findAdapter(url: string): SiteAdapter | undefined {
  return adapters.find((a) => a.matches.some((re) => re.test(url)));
}
