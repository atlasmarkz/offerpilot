/** @type {import('next').NextConfig} */
export default {
  // shared 包直接以 TypeScript 源码发布
  transpilePackages: ["@offerpilot/shared"],
  experimental: {
    // PDF.js 要在运行时按路径找 worker，不能被打进 webpack 包里
    serverComponentsExternalPackages: ["pdfjs-dist", "unpdf", "mammoth"],
    // worker 是运行时动态加载的，Vercel 的依赖追踪看不到它，要手动带上，否则线上解析 PDF 会报找不到 pdf.worker.mjs
    outputFileTracingIncludes: {
      "/api/resume": ["../../node_modules/pdfjs-dist/legacy/build/**", "../../node_modules/pdfjs-dist/package.json"],
    },
  },
};
