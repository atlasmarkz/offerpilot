import { demoAdapter } from "./demo";
import { genericAdapter } from "./generic";
import type { SiteAdapter } from "./types";

export const adapters: SiteAdapter[] = [demoAdapter, genericAdapter] // 通用适配器放最后兜底;

export function findAdapter(url: string): SiteAdapter | undefined {
  return adapters.find((a) => a.matches.some((re) => re.test(url)));
}
