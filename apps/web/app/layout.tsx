import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferPilot · 校招岗位匹配",
  description: "填写画像，筛出你真正能投的校招与实习岗位",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
