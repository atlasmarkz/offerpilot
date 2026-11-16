import type { MetadataRoute } from "next";

/**
 * PWA 清单：Next 会生成 /manifest.webmanifest 并自动在 <head> 里加 <link rel="manifest">。
 * 颜色取自 globals.css 的设计令牌：背景 = --bg，主题色 = --surface（和顶栏同色，状态栏看起来连成一片）。
 * 手机上最常用的是看投递进度，所以从主屏幕打开直接进投递看板。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OfferPilot · 校招投递",
    short_name: "OfferPilot",
    description: "校招 / 实习投递进度看板，手机上随时看投递进度、浏览岗位",
    lang: "zh-CN",
    start_url: "/board",
    scope: "/",
    display: "standalone",
    background_color: "#f3f5fa",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "投递看板", url: "/board" },
      { name: "岗位", url: "/app" },
    ],
  };
}
