import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  // Docker 部署时设 NEXT_OUTPUT=standalone：只打包运行需要的文件，镜像里不用装整个 node_modules。
  // Vercel 上不设，行为不变。
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // shared 包直接以 TypeScript 源码发布
  transpilePackages: ["@offerpilot/shared"],
  // Service Worker 脚本每次都要回源检查，否则发版后手机上可能一直跑旧的缓存规则
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  experimental: {
    // monorepo：依赖装在仓库根目录的 node_modules，追踪依赖要从根目录算起，standalone 包才完整
    outputFileTracingRoot: resolve(here, "../.."),
    // PDF.js 要在运行时按路径找 worker，不能被打进 webpack 包里
    serverComponentsExternalPackages: ["pdfjs-dist", "unpdf", "mammoth"],
    // worker 是运行时动态加载的，Vercel 的依赖追踪看不到它，要手动带上，否则线上解析 PDF 会报找不到 pdf.worker.mjs
    outputFileTracingIncludes: {
      "/api/resume": ["../../node_modules/pdfjs-dist/legacy/build/**", "../../node_modules/pdfjs-dist/package.json"],
    },
  },
};
