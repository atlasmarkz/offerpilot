import { demoAdapter } from "./demo";
import type { SiteAdapter } from "./types";

export const adapters: SiteAdapter[] = [demoAdapter];

export function findAdapter(url: string): SiteAdapter | undefined {
  return adapters.find((a) => a.matches.some((re) => re.test(url)));
}
