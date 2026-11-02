/** @type {import('next').NextConfig} */
export default {
  // shared 包直接以 TypeScript 源码发布
  transpilePackages: ["@offerpilot/shared"],
  // PDF.js 要在运行时按路径找 worker，不能被打进 webpack 包里
  experimental: { serverComponentsExternalPackages: ["pdfjs-dist", "unpdf", "mammoth"] },
};
