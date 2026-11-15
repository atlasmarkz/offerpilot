import type { Channel } from "@offerpilot/shared";
import { bossAdapter } from "./boss";
import type { JobBoardAdapter } from "./types";

/** 已接入的招聘平台。猎聘在第二期。 */
export const JOB_BOARDS: Partial<Record<Channel, JobBoardAdapter>> = { boss: bossAdapter };

/** 平台站点的网站权限（开启平台时才申请，见 wxt.config.ts 的 optional_host_permissions）。 */
export const BOARD_ORIGINS: Record<Channel, string[]> = {
  boss: ["https://www.zhipin.com/*"],
  liepin: ["https://www.liepin.com/*", "https://c.liepin.com/*"],
};

/** 平台的默认搜索页（用户没填自己的搜索链接时打开）。 */
export const DEFAULT_SEARCH: Record<Channel, string> = {
  boss: "https://www.zhipin.com/web/geek/jobs",
  liepin: "https://www.liepin.com/zhaopin/",
};

export function boardFor(url: string): JobBoardAdapter | undefined {
  return Object.values(JOB_BOARDS).find((a) => a?.matches.some((re) => re.test(url)));
}
