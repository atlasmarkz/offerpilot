import type { Metadata, Viewport } from "next";
import { PwaClient } from "../components/PwaClient";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "OfferPilot · 校招岗位匹配",
  description: "填写画像，筛出你真正能投的校招与实习岗位",
  applicationName: "OfferPilot",
  // iOS 添加到主屏幕后全屏打开（apple-mobile-web-app-capable）；图标由 app/apple-icon.png 生成 apple-touch-icon。
  // 状态栏用 default：浅色背景上深色文字，页面从状态栏下方开始，不会被挡住。
  appleWebApp: { capable: true, title: "OfferPilot", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 铺满刘海屏，安全区域由 globals.css 里的 env(safe-area-inset-*) 让开
  viewportFit: "cover",
  // 和顶栏（--surface）同色
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181d29" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaClient />
      </body>
    </html>
  );
}
